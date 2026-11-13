"""Opening statistics from Lichess (what 1200-1600 players actually play) and masters model games, for the
Openings 2 courses. Runs in the GitHub job "Opening statistics" (needs the LICHESS_TOKEN repository secret;
the key is never printed or stored).

Reads data/courses2.json (compiled by openings2/tools/compile_courses2.py; override with --courses PATH or the
environment variable COURSES2), walks each course's move tree (our course moves; the opponent's course replies plus
every reply with at least OPP_SHARE of the games), and keeps every statistic already in data/explorer.json (old
courses and old traps/extra/ext/models stay untouched). New: for each chapter's branch position (where its lines stop
sharing moves) the top masters games won by the course's side are added to courses.<id>.models, each with
"source": "lichess-masters:<id>", moves (SAN) and "ok" (engine-approved alternatives for our moves).

Options:
  --dry-run        no token, no network, nothing written: lists the positions that would be fetched
  --courses PATH   courses2.json to read          --explorer PATH   stats file to read and write
Without LICHESS_TOKEN (and no --dry-run) it prints a note and exits 0 without touching anything.

Output: data/explorer.json
  stats:   {position key: {"n": games, "m": [[san, games, score for the side to move], ...]}}
  courses: {course_id: {"traps", "extra", "ext" (old, kept), "models": [games],
                         "mastersDone": {branch position key: [game ids]}  (what was already asked of Lichess)}}
"""
import argparse, io, json, os, subprocess, sys, time, urllib.parse
from collections import deque
from pathlib import Path
import chess, chess.engine, chess.pgn

ROOT = Path(__file__).parent
DATA = ROOT / "data"
TOKEN = os.environ.get("LICHESS_TOKEN", "")
LICHESS = "https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid&ratings=1200,1400,1600&moves=10&topGames=0&recentGames=0&fen="
MASTERS = "https://explorer.lichess.ovh/masters?moves=0&topGames=15&fen="
MASTERS_PGN = "https://explorer.lichess.ovh/masters/pgn/"
MAX_PLY = 30            # how deep the statistics tree goes (course lines run up to about ply 28)
MAX_POS = 400           # positions visited per course at most
BUDGET = 85 * 60        # stop asking Lichess after this many seconds; finish with what is saved
START = time.time()
MIN_GAMES = 40          # below this the statistics are too thin to use
OPP_SHARE = 0.06        # opponent replies at least this common are followed
MASTERS_PER_CHAPTER = 2  # model games kept per chapter branch position
MASTERS_BACK = 3        # no masters games there? try up to this many positions 2 plies earlier
BRANCH_MAX_PLY = 16     # the branch position is at most this deep


def key(board):
    return " ".join(board.fen().split()[:3]) + " -"   # same key as the app (no en-passant square)


def get(url, tries=6):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-w", "\n%{http_code}", "-A", "personal chess trainer",
                            "-H", f"Authorization: Bearer {TOKEN}", url], capture_output=True)
        body, _, code = r.stdout.decode("utf-8", "replace").rpartition("\n")
        if code == "200":
            time.sleep(1.0)            # about one question per second keeps Lichess from pausing us
            return body
        if code == "429":
            print("rate limited, waiting 60 s", flush=True); time.sleep(60); continue
        if code in ("401", "403"):
            sys.exit("Lichess rejected the key (check the LICHESS_TOKEN secret)")
        time.sleep(3 * (i + 1))
    return None


def course_maps(c):
    """position key -> our course moves / the opponent's course moves (by position, so transpositions count)"""
    mine, theirs = {}, {}
    for n in c["nodes"].values():
        (mine if n["mine"] else theirs).setdefault(n["k"], set()).add(n["san"])
    return mine, theirs


