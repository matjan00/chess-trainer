"""Analyze chess.com rapid games with a local Stockfish.

Usage:  python analyze.py [--depth 16] [--workers 6] [--limit N]
Reads data/games.json, writes data/analysis.json (resumes where it left off).
"""
import argparse, io, json, math, re, threading, time
from pathlib import Path
import chess, chess.engine, chess.pgn

ROOT = Path(__file__).parent
from engine_path import find_engine
ENGINE = find_engine(ROOT)
GAMES = ROOT / "data" / "games.json"
OUT = ROOT / "data" / "analysis.json"
PIECE_VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def win_pct(score: chess.engine.PovScore, pov: chess.Color) -> float:
    """Lichess win-chance formula, 0..100 from `pov`'s side."""
    s = score.pov(pov)
    if s.is_mate():
        return 100.0 if s.mate() > 0 else 0.0
    cp = max(-1000, min(1000, s.score()))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def label(loss: float) -> str | None:
    if loss >= 30: return "blunder"
    if loss >= 20: return "mistake"
    if loss >= 10: return "inaccuracy"
    return None


def phase(board: chess.Board, ply: int) -> str:
    minors_majors = sum(len(board.pieces(p, c)) for p in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN) for c in (True, False))
    if minors_majors <= 6: return "endgame"
    if ply < 24: return "opening"
    return "middlegame"


def material(board: chess.Board, color: chess.Color) -> int:
    return sum(v * len(board.pieces(p, color)) for p, v in PIECE_VALUE.items())


def score_json(s: chess.engine.PovScore) -> dict:
    w = s.white()
    return {"m": w.mate()} if w.is_mate() else {"cp": w.score()}


def clocks(pgn: str) -> list[float]:
    return [int(h) * 3600 + int(m) * 60 + float(sec) for h, m, sec in re.findall(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]", pgn)]


def classify(board_before, move, best_move, before, after, me, pv_after) -> list[str]:
    """Rough 'why was this bad' tags for a mistake by `me`."""
    tags = []
    b_after = board_before.copy(); b_after.push(move)
    s_after, s_before = after.pov(me), before.pov(me)
    if s_after.is_mate() and s_after.mate() < 0: tags.append("allowed mate")
    if s_before.is_mate() and s_before.mate() > 0 and not (s_after.is_mate() and s_after.mate() > 0): tags.append("missed mate")
    if pv_after:  # opponent's best reply wins material right away?
        reply = pv_after[0]
        if b_after.is_capture(reply):
            victim = b_after.piece_at(reply.to_square) or chess.Piece(chess.PAWN, me)
            if victim.color == me and victim.piece_type != chess.PAWN:
                tags.append("hung piece" if not b_after.is_attacked_by(me, reply.to_square) or
                            PIECE_VALUE.get(victim.piece_type, 0) > PIECE_VALUE.get(b_after.piece_at(reply.from_square).piece_type, 0)
                            else "lost material")
        if b_after.gives_check(reply): tags.append("walked into check")
        if len(pv_after) > 0:
            b2 = b_after.copy(); b2.push(reply)
            p = b2.piece_at(reply.to_square)
            if p and len([sq for sq in b2.attacks(reply.to_square) if (q := b2.piece_at(sq)) and q.color == me and q.piece_type != chess.PAWN]) >= 2:
                tags.append("fork")
    if best_move and board_before.is_capture(best_move) and win_pct(before, me) > 60: tags.append("missed capture")
    if s_before.score(mate_score=10000) > 250 and s_after.score(mate_score=10000) < 100: tags.append("threw away win")
    return tags


def analyze_game(engine, g, depth):
    pgn = chess.pgn.read_game(io.StringIO(g["pgn"]))
    me = chess.WHITE if g["color"] == "white" else chess.BLACK
    clk = clocks(g["pgn"])
    inc = int(g["tc"].split("+")[1]) if "+" in g["tc"] else 0
    start = int(g["tc"].split("+")[0])
    board = pgn.board()
    moves = list(pgn.mainline_moves())
    evals, infos = [], []
    for i in range(len(moves) + 1):
        if board.is_game_over():
            outcome = board.outcome()
            sc = chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE) if outcome.winner is None else chess.engine.PovScore(chess.engine.MateGiven, outcome.winner)
            infos.append({"score": sc, "pv": []})
        else:
            infos.append(engine.analyse(board, chess.engine.Limit(depth=depth)))
        if i < len(moves): board.push(moves[i])

    board = pgn.board()
    plies = []
    for i, mv in enumerate(moves):
        info_b, info_a = infos[i], infos[i + 1]
        mover = board.turn
        best = info_b["pv"][0] if info_b.get("pv") else None
        loss = max(0.0, win_pct(info_b["score"], mover) - win_pct(info_a["score"], mover))
        entry = {
            "san": board.san(mv),
            "e": score_json(info_b["score"]),
            "best": board.san(best) if best else None,
            "ph": phase(board, i),
            "loss": round(loss, 1),
        }
        lab = label(loss) if best != mv else None
        if lab: entry["lab"] = lab
        if best and best != mv and loss >= 10:
            tmp = board.copy(); entry["pv"] = tmp.variation_san(info_b["pv"][:8])
            if mover == me:
                entry["fen"] = board.fen()
                entry["why"] = classify(board, mv, best, info_b["score"], info_a["score"], me, info_a.get("pv", []))
                b2 = board.copy(); b2.push(mv)
                if info_a.get("pv"): entry["refute"] = b2.variation_san(info_a["pv"][:6])
        if i < len(clk):
            entry["clk"] = clk[i]
            prev = clk[i - 2] if i >= 2 else start
            entry["t"] = round(prev - clk[i] + inc, 1)
        plies.append(entry)
        board.push(mv)

    final = infos[-1]["score"]
    return {k: g[k] for k in ("url", "color", "result", "how", "end", "opening", "myRating", "oppRating", "opp", "tc", "accuracy")} | {
        "plies": plies, "final": score_json(final),
        "matMe": material(board, me), "matOpp": material(board, not me),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--depth", type=int, default=16)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    games = json.loads(GAMES.read_text(encoding="utf-8-sig"))
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    seen = {d["url"] for d in done}
    queue = [g for g in games if g["url"] not in seen]
    if args.limit: queue = queue[: args.limit]
    lock, results, t0 = threading.Lock(), done, time.time()
    print(f"{len(queue)} games to analyze with {ENGINE.name}, depth {args.depth}, {args.workers} workers", flush=True)

    def worker():
        engine = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        engine.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not queue: break
                g = queue.pop(0)
            try:
                r = analyze_game(engine, g, args.depth)
            except Exception as e:
                print("ERROR", g["url"], repr(e), flush=True); continue
            with lock:
                results.append(r)
                print(f"[{len(results)}/{len(games)}] {time.time() - t0:.0f}s {g['url']}", flush=True)
                if len(results) % 5 == 0:
                    OUT.write_text(json.dumps(results), encoding="utf-8")
        engine.quit()

    threads = [threading.Thread(target=worker) for _ in range(args.workers)]
    for t in threads: t.start()
    for t in threads: t.join()
    results.sort(key=lambda r: r["end"])
    OUT.write_text(json.dumps(results), encoding="utf-8")
    print(f"FINISHED {len(results)} games in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
