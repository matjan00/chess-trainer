"""Compiler for the Train 2 lesson courses (BLUEPRINT section 3.2 and 4).

Usage:
  python compile_train2.py [courseId | path.txt ...] [--out data/train2.json] [--force] [--no-engine]
                           [--pool data/puzzles2.json] [--lock train2/courses/sets.lock.json]
No course given = every train2/courses/*.txt.  The verifier (verify_lessons.py) runs first; any FAIL refuses the build
(`--force` writes the course anyway and stamps "draft": true).  Courses already in the output file are kept when other
courses are compiled.  Second run with warm caches (engine, tablebase, self-play) takes seconds.

Computes per card: ok / slow (moves that are fine / right but slow), alt = `also`, win-% numbers, tablebase flag; per SET: the
frozen puzzle ids (also written to the lock file so a re-compile never reshuffles them); MINE blocks stay filters.
"""
import argparse, json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chess
import t2common as tc
from t2common import COURSES_DIR, DATA_DIR, REPORTS_DIR, pos_key
import lesson_format as lf
import verify_lessons as vl

OUT_DEFAULT = DATA_DIR / "train2.json"
LOCK_DEFAULT = COURSES_DIR / "sets.lock.json"


def color(b):
    return "white" if b else "black"


def compile_course(course, res, pool, lock, used_sets, draft=False, engine=True):
    """-> compiled course dict (BLUEPRINT 4)."""
    out = {"id": course.id, "title": course.title, "sub": course.sub, "why": course.why}
    if draft:
        out["draft"] = True
    out["chapters"] = [{"id": c["id"], "title": c["title"], "intro": c["intro"], "theme": c["theme"], "lessons": c["lessons"]} for c in course.chapters]
    lessons, cards, judges, plays = {}, {}, {}, {}
    for l in course.lessons:
        steps = []
        for it in l.items:
            if it.kind == "EX":
                if it.broken:
                    continue
                b0 = chess.Board(it.fen)
                ours = vl.Verifier.our_side(None, it) if False else _our_side(it)
                steps.append({"t": "ex", "id": it.id, "src": it.src, "fen": it.fen, "side": color(ours), "setting": it.text,
                              "moves": [{"san": m.san, "uci": m.uci, "mine": m.mover == ours, "key": m.key, "nag": m.nag,
                                         "c": m.c, "shapes": m.shapes} for m in it.moves],
                              "keyText": it.key_text})
            elif it.kind == "CARD":
                if it.broken:
                    continue
                rec = res.items.get(it.id, {})
                solver = chess.Board(it.fen).turn
                ok = rec.get("ok") or [it.sol_uci[0]]
                cards[it.id] = {"fen": it.fen, "side": color(solver), "last": it.params.get("last") or None, "sol": it.sol_uci,
                                "ok": ok, "slow": rec.get("slow", []),
                                "also": {e["uci"]: e["text"] for e in it.also},
                                "wrong": {e["uci"]: lf.VARIATION.sub("", e["text"]).strip() for e in it.wrong},
                                "wrongLine": {e["uci"]: e["vars"] for e in it.wrong if e["vars"]},
                                "why": it.why, "tag": it.params.get("tag") or None, "tb": bool(rec.get("tb")), "src": it.src}
                if rec.get("steps") and len(rec["steps"]) > 1:
                    cards[it.id]["okSteps"] = rec["steps"]
                for k_ in ("w", "gap", "wEnd"):
                    if rec.get(k_) is not None:
                        cards[it.id][k_] = rec[k_]
                steps.append({"t": "card", "id": it.id})
            elif it.kind == "JUDGE":
                if it.broken:
                    continue
                judges[it.id] = {"fen": it.fen, "mv": it.params.get("uci"), "san": it.params.get("san"), "verdict": it.params.get("verdict"),
                                 "refute": it.refute, "why": it.why, "src": it.src}
                steps.append({"t": "judge", "id": it.id})
            elif it.kind == "PLAY":
                if it.broken:
                    continue
                p = it.params
                solver = chess.Board(it.fen).turn
                side = p.get("side") or color(solver)
                plays[it.id] = {"fen": it.fen, "side": side, "goal": p.get("goal"), "finish": p.get("finish"),
                                "max": int(p.get("max", 0) or 0), "failBelow": int(p["failBelow"]) if p.get("failBelow") else None,
                                "text": it.text, "tb": bool(res.items.get(it.id, {}).get("tb"))}
                steps.append({"t": "play", "id": it.id})
            elif it.kind == "SET":
                n = int(it.params.get("n", 0) or 0)
                ids = lock.get(f"{course.id}/{it.id}")
                if pool is not None:
                    if not (ids and len(ids) == n and all(i in pool and i not in used_sets for i in ids)):
                        ids = vl.select_set(pool, it.params, exclude=used_sets)
                    lock[f"{course.id}/{it.id}"] = ids
                    used_sets.update(ids)
                steps.append({"t": "set", "id": it.id, "theme": it.params.get("theme"), "ids": ids or []})
            elif it.kind == "MINE":
                flt = {k: v for k, v in it.params.items() if k not in ("type", "n")}
                steps.append({"t": "mine", "type": it.params.get("type"), "filter": flt, "n": int(it.params.get("n", 0) or 0)})
        lessons[l.id] = {"id": l.id, "ch": l.ch, "title": l.title, "goal": l.goal, "rule": l.rule, "intro": l.intro, "steps": steps}
    out.update({"lessons": lessons, "cards": cards, "judges": judges, "plays": plays})
    return out


