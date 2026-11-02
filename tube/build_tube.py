"""Turn the checked video list into data/tube.json for the Watch tab.

Reads tube/candidates.json (Reddit mentions + YouTube details, from meta.py) and tube/tags.json (Claude's
reading of each video: keep or not, kind, topics, opening courses, level, one-line reason).
Usage:  python tube/build_tube.py
"""
import json, math, re, datetime as dt
from pathlib import Path

HERE = Path(__file__).parent
TOPICS = {"thinking": "Thinking & blunder check", "tactics": "Tactics", "convert": "Winning won games", "endgame": "Endgames",
          "strategy": "Plans & strategy", "attack": "Attacking the king", "defence": "Defending", "openings": "Opening principles",
          "time": "Using the clock", "study": "How to improve", "classic": "Famous games"}
COURSES = {"jobava", "caro", "kid", "e4", "italian", "slav"}
# teaching channels people name in the threads, often without a link: YouTube channel name -> how Reddit writes it
CREATORS = {"Daniel Naroditsky": r"narod|danya", "GothamChess": r"gotham|\blevy\b", "Aman Hambleton": r"\baman\b|hambleton",
            "John Bartholomew": r"bartholomew", "Hanging Pawns": r"hanging ?pawns", "Saint Louis Chess Club": r"saint louis|st\.? ?louis|stlcc",
            "Eric Rosen": r"eric rosen|\brosen\b", "Chess Vibes": r"chess ?vibes", "GM Ben Finegold": r"finegold", "ChessNetwork": r"chess ?network",
            "GingerGM": r"ginger ?gm|simon williams", "Chessfactor": r"chess ?factor", "Remote Chess Academy": r"remote chess academy|smirnov",
            "chessbrah": r"chessbrah", "Chess Dojo": r"chess ?dojo", "Nelson Lopez Chess": r"nelson lopez"}


def creator_counts():
    texts = {}
    for f in HERE.glob("texts*.json"): texts.update(json.loads(f.read_text(encoding="utf-8")))
    n = {}
    for th in texts.values():
        for _, _, body in th["c"]:
            low = body.lower()
            for ch, rx in CREATORS.items():
                if re.search(rx, low): n[ch] = n.get(ch, 0) + 1
    return n


def main():
    cand = json.loads((HERE / "candidates.json").read_text(encoding="utf-8"))
    tags = json.loads((HERE / "tags.json").read_text(encoding="utf-8"))
    raw = json.loads((HERE / "raw_comments.json").read_text(encoding="utf-8"))
    out = []
    for vid, c in cand.items():
        t, yt = tags.get(vid), c["yt"]
        if not t or not t.get("keep") or not yt.get("ok") or 0 < yt["len"] <= 90:   # unplayable, off-topic, or a Short
            continue
        best = max(c["m"], key=lambda m: m["s"])
        item = {"id": vid, "t": yt["title"], "ch": yt["ch"], "len": yt["len"], "y": int(yt["up"][:4]) if yt.get("up") else None,
                    "kind": t["kind"], "top": [x for x in t.get("top", []) if x in TOPICS], "op": [x for x in t.get("op", []) if x in COURSES],
                    "lvl": t.get("lvl", 2), "why": t.get("why", ""), "n": len(c["m"]), "r": c["rank"],
                    "rd": f'r/{best["sub"]}/comments/{best["lk"]}/_/{best["id"]}'}
        if vid.startswith("pl:"):   # a playlist: plays as a series, its picture comes from the first video
            item.update(pl=vid[3:], th=yt["first"])
        out.append(item)
    named = creator_counts()
    for v in out:   # a creator people keep naming lifts their videos a little
        v["r"] = round(v["r"] * (1 + .15 * math.log1p(named.get(v["ch"], 0))), 2)
    out.sort(key=lambda v: -v["r"])
    have = {v["ch"] for v in out}
    creators = sorted(([ch, k] for ch, k in named.items() if ch in have and k >= 3), key=lambda x: -x[1])
    texts = {}
    for f in HERE.glob("texts*.json"): texts.update(json.loads(f.read_text(encoding="utf-8")))
    data = {"made": dt.date.today().strftime("%B %Y"), "comments": sum(len(t["c"]) for t in texts.values()), "threads": len(texts), "topics": TOPICS, "creators": creators, "videos": out}
    (HERE.parent / "data" / "tube.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(out), "videos in data/tube.json")


if __name__ == "__main__":
    main()
