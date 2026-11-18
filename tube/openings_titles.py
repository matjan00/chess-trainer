"""Find Reddit threads about the user's three openings (Jobava London, Caro-Kann, Slav) by title search
(Arctic Shift, one subreddit + one word + a few months per query; short windows answer fast).
Writes tube/titles_openings.json in the same shape as titles.py, so texts.py / meta.py pick the threads up.
Keeps threads with at least 3 comments. Re-running continues where it stopped.
Usage:  python tube/openings_titles.py
"""
import json, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
API = "https://arctic-shift.photon-reddit.com/api"
SUBS = {"chessbeginners": "2022-01-01", "Chesscom": "2022-01-01"}   # r/chess dropped: biggest and slowest (user chose the narrow search)
WORDS = ["caro", "slav", "jobava", "london"]
END = int(time.mktime(time.strptime("2026-11-18", "%Y-%m-%d")))
STEP = 91 * 86400


def get(url, tries=6):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "-m", "90", "-A", "chess-trainer-personal/0.1", url], capture_output=True, text=True, encoding="utf-8")
        try:
            d = json.loads(r.stdout)
        except Exception:
            d = {}
        if d.get("data") is not None:
            return d["data"]
        err = str(d.get("error", "")).lower()
        if "subreddit" in err:
            return []
        if "timeout" in err:                             # the archive gave up on this window: caller splits it
            return "slow"
        time.sleep(3 + 3 * i)
    return None


def fetch(sub, word, a, b, st, depth=0):
    data = get(f"{API}/posts/search?subreddit={sub}&title={word}&after={a}&before={b}&limit=100&fields=id,title,score,created_utc,num_comments")
    time.sleep(2)
    if data is None:
        return False
    if data == "slow":
        if b - a > 86400 * 14:          # faster: stop splitting at 2 weeks
            m = (a + b) // 2
            return fetch(sub, word, a, m, st, depth + 1) and fetch(sub, word, m, b, st, depth + 1)
        for _ in range(0):                               # a short window that is still slow: wait and retry once, then skip it
            time.sleep(10)
            data = get(f"{API}/posts/search?subreddit={sub}&title={word}&after={a}&before={b}&limit=100&fields=id,title,score,created_utc,num_comments")
            if isinstance(data, list): break
        if not isinstance(data, list):
            st.setdefault("skipped", []).append(f"{sub}/{word}/{a}-{b}")
            print("skipped a slow window", sub, word, time.strftime("%Y-%m-%d", time.localtime(a)), flush=True)
            return True
    if len(data) >= 100 and b - a > 86400 * 4:          # too many in this window: split it
        m = (a + b) // 2
        return fetch(sub, word, a, m, st) and fetch(sub, word, m, b, st)
    for p in data:
        if (p.get("num_comments") or 0) >= 3:
            st["threads"][p["id"]] = {"t": p["title"], "s": p["score"], "sub": sub, "d": p["created_utc"], "w": word}
    return True


def main():
    path = HERE / "titles_openings.json"
    st = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"done": [], "threads": {}}
    for sub, start in SUBS.items():
        for word in WORDS:
            if word == "london": continue   # faster: London searches mostly find the plain London System
            a = int(time.mktime(time.strptime(start, "%Y-%m-%d")))
            while a < END:
                key = f"{sub}/{word}/{a}"
                b = min(END, a + STEP)
                if key not in st["done"]:
                    if not fetch(sub, word, a, b, st):
                        print("archive not answering, stopping for now", flush=True); path.write_text(json.dumps(st), encoding="utf-8"); return
                    st["done"].append(key)
                    path.write_text(json.dumps(st), encoding="utf-8")
                a = b
            print(sub, word, "threads kept so far:", len(st["threads"]), flush=True)
    print("done", len(st["threads"]), flush=True)


if __name__ == "__main__":
    main()