def branch_positions(c):
    """One per chapter: the position where its (non-punish) lines stop sharing moves, at most BRANCH_MAX_PLY deep
    (a one-line chapter: the end of that line, capped). Returns [(chapter id, [uci moves from the start])]."""
    byid = {l["id"]: l for l in c["lines"]}
    res = []
    for ch in c.get("chapters", []):
        ls = [byid[i] for i in ch["lines"] if i in byid]
        paths = [l["nodes"] for l in ls if l.get("kind") != "punish"] or [l["nodes"] for l in ls]
        if not paths: continue
        n = min(len(p) for p in paths)
        common = 0
        while common < n and all(p[common] == paths[0][common] for p in paths): common += 1
        if len(paths) == 1: common = n
        common = min(common, BRANCH_MAX_PLY)
        res.append((ch["id"], [c["nodes"][nid]["uci"] for nid in paths[0][:common]]))
    return res


def board_after(ucis):
    b = chess.Board()
    for u in ucis: b.push_uci(u)
    return b


def main(argv=None):
    ap = argparse.ArgumentParser(description="Lichess statistics and masters model games for the Openings 2 courses")
    ap.add_argument("--courses", default=os.environ.get("COURSES2") or str(DATA / "courses2.json"))
    ap.add_argument("--explorer", default=str(DATA / "explorer.json"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    dry = args.dry_run
    if not TOKEN and not dry:
        print("LICHESS_TOKEN is not set: nothing fetched, explorer.json left unchanged.")
        return 0
    if not Path(args.courses).exists():
        print(f"{args.courses} not found (compile it first with openings2/tools/compile_courses2.py): nothing to do.")
        return 0
    courses = json.loads(Path(args.courses).read_text(encoding="utf-8")).get("courses", [])
    expath = Path(args.explorer)
    old = json.loads(expath.read_text(encoding="utf-8")) if expath.exists() else {}
    stats = dict(old.get("stats", {}))      # reuse what earlier runs fetched: each run continues where the last stopped
    out = dict(old.get("courses", {}))
    state = {"eng": None}
    evals = {}
    would = []                              # dry run: what is not cached

    def engine():
        if state["eng"] is None:
            from engine_path import find_engine
            state["eng"] = chess.engine.SimpleEngine.popen_uci(str(find_engine(ROOT)))
            state["eng"].configure({"Threads": max(1, (os.cpu_count() or 2)), "Hash": 256})
        return state["eng"]

    def best_move(board, depth=14):
        k = key(board)
        if k not in evals:
            info = engine().analyse(board, chess.engine.Limit(depth=depth))
            evals[k] = info["pv"][0].uci() if info.get("pv") else None
        return evals[k]

    def explore(board):
        k = key(board)
        if k in stats: return stats[k]
        if dry:
            would.append(board.fen()); return None
        if time.time() - START > BUDGET: return None      # out of time: use only what is saved
        body = get(LICHESS + urllib.parse.quote(board.fen()))
        if body is None: return None
        d = json.loads(body)
        n = d["white"] + d["draws"] + d["black"]
        mv = []
        for m in d.get("moves", []):
            t = m["white"] + m["draws"] + m["black"]
            if not t: continue
            win = m["white"] if board.turn == chess.WHITE else m["black"]
            mv.append([m["san"], t, round((win + m["draws"] / 2) / t, 3)])
        stats[k] = {"n": n, "m": mv}
        return stats[k]

    for c in courses:
        cid = c["id"]
        me = chess.WHITE if c["side"] == "white" else chess.BLACK
        mine, theirs = course_maps(c)

        # 1. statistics: breadth-first over the course and the popular replies around it
        seen, fetched = set(), 0
        q = deque([(chess.Board(), 0)])
        while q and fetched < MAX_POS:
            b, ply = q.popleft()
            k = key(b)
            if k in seen or ply > MAX_PLY: continue
            seen.add(k)
            s = explore(b); fetched += 1
            if b.turn == me:
                nxt = list(mine.get(k, []))
                if not nxt and s and s["n"] >= MIN_GAMES and not dry:      # off the course: the engine's move
                    bm = best_move(b)
                    nxt = [b.san(chess.Move.from_uci(bm))] if bm else []
            else:
                nxt = list(theirs.get(k, []))                               # the course's own replies always
                if s and s["n"] >= MIN_GAMES:
                    nxt += [san for san, t, _ in s["m"] if t / s["n"] >= OPP_SHARE][:5]
                elif not nxt:
                    continue
            for san in dict.fromkeys(nxt):
                try:
                    b2 = b.copy(); b2.push_san(san)
                except ValueError:
                    continue
                q.append((b2, ply + 1))
        print(f"{cid}: {fetched} positions walked, {len(would)} uncached so far" if dry else f"{cid}: {fetched} positions", flush=True)

        # 2. masters model games at each chapter's branch position
        rec = out.setdefault(cid, {"traps": [], "extra": [], "ext": {}, "models": []})
        rec.setdefault("models", [])
        done = rec.setdefault("mastersDone", {})
        have = {m["id"] for m in rec["models"]}
        want = "white" if me == chess.WHITE else "black"
        for chap, ucis in branch_positions(c):
            cands = [board_after(ucis[:len(ucis) - 2 * i]) for i in range(MASTERS_BACK + 1) if len(ucis) - 2 * i >= 4]
            games = []
            for b in cands:
                k = key(b)
                if k in done:
                    if dry: print(f"  [{chap}] masters cached ({len(done[k])} games) {k}")
                    if done[k]: break
                    continue
                if dry:
                    print(f"  [{chap}] would fetch masters {b.fen()}"); continue
                if time.time() - START > BUDGET: break
                body = get(MASTERS + urllib.parse.quote(b.fen()))
                if body is None: continue
                games = [g for g in json.loads(body).get("topGames", []) if g.get("winner") == want]
                games.sort(key=lambda g: -((g["white"].get("rating") or 0) + (g["black"].get("rating") or 0)))
                done[k] = [g["id"] for g in games[:MASTERS_PER_CHAPTER]]
                if games: break
            added = 0
            for gm in games:
                if added >= MASTERS_PER_CHAPTER: break
                if gm["id"] in have: continue
                pgn = get(MASTERS_PGN + gm["id"])
                if not pgn: continue
                game = chess.pgn.read_game(io.StringIO(pgn))
                gb = game.board(); moves, ok = [], {}
                for ply, mv in enumerate(game.mainline_moves()):
                    if ply >= 40: break
                    san = gb.san(mv)
                    if gb.turn == me and ply >= 4:
                        infos = engine().analyse(gb, chess.engine.Limit(depth=14), multipv=3)
                        top = infos[0]["score"].pov(me).score(mate_score=10000)
                        good = {gb.san(x["pv"][0]) for x in infos if "pv" in x and top - x["score"].pov(me).score(mate_score=10000) <= 40}
                        good.add(san)
                        ok[ply] = sorted(good)
                    moves.append(san); gb.push(mv)
                rec["models"].append({"id": gm["id"], "white": gm["white"]["name"], "black": gm["black"]["name"],
                                      "wr": gm["white"].get("rating"), "br": gm["black"].get("rating"), "year": gm.get("year"),
                                      "result": "1-0" if gm["winner"] == "white" else "0-1", "moves": moves, "ok": ok,
                                      "source": "lichess-masters:" + gm["id"], "chapter": chap})
                have.add(gm["id"]); added += 1
            if added: print(f"  [{chap}] +{added} masters games", flush=True)
        if not dry:
            save(stats, out, expath)                       # after every opening, so nothing is lost
            if time.time() - START > BUDGET:
                print("  out of time budget: stopping, the next run continues", flush=True); break

    if dry:
        print(f"DRY RUN: {len(would)} positions would be fetched from Lichess ({len(stats)} cached positions reused)")
        for f in would: print("  ", f)
        return 0
    if state["eng"]: state["eng"].quit()
    save(stats, out, expath)
    print(len(stats), "positions with statistics;", "stopped early (time budget), the next run continues" if time.time() - START > BUDGET else "complete")
    return 0


def save(stats, out, path):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps({"stats": stats, "courses": out}, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


if __name__ == "__main__":
    sys.exit(main())
