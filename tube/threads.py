"""Find Reddit threads where people ask for chess videos, then save every comment in them that links YouTube.

Uses the Arctic Shift public Reddit archive, one request at a time with pauses (it rate-limits).
Step 1 searches thread titles (video, youtube, channel, course...) year by year and keeps the ones asking
for recommendations. Step 2 downloads each thread's comments. Re-running continues where it stopped.
Writes tube/threads.json and adds to tube/raw_comments.json + tube/posts.json (same format as collect.py).
Usage:  python tube/threads.py          (search titles, then read threads)
        python tube/threads.py --read   (only read the threads already found, e.g. by titles.py)
"""
import json, re, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
API = "https://arctic-shift.photon-reddit.com/api"
SUBS = ["chessbeginners", "chess", "Chesscom"]
TERMS = ["youtube", "video", "videos", "channel", "course", "speedrun", "lecture"]
YEARS = range(2019, 2027)
ASK = re.compile(r"recommend|best|good|suggest|which|favou?rite|learn|study|improv|help|looking for|instructive|watch|\?", re.I)
VID = re.compile(r"(?:youtube\.com/(?:watch\?[^\s)\]]*?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
PL = re.compile(r"youtube\.com/[^\s)\]]*?list=([A-Za-z0-9_-]{13,40})")


def get(url, tries=6):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "60", "-A", "chess-trainer-personal/0.1 (contact: Janczu00 on chess.com)", url], capture_output=True, text=True, encoding="utf-8")
        time.sleep(3)
        try:
            d = json.loads(r.stdout)
        except Exception:
            d = {}
        if d.get("data") is not None:
            return d["data"]
        time.sleep(4 * (i + 1))
    return None


def search(sub, term, a, b, found):
    data = get(f"{API}/posts/search?subreddit={sub}&title={term}&after={a}&before={b}&limit=100&fields=id,title,score,created_utc")
    if data is None:
        print("gave up", sub, term, a, flush=True); return False
    if len(data) >= 100:   # too many: split the period in half
        ta, tb = time.mktime(time.strptime(a, "%Y-%m-%d")), time.mktime(time.strptime(b, "%Y-%m-%d"))
        if tb - ta > 86400 * 20:
            mid = time.strftime("%Y-%m-%d", time.localtime((ta + tb) / 2))
            return search(sub, term, a, mid, found) & search(sub, term, mid, b, found)
    for p in data:
        if ASK.search(p["title"]):
            found[p["id"]] = {"t": p["title"], "s": p["score"], "sub": sub, "d": p["created_utc"]}
    return True


def main():
    tp = HERE / "threads.json"
    st = json.loads(tp.read_text(encoding="utf-8")) if tp.exists() else {"searched": [], "threads": {}, "fetched": []}
    import sys
    for sub in ([] if "--read" in sys.argv else SUBS):
        for term in TERMS:
            for y in YEARS:
                key = f"{sub}:{term}:{y}"
                if key in st["searched"]: continue
                if search(sub, term, f"{y}-01-01", f"{y + 1}-01-01", st["threads"]):
                    st["searched"].append(key)
                tp.write_text(json.dumps(st), encoding="utf-8")
                print(key, len(st["threads"]), flush=True)
    for f in HERE.glob("titles_*.json"):   # threads found by titles.py
        for k, v in json.loads(f.read_text(encoding="utf-8"))["threads"].items(): st["threads"].setdefault(k, v)
    cp, pp = HERE / "raw_comments.json", HERE / "posts.json"
    comments = json.loads(cp.read_text(encoding="utf-8")) if cp.exists() else {}
    posts = json.loads(pp.read_text(encoding="utf-8")) if pp.exists() else {}
    fetched = set(st["fetched"])
    todo = [i for i in st["threads"] if i not in fetched]
    print("threads to read:", len(todo), flush=True)
    for n, tid in enumerate(todo):
        data = get(f"{API}/comments/tree?link_id={tid}&limit=2000")
        if data is None: continue
        th = st["threads"][tid]
        posts[tid] = {"t": th["t"], "s": th["s"]}
        stack = list(data)
        while stack:
            node = stack.pop()
            c = node.get("data", {})
            rep = c.get("replies")
            if isinstance(rep, dict): stack.extend(rep.get("data", {}).get("children", []))
            body = c.get("body") or ""
            vids, pls = sorted(set(VID.findall(body))), sorted(set(PL.findall(body)))
            if (vids or pls) and c.get("id"):
                comments[c["id"]] = {"id": c["id"], "body": body, "score": c.get("score", 1), "link_id": "t3_" + tid, "created_utc": c.get("created_utc", 0),
                                     "sub": th["sub"], "vids": vids, "pls": pls, "author": c.get("author", "")}
        fetched.add(tid); st["fetched"] = sorted(fetched)
        if n % 10 == 0 or n == len(todo) - 1:
            cp.write_text(json.dumps(comments), encoding="utf-8"); pp.write_text(json.dumps(posts), encoding="utf-8"); tp.write_text(json.dumps(st), encoding="utf-8")
            print("read", n + 1, "/", len(todo), "comments with links:", len(comments), flush=True)


if __name__ == "__main__":
    main()
