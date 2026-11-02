"""List every thread title in a chess subreddit (Arctic Shift archive, plain date listing, which is fast
and reliable unlike its text search), and keep the threads that ask about videos, channels or courses.
Writes tube/titles_<subreddit>.json; threads.py --read downloads the comments of every thread found.
Re-running continues where it stopped. Several subreddits can run at once (one process each).
Usage:  python tube/titles.py chessbeginners
"""
import json, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
API = "https://arctic-shift.photon-reddit.com/api"
START = {"chessbeginners": "2022-06-01", "Chesscom": "2022-01-01", "chess": "2023-01-01"}
END = int(time.mktime(time.strptime("2026-11-01", "%Y-%m-%d")))
MEDIA = re.compile(r"\b(videos?|youtube|youtubers?|channels?|courses?|lectures?|playlists?|speed ?runs?|streamers?|content creators?|watch)\b", re.I)
ASK = re.compile(r"recommend|best|good|suggest|which|favou?rite|learn|study|improv|help|looking for|instructive|\?", re.I)


def get(url, tries=8):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "90", "-A", "chess-trainer-personal/0.1 (contact: Janczu00 on chess.com)", url], capture_output=True, text=True, encoding="utf-8")
        try:
            d = json.loads(r.stdout)
        except Exception:
            d = {}
        if d.get("data") is not None:
            return d["data"]
        time.sleep(3 + 3 * i)
    return None


def main():
    sub = sys.argv[1]
    path = HERE / f"titles_{sub}.json"
    st = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"after": int(time.mktime(time.strptime(START[sub], "%Y-%m-%d"))), "threads": {}}
    while st["after"] < END:
        # ask one month at a time: a short period is a cheap query for the archive (an open-ended one crawls)
        before = min(END, st["after"] + 30 * 86400)
        data = get(f"{API}/posts/search?subreddit={sub}&after={st['after']}&before={before}&sort=asc&limit=100&fields=id,title,score,created_utc")
        time.sleep(1)
        if data == []:
            st["after"] = before; continue
        if data is None:
            print("archive not answering, stopping for now", flush=True); return
        for p in data:
            if MEDIA.search(p["title"]) and ASK.search(p["title"]):
                st["threads"][p["id"]] = {"t": p["title"], "s": p["score"], "sub": sub, "d": p["created_utc"]}
        st["after"] = max(p["created_utc"] for p in data) + 1
        path.write_text(json.dumps(st), encoding="utf-8")
        print(sub, time.strftime("%Y-%m-%d", time.localtime(st["after"])), len(data), "threads kept:", len(st["threads"]), flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
