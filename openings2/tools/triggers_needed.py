"""Worklist of trigger notes still to write ({T: rule | clue | text}), RESTRUCTURE.md section 6.

Usage:  python triggers_needed.py <courseId | path.txt> [--all] [--out FILE]
Lists every T-SPLIT place (our reply right after an opponent move at a split) and every T-SISTER place (our move in a
look-alike pair) that has no {T: ...} yet, one or two lines each, and prints a count.  --all also lists the places that
already have a trigger.  No engine needed.
"""
import argparse, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import course_format as cf
from verify_course import resolve


def collect(c):
    """[{"node","line","i","split": dict|None,"sister": dict|None}] in file order, nodes needing / having a trigger."""
    places = {}
    for sp in cf.split_places(c):
        places.setdefault(sp["node"].id, {"node": sp["node"], "line": sp["line"], "i": sp["i"], "split": None, "sister": None})["split"] = sp
    for sr in cf.sister_places(c):
        rec = places.setdefault(sr["node"].id, {"node": sr["node"], "line": sr["line"], "i": sr["i"], "split": None, "sister": None})
        rec["sister"] = sr
    order = {l.id: l.order for l in c.lines}
    return sorted(places.values(), key=lambda r: (order[r["line"]], r["i"]))


def format_place(r):
    nd = r["node"]
    tags = "+".join(t for t, k in (("SPLIT", "split"), ("SISTER", "sister")) if r[k])
    out = [f"{tags:<13}{r['line']} {cf.label(nd.ply, nd.san)}" + (f"  [has {{T: {nd.trig['rule']}}}]" if nd.trig else "")]
    parts = []
    if r["split"]:
        sp = r["split"]
        parts.append(f"after {cf.label(sp['opp'].ply, sp['opp'].san)}, other replies here: {', '.join(sp['alts'])}")
    if r["sister"]:
        sis = r["sister"]["sis"]
        x = sis[0]
        txt = (f"look-alike in {x['l2'].id} ({cf.label(x['q'].ply, x['q'].san)}); differ {','.join(x['squares'])}: "
               f"here {', '.join(x['here']) or '-'} / there {', '.join(x['there']) or '-'}")
        if len(sis) > 1:
            txt += "; also " + ", ".join(f"{y['l2'].id} ({cf.label(y['q'].ply, y['q'].san)})" for y in sis[1:3]) + (f" +{len(sis) - 3}" if len(sis) > 3 else "")
        parts.append(txt)
    out.append("    " + " | ".join(parts))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("course"); ap.add_argument("--all", action="store_true"); ap.add_argument("--out")
    a = ap.parse_args(argv)
    c = cf.parse_course(resolve(a.course))
    recs = collect(c)
    todo = [r for r in recs if not r["node"].trig]
    n_split = sum(1 for r in todo if r["split"]); n_sis = sum(1 for r in todo if r["sister"])
    lines = [format_place(r) for r in (recs if a.all else todo)]
    lines.append("")
    lines.append(f"{c.id}: {len(todo)} places need a trigger (T-SPLIT {n_split}, T-SISTER {n_sis}, both {sum(1 for r in todo if r['split'] and r['sister'])}); "
                 f"{len(recs) - len(todo)} already have one")
    text = "\n".join(lines)
    print(text)
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
