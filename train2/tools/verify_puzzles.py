"""Engine verification of the puzzle candidates (BLUEPRINT 2.2).  Resumable: every decision is recomputed from the JSONL cache
train2/cache/pz_evals.jsonl (t2common.bulk, depth 16, time cap 4 s, multipv 3, one-thread engines with watchdog), so a killed run
loses nothing and a finished one costs seconds.

Waves: candidates are tried per (group, rating band) cell in pool order; only as many as the cell still needs (x1.6) are searched,
one solver position at a time (a candidate that fails step 1 is never searched further).  A puzzle that matches several groups
is counted in the first cell that accepts it (cells are processed rarest first); it still lists all its groups.

Checks: PZ1 invalid / illegal / game over, PZ2 solution not best (more than 2 win-% below), PZ3 a second solution (gap < 12;
the last move may have several mates = `alt`), PZ4 pay-off < 75 (defence < 40) or time-out, PZ5 undefended only capture at
rating >= 1300, PZ6 duplicate id / start-position posKey (pool, lesson cards, own-game cards), PZ7 explanation fails the lint,
plus the one-puzzle-per-game rule (PZG).  Then a 2 % sample is re-searched at depth 22 / 20 s.

    verify_puzzles.py [--max-minutes 45] [--workers 5] [--no-sample] [--report-only]
Writes train2/cache/pz_accepted.json (ids, groups, why, alt) and train2/reports/puzzles.verify.txt.
Exit codes: 0 ok (or time limit reached: run again), 3 the depth-22 sample failed more than 2 %.
"""
import argparse, json, math, os, random, sys, time
from collections import Counter, defaultdict
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import chess
import t2common as tc
import fetch_puzzles2 as fp
import explain as ex

CACHE = tc.CACHE_DIR
RAW = fp.RAW
EVALS = CACHE / "pz_evals.jsonl"
EVALS22 = CACHE / "pz_evals22.jsonl"
ACCEPTED = CACHE / "pz_accepted.json"
REPORT = tc.REPORTS_DIR / "puzzles.verify.txt"
DEPTH, TCAP, MPV = 16, 4.0, 3
SAMPLE_DEPTH, SAMPLE_CAP = 22, 20.0
QUOTA = {b: q for b, (_l, _h, q) in enumerate(fp.BANDS)}
LOW_PAYOFF_TAGS = {"defensiveMove", "equality"}


