"""Endgame positions from the user's own games (no engine needed: uses the stored evaluations).

  data/endgames.json  [{id, url, fen, goal: win|draw, eval, result, moveNo}]
  goal "win":  you entered the endgame clearly better  -> play it out and win
  goal "draw": the endgame was level but you lost it    -> play it out and hold
"""
import json, math
from pathlib import Path
import chess

DATA = Path(__file__).parent / "data"


def my_win(e, me_white):
    if "m" in e:
        w = 100 if e["m"] > 0 else 0
    else:
        cp = max(-1000, min(1000, e["cp"]))
        w = 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)
    return w if me_white else 100 - w


games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))
out = []
for g in games:
    me_white = g["color"] == "white"
    b = chess.Board()
    for i, p in enumerate(g["plies"]):
        mine = (i % 2 == 0) == me_white
        if mine and p["ph"] == "endgame" and not b.is_check() and p["e"].get("m", 1) != 0:
            w = my_win(p["e"], me_white)
            goal = "win" if 80 <= w <= 99 else "draw" if 35 <= w <= 65 and g["result"] == "loss" else None
            if goal:
                out.append({"id": f'{g["url"].rsplit("/", 1)[-1]}-{i}', "url": g["url"], "fen": b.fen(), "goal": goal,
                            "eval": p["e"], "result": g["result"], "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}'})
            break
        b.push_san(p["san"])
out.sort(key=lambda d: (d["goal"], d["result"] == "win"))
(DATA / "endgames.json").write_text(json.dumps(out), encoding="utf-8")
print(len(out), "own endgames:", sum(d["goal"] == "win" for d in out), "to win,", sum(d["goal"] == "draw" for d in out), "to hold")
puz = json.loads((DATA / "puzzles.json").read_text(encoding="utf-8"))
print("endgame puzzles:", sum(any(t in p["themes"] for t in ("endgame", "rookEndgame", "pawnEndgame", "queenEndgame")) for p in puz))
