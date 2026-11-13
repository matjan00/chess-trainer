"""Compile openings2 course sources into data/courses2.json (BLUEPRINT section 3).

Usage:
  python compile_courses2.py [courseId | path.txt ...] [--out data/courses2.json] [--force] [--no-engine]
                             [--depth 22] [--final-depth 24] [--report-dir DIR]
With no course given, every openings2/courses/*.txt is compiled.  The verifier runs first (cached engine
results make that fast); a FAIL stops the build unless --force, which stamps "draft": true on the course.
Courses already in the output file that are not being compiled are kept, so courses can be built one by one.
"""
import argparse, json, sys, time
from pathlib import Path
import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, COURSES_DIR, REPORTS_DIR, Evals, STD_DEPTH, FINAL_DEPTH, clamp, explorer, stat_for, pos_key
import course_format as cf
import verify_course as vc


def build_course(c, res, ev, depth, draft):
    nodes = {}
    for (key, san), nd in c.nodes.items():
        info = getattr(nd, "info", None)
        out = {"k": nd.key, "san": nd.san, "uci": nd.uci, "ply": nd.ply, "mine": nd.mine, "key": bool(nd.keymove),
               "nag": "!" if nd.keymove else ("sys" if nd.sys else (nd.nag or None)),
               "c": nd.c, "shapes": nd.shapes,
               "plan": nd.plan, "x": [{"san": x["san"], "why": x["why"]} for x in nd.xs], "quiz": nd.quiz,
               "ev": info["ev_white"] if info else None, "loss": info["loss"] if info else None}
        if nd.mine:
            alts = []
            if info:
                best = info["best"]
                notes = {a["san"]: a["note"] for a in nd.alts}
                b = chess.Board(nd.fen_before)
                have = set()
                for t in info["top"]:
                    if t["m"] is None or t["m"] == nd.uci: continue
                    s = b.san(chess.Move.from_uci(t["m"]))
                    if best - clamp(t["cp"]) <= 25 and clamp(t["cp"]) >= info["played"] - 10:
                        alts.append({"san": s, "loss": max(0, best - clamp(t["cp"])), "note": notes.get(s, "")}); have.add(s)
                for s, note in notes.items():        # alternatives the writer named with {A: san | text}
                    if s in have or s == nd.san: continue
                    try:
                        mv = b.parse_san(s)
                        r = ev.played(b, mv, depth, 3)
                    except ValueError:
                        continue
                    alts.append({"san": b.san(mv), "loss": max(0, best - clamp(r[0])) if r else None, "note": note})
            out["alts"] = alts
        else:
            st = stat_for(nd.key, nd.san)
            out["st"] = {"n": st["n"], "share": round(st["share"], 4), "score": st["score"]} if st and st["found"] else None
        nodes[nd.id] = out
    lines = []
    for l in c.lines:
        fin = vc_final(res, l.id)
        lines.append({"id": l.id, "ch": l.ch, "title": l.title, "intro": l.intro, "kind": l.kind,
                      "nodes": [n.id for n in l.path], "to": l.to,
                      "reach": (round(r, 5) if (r := vc.Verifier.reach(c, l)) is not None else None), "ev": fin})
    cards, seen = [], set()
    for l in c.lines:
        for nd in l.path:
            if nd.mine and nd.id not in seen:
                seen.add(nd.id)
                inl = [x for x in nd.lines]
                cards.append({"id": nd.id, "k": nd.key, "fen": nd.fen_before, "san": nd.san, "node": nd.id,
                              "line": inl[0], "lines": inl, "ply": nd.ply})
    models = []
    ex = explorer().get("courses", {})
    for g in c.models:
        src = g["source"]; rec = {}
        if src.startswith("explorer.json:"):
            rec = next((x for x in ex.get(src.split(":", 1)[1], {}).get("models", []) if x.get("id") == g["id"]), {})
        elif src.startswith("lichess-masters:"):
            rec = masters_model(ex, c.id, src.split(":", 1)[1])
            if not rec:
                print(f"{c.id}: model {g['id']} ({src}) is not in data/explorer.json yet (weekly job) - left out", file=sys.stderr)
                continue
        moves = g.get("moves") or rec.get("moves", [])
        hits = g.get("hits") or model_hits(c, moves)
        models.append({"id": g["id"], "white": g["white"], "black": g["black"], "wr": rec.get("wr"), "br": rec.get("br"),
                       "year": int(g["year"]) if str(g["year"]).isdigit() else g["year"], "result": g["result"],
                       "moves": moves, "notes": {str(k): v for k, v in g["notes"].items()},
                       "hits": hits, "source": src})
    out = {"id": c.id, "title": c.title, "side": c.side, "sub": c.sub, "why": c.why,
           "ideas": c.ideas, "structures": c.structures,
           "chapters": [{"id": ch["id"], "title": ch["title"], "intro": ch["intro"], "lines": ch["lines"]} for ch in c.chapters],
           "lines": lines, "nodes": nodes, "cards": cards,
           "traps": [{"id": t.id, "title": t.title, "kind": t.kind, "intro": t.intro, "nodes": [n.id for n in t.path]} for t in c.traps],
           "models": models, "modelsWanted": c.models_wanted}
    if draft:
        out["draft"] = True
    return out