def _our_side(it):
    s = it.params.get("side")
    if s in ("white", "black"):
        return chess.WHITE if s == "white" else chess.BLACK
    for m in it.moves:
        if m.nag in ("!", "!!"):
            return m.mover
    for m in it.moves:
        if m.nag in ("?", "??"):
            return not m.mover
    return chess.Board(it.fen).turn


def cross_course_duplicates(courses, pool):
    """R2: no two servable positions share a posKey across courses (and against the puzzle pool's start positions)."""
    seen, fails = {}, []
    starts = {p["start"]: pid for pid, p in pool.items()} if pool else {}
    for c in courses:
        for l, it in c.all_items():
            if it.kind in ("EX", "CARD", "PLAY", "JUDGE") and it.fen:
                try:
                    k = pos_key(chess.Board(it.fen))
                except Exception:
                    continue
                if k in seen and seen[k][0] != c.id:
                    fails.append(f"{c.id}/{it.id} has the same position as {seen[k][0]}/{seen[k][1]}")
                seen.setdefault(k, (c.id, it.id))
                if it.kind in ("CARD",) and k in starts and not str(it.src).startswith("lichess:"):
                    fails.append(f"{c.id}/{it.id} has the same position as pool puzzle {starts[k]}")
    return fails


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("courses", nargs="*")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-engine", action="store_true")
    ap.add_argument("--pool")
    ap.add_argument("--lock", default=str(LOCK_DEFAULT))
    ap.add_argument("--report-dir", default=str(REPORTS_DIR))
    a = ap.parse_args(argv)
    t0 = time.time()
    paths = [vl.resolve(x) for x in a.courses] or sorted(COURSES_DIR.glob("*.txt"))
    if not paths:
        print("no course files found", file=sys.stderr); return 1
    courses = [lf.parse_course(p) for p in paths]
    pool = vl.load_pool(a.pool)
    ev = tb = None
    if not a.no_engine:
        ev = tc.T2Evals(); import tb as tbmod; tb = tbmod.default()
    try:
        return _compile(a, courses, pool, ev, tb, t0)
    finally:
        if ev is not None:
            ev.close()


def _compile(a, courses, pool, ev, tb, t0):
    outp = Path(a.out); lockp = Path(a.lock)
    lock = json.loads(lockp.read_text(encoding="utf-8")) if lockp.exists() else {}
    doc = json.loads(outp.read_text(encoding="utf-8")) if outp.exists() else {"v": 1, "courses": []}
    results = []; bad = False
    for c in courses:
        res = vl.verify(c, ev=ev, tb=tb, no_engine=a.no_engine, pool=pool, verbose=False)
        rep = vl.format_report(c, res)
        Path(a.report_dir).mkdir(parents=True, exist_ok=True)
        (Path(a.report_dir) / f"{c.id}.verify.txt").write_text(rep, encoding="utf-8")
        print(f"{c.id}: {len(res.fails)} FAIL, {len(res.warns)} WARN ({res.stats.get('seconds')} s)")
        results.append((c, res))
        bad = bad or bool(res.fails)
    dups = cross_course_duplicates(courses, pool)
    for d in dups:
        print("R2 FAIL:", d)
    bad = bad or bool(dups)
    if bad and not a.force:
        for c, res in results:
            for f in res.fails[:20]:
                print(f"  [{f['id']}] {f['lesson']}/{f['item']}: {f['msg']}")
        print("refusing to compile: fix the FAILs (or --force to write a draft)")
        return 1
    used = set()
    keep = [x for x in doc.get("courses", []) if x["id"] not in {c.id for c in courses}]
    new = []
    for c, res in results:
        new.append(compile_course(c, res, pool, lock, used, draft=bool(res.fails or dups), engine=not a.no_engine))
    doc["courses"] = keep + new
    doc["v"] = 1; doc["built"] = int(time.time())
    if any(x.get("draft") for x in doc["courses"]):
        doc["draft"] = True
    else:
        doc.pop("draft", None)
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    if pool is not None and lock:
        lockp.parent.mkdir(parents=True, exist_ok=True)
        lockp.write_text(json.dumps(lock, indent=1, sort_keys=True), encoding="utf-8")
    n_cards = sum(len(x["cards"]) for x in new)
    print(f"wrote {outp} ({outp.stat().st_size} bytes): {len(new)} courses, {n_cards} cards, {time.time() - t0:.1f} s"
          + (" [DRAFT]" if doc.get("draft") else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
