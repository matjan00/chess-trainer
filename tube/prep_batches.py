"""Split the playable candidate videos into small files for Claude to read and tag (tube/batches/bNN.json).
Each entry: title, channel, length, year, the Reddit threads it came up in and two comments about it.
Claude writes tube/batches/bNN.out.json; merge_tags.py joins them into tube/tags.json.
Usage:  python tube/prep_batches.py [batch size]
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).parent


def main():
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    cand = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
    tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8")) if (HERE / "tags.json").exists() else {}
    todo = []
    for vid, c in sorted(cand.items(), key=lambda kv: -kv[1]["rank"]):
        yt = c["yt"]
        if vid in tags or not yt.get("ok") or 0 < yt["len"] <= 90: continue
        threads = list(dict.fromkeys(m["th"] for m in c["m"] if m["th"]))[:3]
        todo.append({"id": vid, "title": yt["title"], "channel": yt["ch"], "min": "playlist" if vid.startswith("pl:") else round(yt["len"] / 60), "year": yt["up"][:4],
                     "threads": threads, "comments": [m["x"][:300] for m in c["m"][:2]]})
    out = HERE / "batches"; out.mkdir(exist_ok=True)
    for f in out.glob("b*.json"):
        if not f.name.endswith(".out.json"): f.unlink()
    first = len(list(out.glob("b*.out.json"))) + 1   # never reuse the name of a batch that already has answers
    for i in range(0, len(todo), size):
        (out / f"b{first + i // size:02d}.json").write_text(json.dumps(todo[i:i + size], ensure_ascii=False, indent=0), encoding="utf-8")
    print(len(todo), "videos in", (len(todo) + size - 1) // size, "batches")


if __name__ == "__main__":
    main()