def masters_model(ex, cid, gid):
    """A `lichess-masters:<gameId>` model: the game as build_explorer.py stored it in explorer.json
    (courses.<courseId>.models, "source": "lichess-masters:<id>"); this course first, then any course."""
    order = [cid] + [k for k in ex if k != cid]
    for k in order:
        for x in (ex.get(k) or {}).get("models", []):
            if x.get("id") == gid and x.get("moves"):
                return x
    return {}


def model_hits(c, moves):
    """Plies of a model game whose position is a course position (as verify_course.check_models computes them)."""
    keys = set()
    for l in c.lines:
        b = chess.Board(); keys.add(pos_key(b))
        for m in l.moves:
            b.push(chess.Move.from_uci(m.uci)); keys.add(pos_key(b))
    b, hits = chess.Board(), []
    try:
        for i, s in enumerate(moves, 1):
            b.push_san(s)
            if pos_key(b) in keys: hits.append(i)
    except ValueError:
        pass
    return hits


def vc_final(res, lid):
    for r in res.summary:
        if r["id"] == lid:
            return r["final"]
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("courses", nargs="*"); ap.add_argument("--out", default=str(ROOT / "data" / "courses2.json"))
    ap.add_argument("--force", action="store_true"); ap.add_argument("--no-engine", action="store_true")
    ap.add_argument("--depth", type=int, default=STD_DEPTH); ap.add_argument("--final-depth", type=int, default=FINAL_DEPTH)
    ap.add_argument("--report-dir"); ap.add_argument("--cache"); ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    paths = [vc.resolve(x) for x in a.courses] or sorted(COURSES_DIR.glob("*.txt"))
    if not paths:
        print("no course files found", file=sys.stderr); return 1
    out_path = Path(a.out)
    existing = {}
    if out_path.exists():
        try: existing = {c["id"]: c for c in json.loads(out_path.read_text(encoding="utf-8")).get("courses", [])}
        except Exception: existing = {}
    ev = Evals(path=a.cache, engine=not a.no_engine) if a.cache else Evals(engine=not a.no_engine)
    bad = 0
    try:
        for p in paths:
            c = cf.parse_course(p)
            res = vc.Verifier(c, ev, depth=a.depth, final_depth=a.final_depth, verbose=not a.quiet).run()
            rep = vc.format_report(c, res)
            rdir = Path(a.report_dir) if a.report_dir else REPORTS_DIR
            rdir.mkdir(parents=True, exist_ok=True)
            (rdir / f"{c.id}.verify.txt").write_text(rep + "\n", encoding="utf-8")
            nf = len(res.fails)
            if nf and not a.force:
                print(f"{c.id}: {nf} FAIL - not compiled (see {rdir / (c.id + '.verify.txt')}; --force builds a draft)", file=sys.stderr)
                bad += 1; continue
            existing[c.id] = build_course(c, res, ev, a.depth, draft=bool(nf))
            print(f"{c.id}: compiled{' as DRAFT (' + str(nf) + ' FAIL)' if nf else ''}: {len(c.lines)} lines, "
                  f"{len(existing[c.id]['nodes'])} nodes, {len(existing[c.id]['cards'])} cards")
    finally:
        ev.close()
    if bad and not existing:
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"v": 2, "built": int(time.time()), "courses": list(existing.values())}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out_path} ({out_path.stat().st_size/1024:.0f} KB)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
