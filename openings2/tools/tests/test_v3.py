"""Tests for the v3 course format (trunks, rule book, {T: ...} triggers).  No engine needed:
   python -m unittest discover -s openings2/tools/tests -p "test_v3.py" -v
The compile tests run with --no-engine and need the fixture's positions in openings2/cache/evals.json (test_tools.py warms it)."""
import json, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
sys.path.insert(0, str(TOOLS))
import course_format as cf
import verify_course as vc
import compile_courses2 as cc
import triggers_needed as tn

BASE = (HERE / "fixture.txt").read_text(encoding="utf-8")

RULES = """## RULES
rule: recapture | Take back toward the centre | After ...cxd4 take with the e-pawn, so the d4 pawn stays and the bishop gets out.
rule: hit-c7 | Nb5 hits c7 | When Black develops the knight too early, Nb5 aims at c7 and d6.
"""


def v3_text(extra_rules=""):
    t = BASE
    t = t.replace("### LINE e6-c6 | Main line: 4.Nb5 Na6 5.e3 c6 | main", "### LINE e6-c6 | Main line: 4.Nb5 Na6 5.e3 c6 | main | trunk")
    t = t.replace("### LINE c5-main | Main line: 4...cxd4 5.exd4 a6 | side", "### LINE c5-main | Main line: 4...cxd4 5.exd4 a6 | side | trunk")
    t = t.replace("c5-nc6 | The Nb5 trick: 4...Nc6? | punish | classic\n", "c5-nc6 | The Nb5 trick: 4...Nc6? | punish | classic\nparent: c5-main\n")
    t = t.replace("skip: 1.d4", "start: e6-c6, c5-main\nskip: 1.d4", 1)
    t = t.replace("5. exd4 {Recapture", "5. exd4 {T: recapture | d4 e3 | The pawn on e3 is gone, so take back toward the centre. | not=hit-c7} {Recapture", 1)
    t = t.replace("5. Nb5! {Threatens", "5. Nb5! {T: hit-c7 | c6 c7 | The knight is on c6, so Nb5 hits c7.} {Threatens", 1)
    t = t.replace("## MODELS", RULES + extra_rules + "\n## MODELS", 1)
    return t


def lint(text):
    c = cf.parse_course(text)
    v = vc.Verifier(c, None, verbose=False)
    v.check_triggers()
    return c, v.r.findings


def ids(findings, fid, sev=None):
    return [f for f in findings if f["id"] == fid and (sev is None or f["sev"] == sev)]


class ParseV3(unittest.TestCase):
    def test_tokens(self):
        c = cf.parse_course(v3_text())
        self.assertEqual(c.errors, [])
        self.assertTrue(c.v3)
        self.assertEqual(c.start, ["e6-c6", "c5-main"])
        self.assertEqual([r["id"] for r in c.rules], ["recapture", "hit-c7"])
        self.assertEqual(c.rules[0]["name"], "Take back toward the centre")
        self.assertEqual([l.trunk for l in c.lines], [True, True, False])
        self.assertEqual(c.line("c5-nc6").parent_decl, "c5-main")
        self.assertIn("classic", c.line("c5-nc6").tags)
        t = c.nodes[(c.line("c5-main").moves[8].key_before, "exd4")].trig
        self.assertEqual(t, {"rule": "recapture", "clue": ["d4", "e3"], "text": "The pawn on e3 is gone, so take back toward the centre.", "not": ["hit-c7"]})
        n = c.nodes[(c.line("c5-nc6").moves[8].key_before, "Nb5")]
        self.assertEqual(n.trig["not"], [])
        self.assertTrue(n.c.startswith("Threatens"))           # T does not swallow the ordinary comment

    def test_mixed_chapter(self):
        c = cf.parse_course(BASE.replace("## CHAPTER c5 | Black hits the centre: 3...c5", "## CHAPTER c5 | Black hits the centre: 3...c5 | mixed"))
        self.assertEqual([ch.get("mixed") for ch in c.chapters], [False, True])
        self.assertEqual(c.errors, [])

    def test_old_course_is_not_v3(self):
        c, f = lint(BASE)
        self.assertFalse(c.v3)
        self.assertEqual(f, [])

    def test_existing_notes_still_parse_next_to_t(self):
        c = cf.parse_course(v3_text().replace("5. e3 {Opens", "5. e3 {T: hit-c7 | a6 | The knight is on a6, so play e3 first.} {X: Nxa6 | worse} {A: Bd3 | fine} {Opens", 1))
        m = c.lines[0].moves[8]
        self.assertTrue(m.trig and m.xs and m.alts)
        self.assertEqual(c.lines[0].moves[4].san, "Bf4")

    def test_trigger_on_opponent_move_is_an_error(self):
        c = cf.parse_course(v3_text().replace("d5 2. Nc3", "d5 {T: hit-c7 | d5 | text.} 2. Nc3", 1))
        self.assertTrue(any("OUR moves" in f["msg"] for f in c.errors))


