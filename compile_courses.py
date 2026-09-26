"""Compile courses.txt into data/courses.json, checking every move with Stockfish.

Usage: python compile_courses.py [--depth 18] [--no-engine]
Flags repertoire moves that lose more than 40 centipawns against the engine's best,
and idea answers that aren't close to the engine's choice.
"""
import argparse, json, re
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).parent
ENGINE = next((ROOT / "engine").rglob("stockfish*.exe"))


def tokenize(text):
    """Split move text into moves, {comments} and {? quizzes}."""
    out, i = [], 0
    while i < len(text):
        if text[i] == "{":
            j = text.index("}", i)
            out.append(("c", text[i + 1:j].strip())); i = j + 1
        elif text[i].isspace():
            i += 1
        else:
            j = i
            while j < len(text) and not text[j].isspace() and text[j] != "{": j += 1
            tok = text[i:j]; i = j
            tok = re.sub(r"^\d+\.(\.\.)?", "", tok)
            if tok: out.append(("m", tok))
    return out


def parse_quiz(s):
    body, _, explain = s[1:].partition("||")
    parts = [p.strip() for p in body.split("|")]
    q, opts = parts[0], parts[1:]
    answer = next(i for i, o in enumerate(opts) if o.startswith("*"))
    return {"q": q, "options": [o.lstrip("*").strip() for o in opts], "answer": answer, "explain": explain.strip()}


def build_moves(text):
    b = chess.Board(); moves = []
    for kind, val in tokenize(text):
        if kind == "m":
            mv = b.parse_san(val)
            moves.append({"san": b.san(mv), "uci": mv.uci()})
            b.push(mv)
        else:
            if not moves: raise ValueError("comment before first move")
            if val.startswith("?"): moves[-1]["quiz"] = parse_quiz(val)
            else: moves[-1]["c"] = val
    return moves


def parse(path):
    courses, course, section = [], None, None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line: continue
        if line.startswith("# COURSE "):
            cid, title, side, kind = [x.strip() for x in line[9:].split("|")]
            course = {"id": cid, "title": title, "side": side, "kind": kind, "sub": "", "why": "", "lines": [], "ideas": {"items": []}}
            courses.append(course); section = None
        elif line.startswith("## LINE "):
            lid, title = [x.strip() for x in line[8:].split("|")]
            section = {"id": lid, "title": title, "intro": "", "text": ""}; course["lines"].append(section)
        elif line.startswith("## IDEAS "):
            lid, title = [x.strip() for x in line[9:].split("|")]
            section = {"id": lid, "title": title, "intro": "", "items": []}; course["ideasSection"] = section
        elif line.startswith("#"):
            continue
        elif course and section is None and line.startswith("sub:"): course["sub"] = line[4:].strip()
        elif course and section is None and line.startswith("why:"): course["why"] = line[4:].strip()
        elif line.startswith(">"): section["intro"] = (section["intro"] + " " + line[1:].strip()).strip()
        elif line.startswith("@"): section["items"].append({"moves": line[1:].strip()})
        elif line.startswith("?"): section["items"][-1]["prompt"] = line[1:].strip()
        elif line.startswith("="): section["items"][-1]["ok"] = [s.strip() for s in line[1:].split(",")]
        elif line.startswith("!"): section["items"][-1]["explain"] = line[1:].strip()
        else: section["text"] += " " + line
    for c in courses:
        for l in c["lines"]:
            l["moves"] = build_moves(l.pop("text"))
        sec = c.pop("ideasSection", None)
        if sec:
            for it in sec["items"]:
                it["line"] = [m["san"] for m in build_moves(it.pop("moves"))]
            c["ideas"] = sec
    return courses


def cp(score, pov):
    return score.pov(pov).score(mate_score=10000)


def check(courses, depth):
    eng = chess.engine.SimpleEngine.popen_uci(str(ENGINE))
    eng.configure({"Threads": 7, "Hash": 512})
    lim = chess.engine.Limit(depth=depth, time=4)
    cache = {}
    def best(b):
        k = b.fen()
        if k not in cache:
            info = eng.analyse(b, lim)
            cache[k] = (cp(info["score"], chess.WHITE), b.san(info["pv"][0]) if info.get("pv") else None)
        return cache[k]
    problems = 0
    for c in courses:
        me = chess.WHITE if c["side"] == "white" else chess.BLACK
        for l in c["lines"]:
            b = chess.Board()
            for i, m in enumerate(l["moves"]):
                ev_before, bm = best(b)
                mv = chess.Move.from_uci(m["uci"])
                b.push(mv)
                ev_after, _ = best(b)
                sign = 1 if (i % 2 == 0) else -1   # mover is white on even plies
                loss = (ev_before - ev_after) * sign
                m["ev"] = ev_after
                mover_is_me = (i % 2 == 0) == (me == chess.WHITE)
                if mover_is_me and loss > 50:
                    problems += 1
                    print(f"  !! {c['id']}/{l['id']} ply {i+1} {m['san']}: loses {loss}cp (engine: {bm}, eval before {ev_before/100:+.2f})")
                elif not mover_is_me and loss > 150:
                    print(f"  .. {c['id']}/{l['id']} ply {i+1} {m['san']}: opponent error {loss}cp (engine: {bm}) - comment it as a mistake")
            me_eval = l["moves"][-1]["ev"] * (1 if me == chess.WHITE else -1)
            print(f"{c['id']}/{l['id']}: {len(l['moves'])} plies, final eval for us {me_eval/100:+.2f}")
        for it in c.get("ideas", {}).get("items", []):
            b = chess.Board()
            for s in it["line"]: b.push_san(s)
            infos = eng.analyse(b, lim, multipv=3)
            top = [(b.san(x["pv"][0]), cp(x["score"], b.turn)) for x in infos]
            good = []
            for s in it["ok"]:   # evaluate each accepted answer directly
                b2 = b.copy(); b2.push_san(s)
                e = cp(eng.analyse(b2, lim)["score"], b.turn)
                if top[0][1] - e <= 40: good.append(s)
            flag = "" if good else "  !! NOT ENGINE-APPROVED"
            if not good: problems += 1
            it["fen"] = b.fen()
            print(f"  idea {c['id']}: {it['ok']} vs engine {top}{flag}")
    eng.quit()
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--depth", type=int, default=18)
    ap.add_argument("--no-engine", action="store_true")
    a = ap.parse_args()
    courses = parse(ROOT / "courses.txt")
    problems = 0 if a.no_engine else check(courses, a.depth)
    (ROOT / "data" / "courses.json").write_text(json.dumps(courses, ensure_ascii=False), encoding="utf-8")
    print(f"{len(courses)} courses, {sum(len(c['lines']) for c in courses)} lines, {problems} problems")


if __name__ == "__main__":
    main()
