"""Tactics drills from the user's own games.

  data/punish.json  positions right after an opponent's blunder: find the move that punishes it
  data/check.json   "safe or blunder?" judgements on moves the user actually played
"""
import json, math, random, threading
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ENGINE = next((ROOT / "engine").rglob("stockfish*.exe"))


def win_pct(score, pov):
    s = score.pov(pov)
    if s.is_mate():
        return 100.0 if s.mate() > 0 else 0.0
    cp = max(-1000, min(1000, s.score()))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def replay(g):
    """Board before each ply, plus the moves."""
    b = chess.Board(); boards, moves = [], []
    for p in g["plies"]:
        boards.append(b.copy()); mv = b.parse_san(p["san"]); moves.append(mv); b.push(mv)
    return boards, moves


def main():
    games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))
    punish_todo, check = [], []
    rnd = random.Random(7)
    for g in games:
        me_white = g["color"] == "white"
        boards, moves = replay(g)
        gid = g["url"].rsplit("/", 1)[-1]
        for i, p in enumerate(g["plies"]):
            mine = (i % 2 == 0) == me_white
            if not mine and p.get("lab") == "blunder" and i + 1 < len(g["plies"]):
                punish_todo.append({"id": f"{gid}-{i}", "url": g["url"], "fen": boards[i + 1].fen(), "ph": p["ph"],
                                    "opp": p["san"], "last": [chess.square_name(moves[i].from_square), chess.square_name(moves[i].to_square)],
                                    "played": g["plies"][i + 1]["san"], "missed": g["plies"][i + 1]["loss"] >= 10,
                                    "moveNo": f'{(i + 1) // 2 + 1}{"." if (i + 1) % 2 == 0 else "..."}'})
            if mine and i >= 8:
                item = {"id": f"{gid}-{i}", "url": g["url"], "fen": boards[i].fen(), "san": p["san"], "ph": p["ph"],
                        "mv": [chess.square_name(moves[i].from_square), chess.square_name(moves[i].to_square)],
                        "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}', "best": p.get("best")}
                if p.get("lab") == "blunder" and p.get("refute"):
                    check.append({**item, "safe": False, "refute": p["refute"], "why": p.get("why", [])})
                elif p["loss"] < 2 and not boards[i].is_check() and rnd.random() < 0.08:
                    check.append({**item, "safe": True})

    lock, punish = threading.Lock(), []

    def worker():
        eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        eng.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not punish_todo: break
                d = punish_todo.pop()
            b = chess.Board(d["fen"])
            infos = eng.analyse(b, chess.engine.Limit(depth=16, time=3), multipv=4)
            best = win_pct(infos[0]["score"], b.turn)
            if best < 75:      # the "blunder" didn't leave anything clear to punish
                continue
            d["ok"] = [b.san(x["pv"][0]) for x in infos if "pv" in x and best - win_pct(x["score"], b.turn) <= 5]
            d["pv"] = b.variation_san(infos[0]["pv"][:8])
            d["gain"] = round(best)
            with lock:
                punish.append(d)
        eng.quit()

    ts = [threading.Thread(target=worker) for _ in range(7)]
    for t in ts: t.start()
    for t in ts: t.join()
    punish.sort(key=lambda d: d["id"])
    (DATA / "punish.json").write_text(json.dumps(punish), encoding="utf-8")
    (DATA / "check.json").write_text(json.dumps(check), encoding="utf-8")
    print(f"{len(punish)} punish positions ({sum(d['missed'] for d in punish)} you missed), "
          f"{len(check)} blunder-check items ({sum(not c['safe'] for c in check)} blunders)")


if __name__ == "__main__":
    main()
