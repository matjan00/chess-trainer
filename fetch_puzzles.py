"""Stream the Lichess puzzle database (CC0) and keep a themed selection near the user's level.

Nothing large is written to disk: the .zst file is decompressed on the fly.
Output: data/puzzles.json  [{id, fen, moves, rating, themes, theme}]
"""
import csv, io, json, sys
from pathlib import Path
import zstandard

URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
OUT = Path(__file__).parent / "data" / "puzzles.json"

# bucket -> lichess theme tags; a puzzle goes to the first bucket that matches
BUCKETS = [
    ("mate1", {"mateIn1"}), ("mate2", {"mateIn2"}), ("backrank", {"backRankMate"}),
    ("hanging", {"hangingPiece"}), ("fork", {"fork"}), ("pin", {"pin"}), ("skewer", {"skewer"}),
    ("discovered", {"discoveredAttack", "doubleCheck"}), ("trapped", {"trappedPiece"}),
    ("removal", {"capturingDefender"}), ("deflection", {"deflection", "attraction"}),
    ("intermezzo", {"intermezzo"}), ("defend", {"defensiveMove"}), ("promotion", {"promotion", "advancedPawn"}),
]
BANDS = [(1100, 1400), (1400, 1700), (1700, 2100)]
PER_CELL = 85   # per bucket per rating band


def main():
    keep = {(b, i): [] for b, _ in BUCKETS for i in range(len(BANDS))}
    # usage: curl -s URL | python fetch_puzzles.py   (reads the compressed file from stdin)
    with sys.stdin.buffer as resp:
        text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(resp), encoding="utf-8")
        reader = csv.reader(text)
        header = next(reader)
        ix = {h: i for i, h in enumerate(header)}
        n = 0
        for row in reader:
            n += 1
            if n % 500000 == 0:
                print(n, "rows scanned,", sum(map(len, keep.values())), "kept", flush=True)
            r = int(row[ix["Rating"]])
            if r < 1100 or r >= 2100: continue
            if int(row[ix["Popularity"]]) < 85 or int(row[ix["NbPlays"]]) < 500 or int(row[ix["RatingDeviation"]]) > 90: continue
            themes = set(row[ix["Themes"]].split())
            if "long" in themes or "veryLong" in themes: continue
            bucket = next((b for b, tags in BUCKETS if tags & themes), None)
            if not bucket: continue
            band = next(i for i, (lo, hi) in enumerate(BANDS) if lo <= r < hi)
            cell = keep[(bucket, band)]
            if len(cell) < PER_CELL:
                cell.append({"id": row[ix["PuzzleId"]], "fen": row[ix["FEN"]], "moves": row[ix["Moves"]].split(),
                             "rating": r, "themes": sorted(themes), "theme": bucket})
            if all(len(c) >= PER_CELL for c in keep.values()):
                break
    out = [p for c in keep.values() for p in c]
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"scanned {n} rows, kept {len(out)} puzzles")
    for b, _ in BUCKETS:
        print(b, [len(keep[(b, i)]) for i in range(len(BANDS))])


if __name__ == "__main__":
    main()
