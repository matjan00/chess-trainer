"""game_probe - what you and your opponents actually played in a course's positions (data/games.json).

Usage:
  python game_probe.py <courseId | course.txt> [--line LINEID] [--json]     every course position your games reached
  python game_probe.py "<moves or FEN>" [--color white|black] [--json]      one position: all moves played there

Course mode lists, for each position where YOU move and your games deviate from the course move (or reach it),
what you played (count, W/D/L), and for each opponent-to-move position the replies your opponents chose, marking
those that are not in the course.  Counts are games, not moves (a game that transposes into the position counts).
--json prints the same data as machine-readable JSON (used to cross-check the app's statistics).
"""
import argparse, json, sys
from pathlib import Path
import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import game_moves_at, pos_key, parse_moves_arg, game_index
import course_format as cf
from verify_course import resolve


def _fmt(d):
    return {"games": len(d["games"]), "win": d["win"], "draw": d["draw"], "loss": d["loss"]}


def position_report(key, color=None):
    res = game_moves_at(key, color)
    out = {"me": {}, "opp": {}}
    for (who, san), d in res.items():
        out[who][san] = _fmt(d)
    return out


def course_report(course, only=None):
    c = course; color = c.side
    rows = []; seen = set()
    for l in c.lines:
        if only and l.id != only: continue
        b = chess.Board()
        for nd in l.path:
            key = nd.key
            if (key, "my" if nd.mine else "opp") not in seen:
                seen.add((key, "my" if nd.mine else "opp"))
                rep = position_report(key, color)
                who = "me" if nd.mine else "opp"
                moves = rep[who]
                if moves:
                    children = {n.san for (k, s), n in c.nodes.items() if k == key}
                    rows.append({"line": l.id, "ply": nd.ply, "mover": who, "key": key, "course": sorted(children),
                                 "moves": [{"san": s, **v, "in_course": s in children} for s, v in sorted(moves.items(), key=lambda x: -x[1]["games"])]})
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target"); ap.add_argument("--line"); ap.add_argument("--color", choices=("white", "black"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    p = resolve(a.target)
    if p.exists() and p.suffix == ".txt":
        course = cf.parse_course(p)
        rows = course_report(course, a.line)
        if a.json:
            print(json.dumps({"course": course.id, "side": course.side, "positions": rows}, indent=1)); return
        print(f"{course.id} ({course.side}): positions of the course that your games passed through\n")
        for r in rows:
            who = "YOU played" if r["mover"] == "me" else "opponent played"
            print(f"[{r['line']}] ply {r['ply']}  course: {'/'.join(r['course'])}   {who}:")
            for m in r["moves"]:
                tag = "" if m["in_course"] else "   <-- not in the course"
                print(f"    {m['san']:<8}{m['games']:>3} game(s)  W{m['win']} D{m['draw']} L{m['loss']}{tag}")
        if not rows: print("no games reach the course positions")
    else:
        b = parse_moves_arg(a.target)
        rep = position_report(pos_key(b), a.color)
        if a.json:
            print(json.dumps({"fen": b.fen(), **rep}, indent=1)); return
        print(b.fen())
        for who, label in (("me", "you played"), ("opp", "opponents played")):
            print(f"{label}:")
            for san, d in sorted(rep[who].items(), key=lambda x: -x[1]["games"]):
                print(f"    {san:<8}{d['games']:>3} game(s)  W{d['win']} D{d['draw']} L{d['loss']}")
            if not rep[who]: print("    (none)")


if __name__ == "__main__":
    main()
