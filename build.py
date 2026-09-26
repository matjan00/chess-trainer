"""Build drill positions from the analysis and assemble the publishable app in dist/.

Usage:  python build.py [--skip-drills]
"""
import argparse, json, math, shutil, threading
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).parent
DATA, DIST = ROOT / "data", ROOT / "dist"
ENGINE = next((ROOT / "engine").rglob("stockfish*.exe"))


def win_pct(score, pov):
    s = score.pov(pov)
    if s.is_mate():
        return 100.0 if s.mate() > 0 else 0.0
    cp = max(-1000, min(1000, s.score()))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def build_drills(games, depth=16, workers=7):
    """Every blunder/mistake of mine becomes a 'find the better move' position.
    Moves within 3% win chance of the engine's best are accepted too."""
    todo = []
    for g in games:
        me_white = g["color"] == "white"
        board = chess.Board()
        for i, p in enumerate(g["plies"]):
            mine = (i % 2 == 0) == me_white
            if mine and p.get("lab") in ("blunder", "mistake") and p.get("fen"):
                last = board.peek() if board.move_stack else None
                todo.append({
                    "id": f'{g["url"].rsplit("/", 1)[-1]}-{i}', "url": g["url"], "fen": p["fen"], "ph": p["ph"], "lab": p["lab"],
                    "played": p["san"], "pv": p.get("pv", ""), "refute": p.get("refute"), "e": p["e"],
                    "moveNo": f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}',
                    "last": [chess.square_name(last.from_square), chess.square_name(last.to_square)] if last else None,
                })
            board.push_san(p["san"])

    lock, out = threading.Lock(), []

    def worker():
        eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        eng.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not todo: break
                d = todo.pop()
            b = chess.Board(d["fen"])
            infos = eng.analyse(b, chess.engine.Limit(depth=depth), multipv=4)
            best = win_pct(infos[0]["score"], b.turn)
            ok = [b.san(i["pv"][0]) for i in infos if "pv" in i and (best - win_pct(i["score"], b.turn) <= 3 or win_pct(i["score"], b.turn) >= 97)]
            if d["played"] in ok:  # deeper search says the game move was fine after all
                continue
            d["ok"] = ok
            d["pv"] = b.variation_san(infos[0]["pv"][:8])
            with lock:
                out.append(d)
        eng.quit()

    ts = [threading.Thread(target=worker) for _ in range(workers)]
    for t in ts: t.start()
    for t in ts: t.join()
    out.sort(key=lambda d: d["id"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-drills", action="store_true")
    args = ap.parse_args()
    games = json.loads((DATA / "analysis.json").read_text(encoding="utf-8"))
    if not args.skip_drills:
        drills = build_drills(games)
        (DATA / "drills.json").write_text(json.dumps(drills), encoding="utf-8")
        print(f"{len(drills)} drill positions")

    DIST.mkdir(exist_ok=True)
    css = "\n".join((ROOT / "vendor" / f).read_text(encoding="utf-8") for f in ("chessground.base.css", "chessground.brown.css", "chessground.cburnett.css"))
    html = (ROOT / "app.html").read_text(encoding="utf-8").replace("/*CG_CSS*/", css)
    notes = ROOT / "notes.html"
    if notes.exists():
        html = html.replace("<!--NOTES-->", notes.read_text(encoding="utf-8"))
    (DIST / "index.html").write_text(html, encoding="utf-8")
    # local preview copy with the skeleton the artifact host would add
    (DIST / "preview.html").write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + "</body></html>", encoding="utf-8")
    # the page doesn't need the per-move FEN strings, the drills carry their own
    slim = [{**g, "plies": [{k: v for k, v in p.items() if k != "fen"} for p in g["plies"]]} for g in games]
    (DIST / "analysis.json").write_text(json.dumps(slim, separators=(",", ":")), encoding="utf-8")
    for f in ("drills.json", "courses.json", "puzzles.json", "punish.json", "check.json", "convert.json", "technique.json", "endgames.json", "essentials.json"):
        if (DATA / f).exists(): shutil.copy(DATA / f, DIST / f)
    shutil.copy(ROOT / "vendor" / "sf" / "stockfish.wasm", DIST / "stockfish.wasm")
    print("built", DIST / "index.html")


if __name__ == "__main__":
    main()
