"""Train 2 puzzle source (BLUEPRINT 2.2, 3.4): stream the Lichess puzzle database (CC0, ~300 MB .zst) ONCE through curl,
decompress on the fly and keep only a candidate selection.  The full file is never stored.

Output: train2/cache/pool_raw.jsonl   one candidate per line {id,fen,moves,rating,themes,game,pri,groups,cells}
        train2/cache/pool_fetch.state.json   checkpoint (rows scanned + the candidate heaps) written every 500k rows

Resumable by row count: if the run dies, running it again downloads again but skips the rows already scanned.
A finished run (pool_raw.jsonl exists) does nothing unless --force.

Selection before the engine (cheap filters): Popularity >= 90, NbPlays >= 1000, RatingDeviation <= 80, rating 600-1999,
1-3 solver moves (len(moves) in 2, 4, 6), a theme of the 16 groups.  Per (group, rating band) cell the candidates with the
lowest hash priority are kept (a deterministic random sample), 2.5 x the wanted number, so that rejects and the
one-puzzle-per-game rule are covered (the verifier works in waves and only searches what it needs).
"""
import argparse, csv, hashlib, heapq, io, json, os, subprocess, sys, time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
T2 = TOOLS.parent
CACHE = T2 / "cache"
RAW = CACHE / "pool_raw.jsonl"
STATE = CACHE / "pool_fetch.state.json"
URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

# group id -> (name, lichess tags, his why tags, one-line description)   (BLUEPRINT 4; order = table order)
GROUPS = [
    ("hanging", "Free pieces", ["hangingPiece"], ["hung piece", "missed capture"], "A piece nobody defends: take it, or save yours."),
    ("fork", "Forks", ["fork"], ["fork"], "One move attacks two things at once."),
    ("pin", "Pins", ["pin"], [], "A piece cannot move because something bigger stands behind it."),
    ("skewer", "Skewers", ["skewer"], [], "Attack the big piece; win the one behind it."),
    ("discovered", "Discovered attacks", ["discoveredAttack", "doubleCheck"], [], "Move one piece and unleash another."),
    ("removal", "Remove the defender", ["capturingDefender"], ["lost material"], "Take the piece that guards the target."),
    ("deflection", "Lure away", ["deflection", "attraction"], [], "Drag a defender off its post."),
    ("trapped", "Trapped pieces", ["trappedPiece"], [], "A piece with no safe square."),
    ("intermezzo", "In-between moves", ["intermezzo"], [], "A surprise move before the expected recapture."),
    ("mate1", "Mate in one", ["mateIn1"], ["missed mate"], "Find the checkmate."),
    ("mate2", "Mate in two", ["mateIn2"], ["missed mate"], "Force checkmate in two moves."),
    ("backrank", "Back rank", ["backRankMate"], ["allowed mate"], "A king boxed in by its own pawns."),
    ("defend", "Defence", ["defensiveMove"], ["allowed mate", "walked into check"], "Find the only move that holds."),
    ("promotion", "Promotion", ["promotion", "advancedPawn"], [], "Push the pawn to the last row."),
    ("pawnEndgame", "Pawn endgames", ["pawnEndgame"], [], "Kings and pawns only."),
    ("rookEndgame", "Rook endgames", ["rookEndgame"], [], "Rook endings."),
]
GROUP_IDS = [g[0] for g in GROUPS]
TAG2GROUPS = {}
for _gid, _n, _tags, _w, _d in GROUPS:
    for _t in _tags:
        TAG2GROUPS.setdefault(_t, []).append(_gid)
BANDS = [(600, 900, 60), (900, 1100, 100), (1100, 1300, 150), (1300, 1500, 170), (1500, 1700, 150), (1700, 2000, 120)]
OVERFETCH = 2.5
import re
GAME_RE = re.compile(r"lichess\.org/(?:game/)?([A-Za-z0-9]{8})")


def band_of(r):
    for i, (lo, hi, _q) in enumerate(BANDS):
        if lo <= r < hi:
            return i
    return None


def pri_of(pid):
    return int(hashlib.md5(pid.encode()).hexdigest()[:12], 16)


def empty_heaps():
    return {(g, b): [] for g in GROUP_IDS for b in range(len(BANDS))}


def save_state(heaps, rows, final=False):
    st = {"rows": rows, "final": final,
          "heaps": {f"{g}|{b}": [rec for _p, _id, rec in h] for (g, b), h in heaps.items()}}
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, STATE)