class Structure(unittest.TestCase):
    def test_parent_split_learn(self):
        c = cf.parse_course(v3_text())
        st = cf.structure(c, {"e6-c6": 0.5, "c5-main": 0.2, "c5-nc6": 0.05})
        self.assertEqual(st["parent"], {"e6-c6": None, "c5-main": None, "c5-nc6": "c5-main"})
        self.assertEqual(st["split"]["c5-nc6"], 7)             # first node not shared with c5-main: 4...Nc6
        self.assertEqual(st["split"]["c5-main"], None)
        self.assertEqual(st["learn"], ["e6-c6", "c5-main", "c5-nc6"])

    def test_default_parent_is_chapter_trunk(self):
        c = cf.parse_course(v3_text().replace("parent: c5-main\n", ""))
        self.assertEqual(cf.structure(c)["parent"]["c5-nc6"], "c5-main")

    def test_sisters_and_splits(self):
        c = cf.parse_course(v3_text())
        sp = {(s["line"], cf.label(s["node"].ply, s["node"].san)): s for s in cf.split_places(c)}
        self.assertIn(("c5-nc6", "5.Nb5"), sp)
        self.assertEqual(sp[("c5-nc6", "5.Nb5")]["alts"], ["cxd4"])
        self.assertEqual(cf.label(6, "h6"), "3...h6")
        # 4.Nb5 (after 3...e6) and 4.e3 (after 3...c5): same ply, few squares differ
        sis = cf.sisters(c, c.line("e6-c6"), 6)
        self.assertTrue(sis and sis[0]["l2"].id == "c5-main" and sis[0]["q"].san == "e3")
        self.assertEqual(sorted(sis[0]["squares"]), ["c5", "c7", "e6", "e7"])


class Lint(unittest.TestCase):
    def test_clean_v3(self):
        c, f = lint(v3_text())
        self.assertEqual([x for x in f if x["sev"] == "FAIL"], [])
        warned = {(x["line"], x["san"]) for x in ids(f, "T-SPLIT")}
        self.assertNotIn(("c5-main", "exd4"), warned)
        self.assertNotIn(("c5-nc6", "Nb5"), warned)
        self.assertTrue(ids(f, "T-RULE", "WARN"))              # each rule used once
        self.assertTrue(ids(f, "T-SISTER"))

    def test_unknown_and_unused_rule(self):
        c, f = lint(v3_text(extra_rules="rule: spare | Unused rule | Nothing uses this.\n").replace("{T: hit-c7 | c6 c7", "{T: nope | c6 c7"))
        msgs = " ".join(x["msg"] for x in ids(f, "T-RULE", "FAIL"))
        self.assertIn("unknown rule 'nope'", msgs)
        self.assertIn("'spare' is never used", msgs)
        self.assertIn("'hit-c7' is never used", msgs)

    def test_clue(self):
        c, f = lint(v3_text().replace("| c6 c7 |", "| c6 z9 |"))
        self.assertTrue(ids(f, "T-CLUE", "FAIL"))
        c, f = lint(v3_text().replace("| d4 e3 |", "| h1 |"))
        self.assertTrue(ids(f, "T-CLUE", "WARN"))              # h1 is the same in every compared position
        c, f = lint(v3_text())
        self.assertFalse(ids(f, "T-CLUE"))

    def test_trunk_rules(self):
        c, f = lint(v3_text().replace("main | trunk", "main"))
        self.assertTrue(any("chapter e6" in x["msg"] for x in ids(f, "TRUNK", "FAIL")))
        c, f = lint(v3_text().replace("c5-nc6 | The Nb5 trick: 4...Nc6? | punish | classic", "c5-nc6 | The Nb5 trick: 4...Nc6? | punish | trunk"))
        self.assertTrue(any("chapter c5" in x["msg"] for x in ids(f, "TRUNK", "FAIL")))
        c, f = lint(v3_text().replace("start: e6-c6, c5-main", "start: e6-c6, c5-nc6"))
        self.assertTrue(any("not a trunk" in x["msg"] for x in ids(f, "TRUNK", "FAIL")))
        c, f = lint(v3_text().replace("| Black hits the centre: 3...c5", "| Black hits the centre: 3...c5 | mixed"))
        self.assertTrue(ids(f, "TRUNK", "WARN"))               # mixed chapter that still has a trunk

    def test_too_many_rules(self):
        extra = "".join(f"rule: r{i} | Rule {i} | Text {i}.\n" for i in range(14))
        c, f = lint(v3_text(extra_rules=extra))
        self.assertTrue(ids(f, "RULES", "FAIL"))


