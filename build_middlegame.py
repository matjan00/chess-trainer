"""Middlegame training data from the user's own games.

  data/convert.json    positions where the user was clearly winning (to play out against the engine)
  data/technique.json  "you're ahead: find the right idea" positions, sorted by idea
"""
import json, math, random, threading
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ENGINE = next((ROOT / "engine").rglob("stockfish*.exe"))
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}


def win_pct_cp(cp):
    cp = max(-1000, min(1000, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def my_win(e, me_white):
    """Win% for the user from a stored white-POV eval."""
    if "m" in e:
        w = 100 if e["m"] > 0 else 0
    else:
        w = win_pct_cp(e["cp"])
    return w if me_white else 100 - w


def main():
    games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))
    convert, tech_todo = [], []
    rnd = random.Random(11)
    for g in games:
        me_white = g["color"] == "white"
        b = chess.Board(); first_conv = None; cands = []
        for i, p in enumerate(g["plies"]):
            mine = (i % 2 == 0) == me_white
            if mine and "m" not in p["e"] or mine and p["e"].get("m", 0) != 0:
                w = my_win(p["e"], me_white)
                if w >= 85 and first_conv is None and i >= 10 and not b.is_check():
                    first_conv = {"id": f'{g["url"].rsplit("/", 1)[-1]}-{i}', "url": g["url"], "fen": b.fen(), "ph": p["ph"],
                                  "result": g["result"], "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}',
                                  "eval": p["e"], "played": p["san"]}
                if 75 <= w and i >= 12:
                    cands.append((i, b.fen(), p))
            b.push_san(p["san"])
        if first_conv:
            convert.append(first_conv)
        rnd.shuffle(cands)
        for i, fen, p in cands[:4]:
            tech_todo.append({"id": f'{g["url"].rsplit("/", 1)[-1]}-{i}', "url": g["url"], "fen": fen, "ph": p["ph"],
                              "played": p["san"], "playedLoss": p["loss"], "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}'})

    lock, tech = threading.Lock(), []

    def classify(eng, b, infos):
        top = infos[0]; mv = top["pv"][0]; s = top["score"].pov(b.turn)
        if s.is_mate() and s.mate() > 0 and s.mate() <= 4:
            return "finish"
        # threat test: if we passed, how much would the opponent gain?
        if not b.is_check():
            nb = b.copy(); nb.push(chess.Move.null())
            if not nb.is_check():
                t = eng.analyse(nb, chess.engine.Limit(depth=12))
                now = s.score(mate_score=10000)
                passed = -t["score"].pov(nb.turn).score(mate_score=10000)
                if now - passed >= 250 and not b.is_capture(mv):
                    return "defend"
        if b.is_capture(mv):
            victim = b.piece_at(mv.to_square) or chess.Piece(chess.PAWN, not b.turn)
            mover = b.piece_at(mv.from_square)
            after = b.copy(); after.push(mv)
            defended = after.is_attacked_by(not b.turn, mv.to_square)
            if not defended and VAL[victim.piece_type] >= 1:
                return "take"
            if defended and VAL[victim.piece_type] == VAL[mover.piece_type] and victim.piece_type != chess.PAWN:
                return "trade"
            if VAL[victim.piece_type] > VAL[mover.piece_type]:
                return "take"
        return None

    def worker():
        eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        eng.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not tech_todo: break
                d = tech_todo.pop()
            b = chess.Board(d["fen"])
            infos = eng.analyse(b, chess.engine.Limit(depth=16, time=3), multipv=4)
            kind = classify(eng, b, infos)
            if not kind: continue
            best_cp = infos[0]["score"].pov(b.turn).score(mate_score=10000)
            ok = []
            for x in infos:
                c = x["score"].pov(b.turn).score(mate_score=10000)
                if best_cp - c <= 60 or (best_cp >= 500 and c >= 400):
                    ok.append(b.san(x["pv"][0]))
            d.update(kind=kind, ok=ok, pv=b.variation_san(infos[0]["pv"][:8]), cp=best_cp,
                     playedOk=d["played"] in ok)
            with lock: tech.append(d)
        eng.quit()

    ts = [threading.Thread(target=worker) for _ in range(7)]
    for t in ts: t.start()
    for t in ts: t.join()
    tech.sort(key=lambda d: d["id"])
    convert.sort(key=lambda d: (d["result"] == "win", d["id"]))
    (DATA / "convert.json").write_text(json.dumps(convert), encoding="utf-8")
    (DATA / "technique.json").write_text(json.dumps(tech), encoding="utf-8")
    from collections import Counter
    print(len(convert), "convert positions", Counter(c["result"] for c in convert))
    print(len(tech), "technique positions", Counter(t["kind"] for t in tech), "you got right:", sum(t["playedOk"] for t in tech))


if __name__ == "__main__":
    main()
