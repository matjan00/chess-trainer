"""Phone reminder for Today's training (GitHub job "Daily reminder").
At 9:00, 18:00 and 21:00 Warsaw time: if the 4 tasks on the Today screen aren't all done, send a push through ntfy.
The app saves today's count in your progress (kind "day"); the database function chess_today() returns only that
count for a date. Needs the repository secret NTFY_TOPIC (your ntfy topic; works like a password).
Usage: python remind.py <slot hour> <UTC offset the slot is for> | python remind.py test
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

WARSAW = ZoneInfo("Europe/Warsaw")
SUPABASE = "https://txhcnqwrdazgaxjwabln.supabase.co"
KEY = "sb_publishable_kNZA54ZHzYbJpL7yfqsA3w_vKejTXp3"      # public key, the same one the app uses
APP = "https://matjan00.github.io/chess-trainer/"


def today_status(day):
    req = urllib.request.Request(f"{SUPABASE}/rest/v1/rpc/chess_today", data=json.dumps({"day": day}).encode(),
                                 headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null") or {}


def push(title, text):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        sys.exit("NTFY_TOPIC is not set")
    body = {"topic": topic, "title": title, "message": text, "click": APP, "tags": ["chess_pawn"], "priority": 4}
    req = urllib.request.Request("https://ntfy.sh/", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def main():
    if sys.argv[1:] == ["test"]:
        now = datetime.now(WARSAW)
        s = today_status(now.strftime("%Y-%m-%d"))
        push("Chess trainer: test", f"Reminders work. Today so far: {s.get('n', 0)}/4 done.")
        print("test sent", s); return
    hour, offset = int(sys.argv[1]), int(sys.argv[2])
    now = datetime.now(WARSAW)
    if now.utcoffset() != timedelta(hours=offset):
        print("this run is for the other half of the year (summer/winter time); nothing to do"); return
    slot = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if now < slot:
        time.sleep((slot - now).total_seconds())          # started a little early on purpose: GitHub often starts late
    elif now - slot > timedelta(hours=2):
        print("too late for this reminder"); return
    s = today_status(slot.strftime("%Y-%m-%d"))
    n, left = s.get("n", 0), s.get("left") or []
    if n >= 4:
        print("all done today, no reminder"); return
    rest = ", ".join(left) if left else "all 4 tasks"
    title = {9: "Today's chess training", 18: "Chess: still to do today", 21: "Last call for today's chess"}[hour]
    push(title, f"{n}/4 done. Left: {rest}.")
    print("sent:", n, rest)


if __name__ == "__main__":
    main()
