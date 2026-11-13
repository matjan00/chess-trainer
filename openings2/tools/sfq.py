"""sfq - quick Stockfish look-up for course writers (cached in openings2/cache/evals.json).

Usage:
  python sfq.py "<moves or FEN>" [more positions ...] [--mpv 3] [--depth 22] [--move SAN] [--course jobava] [--pv 6]

For every position: top moves with the evaluation from White's point of view, the loss against the best move,
the Lichess 1200-1600 share (data/explorer.json; only where the position has n >= 1000 games) and how often
the user's games contain that move.  --move SAN also evaluates that specific move (root-move search).
Evaluations are scored as in the verifier (centipawns, mate = 10000), so the numbers agree with verify_course.py.
"""
import argparse, sys
from pathlib import Path
import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Evals, STD_DEPTH, clamp, fmt_cp, parse_moves_arg, pos_key, san_pv, stat_for, game_moves_at


def show(ev, text, depth, mpv, extra, npv, course):
    b = parse_moves_arg(text)
    top = ev.top(b, depth, mpv)
    key = pos_key(b)
    side = "White" if b.turn else "Black"
    print(f"\n{text.strip()[-70:]}   [{side} to move, depth {depth}]")
    print(f"  FEN {b.fen()}")
    st = None
    s_tot = None
    from common import explorer
    s = explorer()["stats"].get(key)
    if s: s_tot = s["n"]
    print(f"  Lichess 1200-1600 games here: {s_tot if s_tot is not None else 'no data'}")
    if top[0]["m"] is None:
        print("  (game over)"); return
    best = clamp(top[0]["cp"])
    played = game_moves_at(key, course)
    rows = [(t["m"], t["cp"], t["pv"]) for t in top]
    for m in extra:
        mv = b.parse_san(m)
        r = ev.played(b, mv, depth, mpv)
        if mv.uci() not in [x[0] for x in rows]:
            rows.append((mv.uci(), r[0], r[1]))
    for uci, cp, pv in rows:
        mv = chess.Move.from_uci(uci); san = b.san(mv)
        sign = 1 if b.turn else -1
        loss = max(0, best - clamp(cp))
        stat = stat_for(key, san)
        share = f"{stat['share']*100:4.1f}%" if stat and stat["valid"] else "  n/a"
        me = played.get(("me", san)); op = played.get(("opp", san))
        yg = ""
        if me or op:
            yg = f"  games: you {len(me['games']) if me else 0}x, opp {len(op['games']) if op else 0}x"
        print(f"  {san:<8}{fmt_cp(cp * sign):>7}  loss {loss:>4}  LI {share}{yg}   {' '.join(san_pv(b, pv, npv))}")
    # explorer moves that the engine did not list
    ch = (s or {}).get("m", []) if s and s["n"] >= 1000 else []
    others = [(m[0], m[1] / s["n"]) for m in ch if m[0] not in [b.san(chess.Move.from_uci(r[0])) for r in rows]]
    if others:
        print("  other popular moves: " + ", ".join(f"{m} {p*100:.0f}%" for m, p in others[:6]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("positions", nargs="+"); ap.add_argument("--mpv", type=int, default=3)
    ap.add_argument("--depth", type=int, default=STD_DEPTH); ap.add_argument("--move", action="append", default=[])
    ap.add_argument("--course", choices=("white", "black"), help="count only your games where you had this colour")
    ap.add_argument("--pv", type=int, default=6); ap.add_argument("--cache")
    a = ap.parse_args(argv)
    ev = Evals(path=a.cache) if a.cache else Evals()
    try:
        for p in a.positions:
            try:
                show(ev, p, a.depth, a.mpv, a.move, a.pv, a.course)
            except ValueError as e:
                print(f"\n{p.strip()[-70:]}\n  cannot read this position/move: {e}")
    finally:
        ev.close()


if __name__ == "__main__":
    main()