# ---------------------------------------------------------------- per-candidate logic
def load_candidates():
    out = []
    with open(RAW, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out


def external_keys():
    """posKeys of lesson cards and own-game cards that exist already (PZ6)."""
    keys = set()
    for name in ("train2.json", "mine2.json"):
        p = tc.DATA_DIR / name
        if not p.exists():
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue

        def walk(o):
            if isinstance(o, dict):
                if isinstance(o.get("fen"), str):
                    keys.add(tc.pos_key(o["fen"]))
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk({k: v for k, v in d.items() if k != "rows"})
    return keys


class Prep:
    """PZ1 / PZ5 on one candidate; positions where the solver is to move."""

    def __init__(self, rec):
        self.rec = rec
        self.moves = rec["moves"].split()
        self.err = None
        self.fens = []          # fen before each solver move
        self.start = None
        try:
            b = chess.Board(rec["fen"])
            if not b.is_valid():
                raise ValueError("invalid fen")
            for i, u in enumerate(self.moves):
                mv = chess.Move.from_uci(u)
                if mv not in b.legal_moves:
                    raise ValueError(f"illegal move {u}")
                if i % 2 == 1:
                    self.fens.append(b.fen())
                b.push(mv)
                if i == 0:
                    self.start = b.copy()
                    if b.is_game_over():
                        raise ValueError("game over after the set-up move")
            self.final = b
        except Exception as e:
            self.err = ("PZ1", str(e))
            return
        # PZ5 mis-rated triviality
        if rec["rating"] >= 1300:
            b0 = self.start
            mv = chess.Move.from_uci(self.moves[1])
            if b0.is_capture(mv) and not b0.is_en_passant(mv):
                caps = [m for m in b0.legal_moves if b0.is_capture(m)]
                if len(caps) == 1 and not b0.is_attacked_by(not b0.turn, mv.to_square):
                    self.err = ("PZ5", "undefended piece, the only capture")


def check_step(entries, sol_uci, board, last, tags, solver_ok_only=False):
    """entries: bulk result (list of {m,cp,pv,d}) for the position `board` (solver to move).
    -> (rule|None, detail, alt_list, w_sol)"""
    if entries == "timeout":
        return "PZ4", "time-out", [], None
    if not entries:
        return "PZ2", "no engine lines", [], None
    by = {e["m"]: e for e in entries}
    if sol_uci not in by:
        return "PZ2", "solution not among the engine's top 3", [], None
    w = {m: tc.win_pct(e["cp"]) for m, e in by.items()}
    wbest = max(w.values())
    ws = w[sol_uci]
    if wbest - ws > 2:
        return "PZ2", f"solution {wbest - ws:.1f} below the best", [], ws
    alt = []
    sol_mate = False
    if last:
        bb = board.copy()
        bb.push(chess.Move.from_uci(sol_uci))
        sol_mate = bb.is_checkmate()
    others = []
    for m in by:
        if m == sol_uci:
            continue
        if sol_mate:
            bb = board.copy()
            bb.push(chess.Move.from_uci(m))
            if bb.is_checkmate():
                alt.append(m)
                continue
        others.append(w[m])
    if others and ws - max(others) < 12:
        return "PZ3", f"second solution (gap {ws - max(others):.1f})", [], ws
    return None, "", alt, ws


def verdict(pr, cache, depth=DEPTH, tcap=TCAP):
    """-> ("fail", rule, detail) | ("pending", fen) | ("ok", alt, min_gap_info)"""
    if pr.err:
        return ("fail",) + pr.err
    rec = pr.rec
    tags = set(rec["themes"])
    alt = []
    n = len(pr.fens)
    for k, fen in enumerate(pr.fens):
        r = cache.find(fen, depth, MPV)
        if r is None:
            return ("pending", fen)
        sol = pr.moves[1 + 2 * k]
        rule, detail, a, ws = check_step(r, sol, chess.Board(fen), k == n - 1, tags)
        if rule:
            return ("fail", rule, detail)
        if k == n - 1:
            need = 40 if tags & LOW_PAYOFF_TAGS else 75
            if ws < need:
                return ("fail", "PZ4", f"pay-off {ws:.0f} < {need}")
            alt = a
    return ("ok", alt)


def make_why(pr, group):
    rec = pr.rec
    mv = pr.moves
    start_fen = pr.start.fen()
    for g in ([group] if group else []) + [None]:
        try:
            w = ex.explain(rec["fen"], mv, rec["themes"], g)
        except Exception as e:
            w = ""
        if w and not ex.lint_why(w, start_fen, mv[1:]):
            return w
    return None


# ---------------------------------------------------------------- the sweep
def sweep(cands, preps, cache, ext_keys, want_pending=True):
    by_cell = defaultdict(list)
    for rec in cands:
        b = fp.band_of(rec["rating"])
        for g in rec["cells"]:
            by_cell[(g, b)].append(rec)
    order = sorted(by_cell, key=lambda c: (len(by_cell[c]) / max(1, QUOTA[c[1]]), fp.GROUP_IDS.index(c[0]), c[1]))
    used, games, posk = set(), set(), set(ext_keys)
    acc = {}                   # id -> dict
    fails = Counter()          # rule -> n   (each candidate counted once, at its first failure)
    fail_seen = set()
    pending, per_cell = [], {}
    for cell in order:
        g, b = cell
        quota = QUOTA[b]
        ok, req = 0, 0
        limit = int(quota * 1.2) + 4
        for rec in by_cell[cell]:
            if ok >= quota:
                break
            pid = rec["id"]
            if pid in used:
                continue
            pr = preps[pid]
            v = verdict(pr, cache)
            if v[0] == "fail":
                if pid not in fail_seen:
                    fail_seen.add(pid)
                    fails[v[1]] += 1
                continue
            if v[0] == "pending":
                if req < limit - ok:
                    pending.append(v[1])
                    req += 1
                continue
            if rec["game"] in games:
                if pid not in fail_seen:
                    fail_seen.add(pid)
                    fails["PZG"] += 1
                continue
            pk = tc.pos_key(pr.start)
            if pk in posk:
                if pid not in fail_seen:
                    fail_seen.add(pid)
                    fails["PZ6"] += 1
                continue
            why = make_why(pr, g)
            if why is None:
                if pid not in fail_seen:
                    fail_seen.add(pid)
                    fails["PZ7"] += 1
                continue
            used.add(pid)
            games.add(rec["game"])
            posk.add(pk)
            ok += 1
            groups = [g] + [x for x in rec["groups"] if x != g]
            acc[pid] = {"id": pid, "fen": rec["fen"], "moves": rec["moves"], "rating": rec["rating"], "groups": groups,
                        "why": why, "alt": v[1], "cell": [g, b], "themes": rec["themes"]}
        per_cell[cell] = (ok, quota)
    return acc, fails, pending, per_cell, fail_seen


# ---------------------------------------------------------------- report
def write_report(acc, fails, per_cell, examined, timings, sample, notes):
    gids = fp.GROUP_IDS
    lines = ["Puzzle verification report (BLUEPRINT 2.2)", f"built {time.strftime('%Y-%m-%d %H:%M')}", ""]
    lines.append(f"candidates examined by the engine pipeline: {examined}   accepted: {len(acc)}")
    lines.append("rejections by rule (each candidate counted once, at its first failure): " +
                 ", ".join(f"{k} {v}" for k, v in sorted(fails.items())) if fails else "no rejections")
    lines.append("  PZ1 invalid/illegal/over | PZ2 solution not best | PZ3 second solution | PZ4 pay-off or time-out | "
                 "PZ5 trivial capture | PZ6 duplicate position | PZ7 explanation | PZG same game")
    lines.append("")
    lines.append("accepted per group x rating band (wanted in the last row):")
    head = f"{'group':12s}" + "".join(f"{lo}-{hi - 1:>5} " for lo, hi, _ in fp.BANDS) + "  total"
    lines.append(head)
    tot = [0] * len(fp.BANDS)
    for g in gids:
        row = []
        for b in range(len(fp.BANDS)):
            n = per_cell.get((g, b), (0, 0))[0]
            row.append(n)
            tot[b] += n
        lines.append(f"{g:12s}" + "".join(f"{n:>10d} " for n in row) + f"  {sum(row)}")
    lines.append(f"{'TOTAL':12s}" + "".join(f"{n:>10d} " for n in tot) + f"  {sum(tot)}")
    lines.append(f"{'wanted':12s}" + "".join(f"{q * 16:>10d} " for _l, _h, q in fp.BANDS) + f"  {sum(q for _l, _h, q in fp.BANDS) * 16}")
    short = [(g, b, per_cell[(g, b)]) for g in gids for b in range(len(fp.BANDS)) if per_cell.get((g, b), (0, 0))[0] < QUOTA[b]]
    lines.append("")
    lines.append("cells below the wanted number (the group has no more candidates passing the Lichess filters, or the engine rejected them):")
    for g, b, (ok, q) in short:
        lines.append(f"  {g} {fp.BANDS[b][0]}-{fp.BANDS[b][1] - 1}: {ok} of {q}")
    if not short:
        lines.append("  none")
    lines.append("")
    lines.append("timings: " + timings)
    if sample is not None:
        lines.append("")
        lines.append(sample)
    for n in notes:
        lines.append(n)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- depth-22 sample
def run_sample(acc, preps, workers, max_minutes, log):
    ids = sorted(acc)
    random.Random(22).shuffle(ids)
    k = max(1, math.ceil(len(ids) * 0.02))
    chosen = ids[:k]
    fens = []
    for pid in chosen:
        fens += preps[pid].fens
    res = tc.bulk(fens, EVALS22, depth=SAMPLE_DEPTH, time_cap=SAMPLE_CAP, multipv=MPV, workers=workers,
                  max_minutes=max_minutes, progress_every=20, log=log)
    cache = tc.JsonlCache(EVALS22)
    failed, done, tout = [], 0, 0
    for pid in chosen:
        v = verdict(preps[pid], cache, depth=SAMPLE_DEPTH)
        if v[0] == "pending":
            continue
        done += 1
        if v[0] == "fail":
            if v[1] == "PZ4" and "time-out" in v[2]:
                tout += 1
                continue
            if v[1] in ("PZ2", "PZ3"):
                failed.append((pid, v[1], v[2]))
    txt = (f"depth-22 sample (cap {SAMPLE_CAP:.0f} s): {done} of {k} sampled puzzles re-searched, {len(failed)} fail PZ2/PZ3 "
           f"({100 * len(failed) / max(1, done):.1f} %), {tout} time-outs ignored")
    if failed:
        txt += "\n  " + "; ".join(f"{p} {r} ({d})" for p, r, d in failed)
    return txt, (len(failed) / max(1, done)), done, k


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=45)
    ap.add_argument("--workers", type=int, default=int(os.environ.get("T2_WORKERS", 5)))
    ap.add_argument("--no-sample", action="store_true")
    ap.add_argument("--report-only", action="store_true", help="no engine work, use what is cached")
    a = ap.parse_args()
    log = lambda s: print(s, file=sys.stderr, flush=True)
    t0 = time.time()
    deadline = t0 + a.max_minutes * 60
    cands = load_candidates()
    preps = {r["id"]: Prep(r) for r in cands}
    ext = external_keys()
    notes = []
    cache = tc.JsonlCache(EVALS)
    searched_total = timeouts = 0
    waves = 0
    stopped = False
    while True:
        acc, fails, pending, per_cell, seen = sweep(cands, preps, cache, ext)
        short = sum(max(0, q - ok) for ok, q in per_cell.values())
        log(f"sweep {waves}: accepted {len(acc)}, still wanted {short}, pending positions {len(pending)}, "
            f"{(time.time() - t0) / 60:.1f} min")
        if not pending or a.report_only:
            break
        left = (deadline - time.time()) / 60
        if left < 0.3:
            stopped = True
            break
        res = tc.bulk(pending, EVALS, depth=DEPTH, time_cap=TCAP, multipv=MPV, workers=a.workers, max_minutes=left,
                      progress_every=200, log=log)
        waves += 1
        searched_total += res["searched"]
        timeouts += res["timeouts"]
        cache = tc.JsonlCache(EVALS)
        if res["stopped_by_time"]:
            stopped = True
            acc, fails, pending, per_cell, seen = sweep(cands, preps, cache, ext)
            break
        if res["searched"] == 0 and res["left"]:
            log("bulk made no progress; stopping")
            stopped = True
            break
    done_all = not pending
    elapsed = time.time() - t0
    ACCEPTED.write_text(json.dumps({"complete": done_all and not stopped, "rows": list(acc.values())}, separators=(",", ":")), encoding="utf-8")
    sample_txt, rate = None, 0.0
    if done_all and not a.no_sample and not a.report_only and acc:
        left = max(2.0, (deadline - time.time()) / 60)
        sample_txt, rate, nd, nk = run_sample(acc, preps, a.workers, left, log)
    timings = (f"this run {elapsed / 60:.1f} min, {searched_total} positions searched at depth {DEPTH} (cap {TCAP:.0f} s), "
               f"{timeouts} time-outs; cache {EVALS.name} {len(cache.by_fen)} positions")
    if stopped:
        notes.append("NOT COMPLETE: the time limit was reached; run verify_puzzles.py again to continue (nothing is lost).")
    write_report(acc, fails, per_cell, len(seen), timings, sample_txt, notes)
    print(open(REPORT, encoding="utf-8").read())
    if sample_txt is not None and rate > 0.02:
        print("STOP: more than 2 % of the depth-22 sample fails PZ2/PZ3 - report to the lead", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
