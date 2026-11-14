"""Build data/puzzles2.json from the verified puzzles (BLUEPRINT 4): no engine work, seconds.

    build_puzzles2.py [--out data/puzzles2.json] [--partial] [--accepted FILE]

Input  train2/cache/pz_accepted.json (written by verify_puzzles.py; refused while it says "complete": false unless --partial).
Output {"v":1,"built":<unix>,"groups":[{id,name,ds,tags,why}],
        "rows":[[id, fen, "e2e4 d7d5 ...", rating, [groupIdx...], why, "alt uci ..."|0]]}   moves[0] = the opponent's set-up move.
The first group index of a row is the group it was counted in; the others are the further groups it belongs to.
Checks again: unique id, unique posKey of the start position (also against lesson cards / own-game cards, R2), explanation lint
(PZ7), file size <= 1.8 MB.  Exit 1 on a failed check.
"""
import argparse, json, sys, time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import chess
import t2common as tc
import fetch_puzzles2 as fp
import explain as ex
import verify_puzzles as vp

MAX_BYTES = 1_800_000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(tc.DATA_DIR / "puzzles2.json"))
    ap.add_argument("--accepted", default=str(vp.ACCEPTED))
    ap.add_argument("--partial", action="store_true")
    a = ap.parse_args()
    d = json.loads(Path(a.accepted).read_text(encoding="utf-8"))
    if not d.get("complete") and not a.partial:
        print("verify_puzzles.py has not finished (complete=false); run it again or use --partial", file=sys.stderr)
        sys.exit(1)
    rows_in = sorted(d["rows"], key=lambda r: (r["rating"], r["id"]))
    gidx = {g: i for i, g in enumerate(fp.GROUP_IDS)}
    problems = []
    ids, keys = set(), set(vp.external_keys())
    rows = []
    for r in rows_in:
        b = chess.Board(r["fen"])
        mv = r["moves"].split()
        b.push_uci(mv[0])
        pk = tc.pos_key(b)
        if r["id"] in ids:
            problems.append(f"duplicate id {r['id']}")
        if pk in keys:
            problems.append(f"duplicate posKey {r['id']}")
        ids.add(r["id"])
        keys.add(pk)
        r["why"] = ex.explain(r["fen"], mv, r["themes"], r["groups"][0])      # always the current explain.py
        bad = ex.lint_why(r["why"], b.fen(), mv[1:])
        if bad:
            problems.append(f"PZ7 {r['id']}: {bad}")
        rows.append([r["id"], r["fen"], r["moves"], r["rating"], [gidx[g] for g in r["groups"]], r["why"],
                     " ".join(r["alt"]) if r["alt"] else 0])
    groups = [{"id": g[0], "name": g[1], "ds": g[4], "tags": g[2], "why": g[3]} for g in fp.GROUPS]
    out = {"v": 1, "built": int(time.time()), "groups": groups, "rows": rows}
    text = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    size = len(text.encode("utf-8"))
    if size > MAX_BYTES:
        problems.append(f"file is {size} bytes (limit {MAX_BYTES})")
    # table by first group x band
    table = {}
    for r in rows:
        key = (fp.GROUP_IDS[r[4][0]], fp.band_of(r[3]))
        table[key] = table.get(key, 0) + 1
    print(f"{'group':12s}" + "".join(f"{lo}-{hi - 1:>5} " for lo, hi, _ in fp.BANDS) + "  total")
    for g in fp.GROUP_IDS:
        row = [table.get((g, b), 0) for b in range(len(fp.BANDS))]
        print(f"{g:12s}" + "".join(f"{n:>10d} " for n in row) + f"  {sum(row)}")
    print(f"rows {len(rows)}, {size / 1e6:.2f} MB, duplicates/lint problems: {len(problems)}")
    for p in problems[:30]:
        print("  FAIL", p)
    if problems:
        sys.exit(1)
    Path(a.out).write_text(text, encoding="utf-8")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
