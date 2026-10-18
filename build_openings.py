"""Opening drill cards and alternative moves, from data/courses.json.

  data/openings.json  {course_id: {"cards": [...], ...}}
  card = one position in the course where it is your move:
    {id, key (position key), path (SAN moves from the start), want (course moves here), alts (engine-approved
     alternatives: [{san, loss}] within 30 centipawns of the best), line (first line that reaches it), ply}
Run after changing courses.txt (compile_courses.py) — not needed for new games.
Usage: python build_openings.py [--depth 16]
"""
import argparse, hashlib, json, threading
from pathlib import Path
import chess, chess.engine
from engine_path import find_engine

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ENGINE = find_engine(ROOT)


def pos_key(board):
    return " ".join(board.fen().split()[:4])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--depth", type=int, default=16)
    args = ap.parse_args()
    courses = json.loads((DATA / "courses.json").read_text(encoding="utf-8"))
    # extra branches and longer lines from the Lichess statistics (if the weekly job has run) become cards too
    xp = json.loads((DATA / "explorer.json").read_text(encoding="utf-8")).get("courses", {}) if (DATA / "explorer.json").exists() else {}
    for c in courses:
        x = xp.get(c["id"], {})
        for l in c["lines"]:
            if l["id"] in x.get("ext", {}):
                l["moves"] = l["moves"] + [{"san": m["san"]} for m in x["ext"][l["id"]]]
        for i, e in enumerate(x.get("extra", [])):
            c["lines"].append({"id": f"x{i}", "moves": [{"san": s} for s in e["path"]] + [{"san": e["reply"]}] + [{"san": m["san"]} for m in e["cont"]]})
    out = {}
    todo = []
    for c in courses:
        me = chess.WHITE if c["side"] == "white" else chess.BLACK
        cards = {}
        for l in c["lines"]:
            b = chess.Board()
            path = []
            for i, m in enumerate(l["moves"]):
                if b.turn == me:
                    k = pos_key(b)
                    card = cards.get(k)
                    if not card:
                        card = cards[k] = {"id": hashlib.md5(f'{c["id"]}|{k}'.encode()).hexdigest()[:10], "key": k,
                                           "path": list(path), "want": [], "alts": [], "line": l["id"], "ply": i,
                                           "fen": b.fen()}
                        todo.append((card, me))
                    if m["san"] not in card["want"]:
                        card["want"].append(m["san"])
                b.push_san(m["san"]); path.append(m["san"])
        out[c["id"]] = {"cards": list(cards.values())}

    lock = threading.Lock()
    queue = list(todo)

    def worker():
        eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
        eng.configure({"Threads": 1, "Hash": 64})
        while True:
            with lock:
                if not queue: break
                card, me = queue.pop()
            b = chess.Board(card["fen"])
            infos = eng.analyse(b, chess.engine.Limit(depth=args.depth, time=3), multipv=4)
            best = infos[0]["score"].pov(me).score(mate_score=10000)
            for x in infos:
                if "pv" not in x: continue
                san = b.san(x["pv"][0])
                loss = best - x["score"].pov(me).score(mate_score=10000)
                if san not in card["want"] and loss <= 30:
                    card["alts"].append({"san": san, "loss": loss})
        eng.quit()

    ts = [threading.Thread(target=worker) for _ in range(7)]
    for t in ts: t.start()
    for t in ts: t.join()
    for c in out.values():
        for card in c["cards"]: card.pop("fen", None)
    (DATA / "openings.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print({k: len(v["cards"]) for k, v in out.items()}, "cards;", sum(len(cd["alts"]) > 0 for v in out.values() for cd in v["cards"]), "with alternatives")


if __name__ == "__main__":
    main()
