"""Pull new games, analyse them, and rebuild every data file for the trainer.

Double-click update.bat (or run: python update.py). Settings live in config.json:
  chesscom   your chess.com username
  lichess    your Lichess username ("" to skip)
  since      only games from this date on (YYYY-MM-DD)
  timeClass  "rapid" (chess.com) / perfType for Lichess
Afterwards, ask Claude to "publish my chess trainer" to update the web page.
"""
import datetime as dt, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"
PY = sys.executable
CONFIG = ROOT / "config.json"
DEFAULT = {"chesscom": "janczu00", "lichess": "", "since": "2025-12-01", "timeClass": "rapid"}


def fetch(url, accept=None):
    """Download with curl (Python's own certificate store is out of date on this PC)."""
    cmd = ["curl", "-sL", "-A", "personal chess trainer"]
    if accept: cmd += ["-H", f"Accept: {accept}"]
    r = subprocess.run(cmd + [url], capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def chesscom_games(cfg):
    user = cfg["chesscom"].lower()
    since = dt.datetime.fromisoformat(cfg["since"]).replace(tzinfo=dt.timezone.utc)
    archives = json.loads(fetch(f"https://api.chess.com/pub/player/{user}/games/archives"))["archives"]
    out = []
    for a in archives:
        y, m = map(int, a.rsplit("/", 2)[-2:])
        if dt.datetime(y, m, 1, tzinfo=dt.timezone.utc) < since.replace(day=1): continue
        for g in json.loads(fetch(a)).get("games", []):
            if g.get("time_class") != cfg["timeClass"] or g.get("rules") != "chess": continue
            if g["end_time"] < since.timestamp(): continue
            white = g["white"]["username"].lower() == user
            me, op = (g["white"], g["black"]) if white else (g["black"], g["white"])
            draws = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
            res = "win" if me["result"] == "win" else "draw" if me["result"] in draws else "loss"
            acc = g.get("accuracies", {}).get("white" if white else "black")
            out.append({"url": g["url"], "end": g["end_time"], "color": "white" if white else "black",
                        "myRating": me["rating"], "oppRating": op["rating"], "opp": op["username"], "result": res,
                        "how": op["result"] if res == "win" else me["result"], "tc": g["time_control"], "rated": g.get("rated", True),
                        "opening": g.get("eco", "").rsplit("/", 1)[-1], "accuracy": acc, "pgn": g["pgn"], "site": "chess.com"})
    return out


def lichess_games(cfg):
    user = cfg["lichess"]
    if not user: return []
    since = int(dt.datetime.fromisoformat(cfg["since"]).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    url = (f"https://lichess.org/api/games/user/{user}?perfType={cfg['timeClass']}&since={since}"
           "&pgnInJson=true&clocks=true&opening=true&max=500")
    out = []
    for line in fetch(url, "application/x-ndjson").splitlines():
        if not line.strip(): continue
        g = json.loads(line)
        if g.get("variant") != "standard" or "pgn" not in g: continue
        white = g["players"]["white"].get("user", {}).get("name", "").lower() == user.lower()
        me, op = (g["players"]["white"], g["players"]["black"]) if white else (g["players"]["black"], g["players"]["white"])
        winner = g.get("winner")
        res = "draw" if not winner else "win" if (winner == "white") == white else "loss"
        clock = g.get("clock", {})
        out.append({"url": f"https://lichess.org/{g['id']}", "end": g["lastMoveAt"] // 1000, "color": "white" if white else "black",
                    "myRating": me.get("rating", 0), "oppRating": op.get("rating", 0), "opp": op.get("user", {}).get("name", "?"),
                    "result": res, "how": g.get("status", ""), "tc": f"{clock.get('initial', 600)}+{clock.get('increment', 0)}",
                    "rated": g.get("rated", True), "opening": g.get("opening", {}).get("name", "").replace(" ", "-").replace(":", ""),
                    "accuracy": None, "pgn": g["pgn"], "site": "lichess"})
    return out


def run(script, *args):
    print(f"\n=== {script} ===", flush=True)
    subprocess.run([PY, str(ROOT / script), *args], check=True, cwd=ROOT)


def main():
    cfg = {**DEFAULT, **(json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {})}
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    old = json.loads((DATA / "games.json").read_text(encoding="utf-8-sig"))
    seen = {g["url"] for g in old}
    new = [g for g in chesscom_games(cfg) + lichess_games(cfg) if g["url"] not in seen]
    games = sorted(old + new, key=lambda g: g["end"])
    (DATA / "games.json").write_text(json.dumps(games), encoding="utf-8")
    print(f"{len(new)} new games ({sum(g['site'] == 'lichess' for g in new)} from Lichess); {len(games)} in total")
    if not new and (DATA / "analysis.json").exists():
        print("Nothing new to analyse.")
        return
    run("analyze.py", "--depth", "14", "--workers", "7")   # only analyses games it hasn't seen
    run("build.py")                                         # mistakes drills + page
    run("build_tactics.py")
    run("build_middlegame.py")
    run("build_endgame.py")
    run("build.py", "--skip-drills")                        # copy the fresh data files into dist/
    print("\nDone. Double-click publish.bat to put the new version online (the phone app updates itself).")


if __name__ == "__main__":
    main()