def load_state():
    heaps, rows = empty_heaps(), 0
    if STATE.exists():
        try:
            st = json.loads(STATE.read_text(encoding="utf-8"))
            for k, v in st["heaps"].items():
                g, b = k.rsplit("|", 1)
                h = [(-rec["pri"], rec["id"], rec) for rec in v]
                heapq.heapify(h)
                heaps[(g, int(b))] = h
            rows = st["rows"]
        except Exception as e:
            print("state unreadable, starting from row 0:", e, file=sys.stderr)
            heaps, rows = empty_heaps(), 0
    return heaps, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="download again even when pool_raw.jsonl exists")
    ap.add_argument("--stdin", action="store_true", help="read the compressed stream from stdin instead of running curl")
    ap.add_argument("--limit-rows", type=int, default=0, help="stop after N rows (testing; writes pool_raw.test.jsonl)")
    a = ap.parse_args()
    if RAW.exists() and not a.force and not a.limit_rows:
        print(f"{RAW} exists - nothing to do (use --force to download again)")
        return
    import zstandard
    CACHE.mkdir(parents=True, exist_ok=True)
    heaps, skip = (empty_heaps(), 0) if (a.force or a.limit_rows) else load_state()
    if skip:
        print(f"resuming after row {skip}", flush=True)
    cap = {b: int(q * OVERFETCH + 0.5) for b, (_l, _h, q) in enumerate(BANDS)}
    proc = None
    if a.stdin:
        src = sys.stdin.buffer
    else:
        proc = subprocess.Popen(["curl", "-sSL", "--fail", "--retry", "3", URL], stdout=subprocess.PIPE)
        src = proc.stdout
    text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(src), encoding="utf-8", newline="")
    reader = csv.reader(text)
    header = next(reader)
    ix = {h: i for i, h in enumerate(header)}
    n = 0
    t0 = time.time()
    try:
        for row in reader:
            n += 1
            if n <= skip:
                continue
            if n % 500000 == 0:
                kept = sum(len(h) for h in heaps.values())
                print(f"{n} rows scanned, {kept} cell entries, {(time.time() - t0) / 60:.1f} min", flush=True)
                if not a.limit_rows:
                    save_state(heaps, n)
            if a.limit_rows and n > a.limit_rows:
                break
            try:
                r = int(row[ix["Rating"]])
                b = band_of(r)
                if b is None:
                    continue
                if int(row[ix["Popularity"]]) < 90 or int(row[ix["NbPlays"]]) < 1000 or int(row[ix["RatingDeviation"]]) > 80:
                    continue
                moves = row[ix["Moves"]].split()
                if len(moves) not in (2, 4, 6):
                    continue
                themes = row[ix["Themes"]].split()
            except (ValueError, IndexError):
                continue
            groups = []
            for t in themes:
                for g in TAG2GROUPS.get(t, ()):
                    if g not in groups:
                        groups.append(g)
            if not groups:
                continue
            pid = row[ix["PuzzleId"]]
            pri = pri_of(pid)
            rec = {"id": pid, "fen": row[ix["FEN"]], "moves": row[ix["Moves"]], "rating": r, "themes": themes,
                   "game": (GAME_RE.search(row[ix["GameUrl"]]) or [None, row[ix["GameUrl"]]])[1], "pri": pri, "groups": [g for g in GROUP_IDS if g in groups]}
            for g in groups:
                h = heaps[(g, b)]
                item = (-pri, pid, rec)             # heap root = the WORST (largest priority number) kept candidate
                if len(h) < cap[b]:
                    heapq.heappush(h, item)
                elif item > h[0]:
                    heapq.heapreplace(h, item)
    except Exception as e:
        print("stream error:", repr(e), "- checkpoint kept, run again to continue", file=sys.stderr)
        if not a.limit_rows:
            save_state(heaps, max(skip, n - 1 - (n - 1) % 500000))
        sys.exit(2)
    if proc:
        proc.stdout.close()
        rc = proc.wait()
        if rc not in (0, None) and not a.limit_rows:
            print("curl failed (exit", rc, "); the checkpoint is kept, run again to continue", file=sys.stderr)
            sys.exit(2)
    cells = {}
    for (g, b), h in heaps.items():
        for _p, pid, rec in h:
            cells.setdefault(pid, (rec, []))[1].append(g)
    out = RAW.with_name("pool_raw.test.jsonl") if a.limit_rows else RAW
    tmp = out.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for pid, (rec, cl) in sorted(cells.items(), key=lambda kv: kv[1][0]["pri"]):
            rec = dict(rec)
            rec["cells"] = [g for g in GROUP_IDS if g in cl]
            f.write(json.dumps(rec, separators=(",", ":")) + "\n")
    os.replace(tmp, out)
    if not a.limit_rows:
        save_state(heaps, n, final=True)
    print(f"scanned {n} rows; {len(cells)} distinct candidates -> {out.name}")
    print(f"{'group':12s}" + "".join(f"{lo}-{hi - 1:<6}" for lo, hi, _ in BANDS) + "  (wanted " + " ".join(str(q) for _l, _h, q in BANDS) + ")")
    for g in GROUP_IDS:
        print(f"{g:12s}" + "".join(f"{len(heaps[(g, b)]):<10}" for b in range(len(BANDS))))


if __name__ == "__main__":
    main()