class CompileV3(unittest.TestCase):
    def _compile(self, text):
        tmp = Path(tempfile.mkdtemp())
        src = tmp / "fx.txt"; src.write_text(text, encoding="utf-8")
        out = tmp / "o.json"
        rc = cc.main([str(src), "--out", str(out), "--report-dir", str(tmp), "--quiet", "--no-engine"])
        return rc, json.loads(out.read_text(encoding="utf-8"))["courses"][0] if out.exists() else None

    def test_compiled_fields(self):
        rc, c = self._compile(v3_text())
        self.assertEqual(rc, 0)
        self.assertEqual((c["ver"], c["start"], c["learn"]), (3, ["e6-c6", "c5-main"], ["e6-c6", "c5-main", "c5-nc6"]))
        self.assertEqual([r["id"] for r in c["rules"]], ["recapture", "hit-c7"])
        self.assertEqual([ch["trunk"] for ch in c["chapters"]], ["e6-c6", "c5-main"])
        self.assertEqual([ch["mixed"] for ch in c["chapters"]], [False, False])
        L = {l["id"]: l for l in c["lines"]}
        self.assertEqual((L["c5-nc6"]["parent"], L["c5-nc6"]["split"], L["c5-nc6"]["trunk"]), ("c5-main", 7, False))
        self.assertEqual((L["e6-c6"]["parent"], L["e6-c6"]["split"], L["e6-c6"]["trunk"]), (None, None, True))
        self.assertIn("c5-main", L["e6-c6"]["twins"])
        trigs = [n["trig"] for n in c["nodes"].values() if n["trig"]]
        self.assertEqual(len(trigs), 2)
        rc_ = next(t for t in trigs if t["rule"] == "recapture")
        self.assertEqual((rc_["clue"], rc_["not"]), (["d4", "e3"], ["hit-c7"]))
        hc = next(t for t in trigs if t["rule"] == "hit-c7")
        self.assertEqual(hc["not"], ["recapture"])              # only 1 other rule exists
        cases = c["rules"][0]["cases"]
        self.assertEqual([x["line"] for x in cases], ["c5-main"])
        self.assertIn(cases[0]["node"], c["nodes"])

    def test_old_course_gets_empty_fields(self):
        rc, c = self._compile(BASE)
        self.assertEqual(rc, 0)
        self.assertEqual((c["ver"], c["start"], c["learn"], c["rules"]), (2, [], [], []))
        self.assertTrue(all(l["parent"] is None and l["split"] is None and not l["trunk"] and l["twins"] == [] for l in c["lines"]))
        self.assertTrue(all(n["trig"] is None for n in c["nodes"].values()))


class TriggersNeeded(unittest.TestCase):
    def test_worklist(self):
        c = cf.parse_course(v3_text())
        recs = tn.collect(c)
        todo = [r for r in recs if not r["node"].trig]
        self.assertTrue(todo and len(todo) == len(recs) - 2)
        self.assertLessEqual(len(tn.format_place(todo[0]).splitlines()), 2)
        self.assertIn("SPLIT", " ".join(tn.format_place(r) for r in recs))


if __name__ == "__main__":
    unittest.main()
