"""Group the collected Reddit comments by video (or playlist) and look each one up on YouTube.

Reads tube/raw_comments.json (comments with links), tube/texts.json (all comments of the recommendation threads)
and tube/posts.json, writes tube/candidates.json: item -> Reddit mentions + YouTube details + rank.
A playlist is stored under "pl:<list id>". Every linked item is a candidate (the threads are already
recommendation threads); Claude's tagging then drops what isn't worth watching.
YouTube details: videos from the public watch page (title, channel, length, upload date, views), playlists from
YouTube's oEmbed (title, channel, first video). One request a second.
Usage:  python tube/meta.py
"""
import html, json, math, re, subprocess, time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
URL = re.compile(r"https?://\S+")
VID = re.compile(r"(?:youtube\.com/(?:watch\?[^\s)\]]*?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
PL = re.compile(r"youtube\.com/[^\s)\]]*?list=([A-Za-z0-9_-]{13,40})")


def curl(url):
    r = subprocess.run(["curl", "-sL", "-m", "30", "-A", "chess-trainer-personal/0.1", "-H", "Accept-Language: en", url],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout


def mentions():
    comments = {}
    for c in json.loads((HERE / "raw_comments.json").read_text(encoding="utf-8")).values():
        comments[c["id"]] = {"id": c["id"], "lk": c["link_id"].split("_")[-1], "s": c["score"], "sub": c["sub"], "body": c["body"]}
    texts = {}
    for f in HERE.glob("texts*.json"): texts.update(json.loads(f.read_text(encoding="utf-8")))
    for tid, th in texts.items():
        for cid, score, body in th["c"]:
            if cid not in comments and "youtu" in body:
                comments[cid] = {"id": cid, "lk": tid, "s": score, "sub": th["sub"], "body": body}
    posts = json.loads((HERE / "posts.json").read_text(encoding="utf-8"))
    titles = {**{k: v["t"] for k, v in posts.items()}, **{k: v["t"] for k, v in texts.items()}}
    by = defaultdict(list)
    for c in comments.values():
        items = sorted(set(VID.findall(c["body"]))) + ["pl:" + p for p in sorted(set(PL.findall(c["body"])))]
        text = URL.sub("[link]", c["body"]).strip()
        for it in items:
            by[it].append({"id": c["id"], "lk": c["lk"], "s": c["s"], "sub": c["sub"], "th": titles.get(c["lk"], ""), "x": text[:600], "nv": len(items)})
    return by, len(comments)


def lookup_video(vid):
    p = curl(f"https://www.youtube.com/watch?v={vid}&hl=en")
    def one(rx):
        m = re.search(rx, p)
        return m.group(1) if m else None
    status = one(r'"playabilityStatus":\{"status":"([A-Z_]+)"')
    title = one(r'<meta name="title" content="([^"]*)"')
    if not title or status not in ("OK", "LIVE_STREAM_OFFLINE"):
        return {"ok": False, "status": status}
    return {"ok": True, "title": html.unescape(title), "ch": json.loads('"' + (one(r'"ownerChannelName":"((?:[^"\\]|\\.)*)"') or "") + '"'),
            "len": int(one(r'"lengthSeconds":"(\d+)"') or 0), "up": (one(r'"uploadDate":"([^"]+)"') or "")[:10],
            "views": int(one(r'"viewCount":"(\d+)"') or 0)}


def lookup_playlist(pl):
    try:
        d = json.loads(curl(f"https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list={pl}&format=json"))
    except Exception:
        return {"ok": False, "status": "no oembed"}
    first = re.search(r"/vi/([A-Za-z0-9_-]{11})/", d.get("thumbnail_url", ""))
    return {"ok": bool(first), "title": d.get("title", ""), "ch": d.get("author_name", ""), "len": 0, "up": "", "first": first.group(1) if first else None}


def main():
    by, ncomments = mentions()
    out_path = HERE / "candidates.json"
    out = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    print(len(by), "items linked in", ncomments, "comments", flush=True)
    for i, (it, m) in enumerate(sorted(by.items(), key=lambda kv: -len(kv[1]))):
        m.sort(key=lambda x: -x["s"])
        if it not in out:
            out[it] = {"yt": lookup_playlist(it[3:]) if it.startswith("pl:") else lookup_video(it)}
            time.sleep(1)
        out[it]["m"] = m
        out[it]["rank"] = round(sum(1 + math.log1p(max(x["s"], 0)) / (1 + math.log(x["nv"])) for x in m), 2)   # a list of 10 links counts less per link
        if i % 50 == 0:
            out_path.write_text(json.dumps(out), encoding="utf-8"); print(i, flush=True)
    out_path.write_text(json.dumps(out), encoding="utf-8")
    print("playable", sum(1 for x in out.values() if x["yt"].get("ok")), "of", len(out))


if __name__ == "__main__":
    main()
