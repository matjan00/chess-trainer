"""Candidate finder for lesson writers (BLUEPRINT 3.4).  Prints puzzles from the verified pool (or own-game cards) with an ASCII
board, the solution in SAN and the generated explanation.  No engine.

    pick.py --theme fork --rating 700-1100 --moves 1 [--n 30] [--defended 1] [--seed 1] [--id ID]
    pick.py --mine --theme fork [--n 10]        own-game cards from data/mine2.json (needs T3's file; says so when absent)

--theme   a group id (hanging, fork, pin, ...) - counts any puzzle that lists the group, not only the counted one
--rating  lo-hi      --moves  number of solver moves (1-3)
--defended 1   the first solver move captures a piece that was defended before the capture (target square attacked by its side);
               0 = captures an undefended piece
Candidates are shuffled with --seed so that two writers get different samples; sorted by rating in the output.
"""
import argparse, json, random, sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import chess
import t2common as tc
import fetch_puzzles2 as fp
import verify_puzzles as vp


def load_pool():
    p = tc.DATA_DIR / "puzzles2.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        gs = [g["id"] for g in d["groups"]]
        return [{"id": r[0], "fen": r[1], "moves": r[2], "rating": r[3], "groups": [gs[i] for i in r[4]], "why": r[5],
                 "alt": r[6] or ""} for r in d["rows"]], "data/puzzles2.json"
    if vp.ACCEPTED.exists():
        d = json.loads(vp.ACCEPTED.read_text(encoding="utf-8"))
        return list(d["rows"]), "train2/cache/pz_accepted.json (build_puzzles2.py has not run yet)"
    return [], None


def ascii_board(fen, flip=False):
    b = chess.Board(fen)
    rows = []
    rng = range(8) if not flip else range(7, -1, -1)
    for r in (range(7, -1, -1) if not flip else range(8)):
        cells = []
        for f in (range(8) if not flip else range(7, -1, -1)):
            p = b.piece_at(chess.square(f, r))
            cells.append(p.symbol() if p else ".")
        rows.append(f"{r + 1}  " + " ".join(cells))
    files = "abcdefgh" if not flip else "hgfedcba"
    rows.append("   " + " ".join(files))
    return "\n".join(rows)


def san_line(fen, ucis):
    b = chess.Board(fen)
    out = []
    for u in ucis:
        mv = chess.Move.from_uci(u)
        if b.turn == chess.WHITE:
            out.append(f"{b.fullmove_number}.{b.san(mv)}")
        else:
            out.append(f"{b.fullmove_number}...{b.san(mv)}" if not out else b.san(mv))
        b.push(mv)
    return " ".join(out)


def defended_target(fen, moves):
    b = chess.Board(fen)
    b.push_uci(moves[0])
    mv = chess.Move.from_uci(moves[1])
    if not b.is_capture(mv) or b.is_en_passant(mv):
        return None
    return b.is_attacked_by(not b.turn, mv.to_square)


def show(r, why=True):
    mv = r["moves"].split()
    b = chess.Board(r["fen"])
    b.push_uci(mv[0])
    solver = b.turn
    print(f"--- {r['id']}  rating {r['rating']}  groups {','.join(r['groups'])}  solver {'White' if solver else 'Black'}"
          f"  solver moves {len(mv) // 2}  https://lichess.org/training/{r['id']}")
    print(ascii_board(b.fen(), flip=not solver))
    print("solution:", san_line(b.fen(), mv[1:]))
    if r.get("alt"):
        print("also mate:", r["alt"])
    print("why:", r["why"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme")
    ap.add_argument("--rating", default="0-9999")
    ap.add_argument("--moves", type=int)
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--defended", type=int, choices=[0, 1])
    ap.add_argument("--id")
    ap.add_argument("--mine", action="store_true")
    a = ap.parse_args()
    if a.mine:
        p = tc.DATA_DIR / "mine2.json"
        if not p.exists():
            print("data/mine2.json does not exist yet (task T3); nothing to show")
            return
        d = json.loads(p.read_text(encoding="utf-8"))
        cards = [c for c in d.get("cards", []) if not a.theme or c.get("group") == a.theme]
        for c in cards[:a.n]:
            print(f"--- {c['id']} {c.get('type')} group {c.get('group')} {c.get('opp', '')} {c.get('end', '')}")
            print(ascii_board(c["fen"], flip=c["side"] == "b" if isinstance(c.get("side"), str) else False))
            print("sol:", san_line(c["fen"], c["sol"]))
            print("why:", c.get("why"))
        print(f"{min(len(cards), a.n)} of {len(cards)} cards")
        return
    pool, src = load_pool()
    if not pool:
        print("no verified puzzles yet (run fetch_puzzles2.py and verify_puzzles.py)")
        return
    lo, hi = (int(x) for x in a.rating.split("-"))
    sel = []
    for r in pool:
        if a.id and r["id"] != a.id:
            continue
        if a.theme and a.theme not in r["groups"]:
            continue
        if not (lo <= r["rating"] <= hi):
            continue
        n = len(r["moves"].split()) // 2
        if a.moves and n != a.moves:
            continue
        if a.defended is not None:
            dt = defended_target(r["fen"], r["moves"].split())
            if dt is None or int(dt) != a.defended:
                continue
        sel.append(r)
    random.Random(a.seed).shuffle(sel)
    chosen = sorted(sel[:a.n], key=lambda r: r["rating"])
    print(f"# source {src}: {len(sel)} match, showing {len(chosen)}")
    for r in chosen:
        show(r)


if __name__ == "__main__":
    main()
