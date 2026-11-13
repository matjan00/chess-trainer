"""Tests for the openings2 tools.  Run:  python -m unittest discover -s openings2/tools/tests -v

They use the real Stockfish (depth 22/24, shared cache openings2/cache/evals.json), so the very first run needs
a few minutes; afterwards everything is cached.  Each test seeds one fault in the 3-line fixture and checks that the
verifier reports the right check as FAIL; the clean fixture must have no FAIL.
"""
import json, re, subprocess, sys, tempfile, time, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
sys.path.insert(0, str(TOOLS))
import course_format as cf
import verify_course as vc
import compile_courses2 as cc
from common import Evals

FIXTURE = (HERE / "fixture.txt").read_text(encoding="utf-8")
EV = None


def setUpModule():
    global EV
    EV = Evals()


def tearDownModule():
    EV.close()


def run(text, **kw):
    """Parse + verify a course text; returns the Result."""
    course = cf.parse_course(text)
    return vc.Verifier(course, EV, verbose=False, **kw).run()


def fails(res, fid=None):
    return [f for f in res.findings if f["sev"] == "FAIL" and (fid is None or f["id"] == fid)]


def seeded(old, new, count=1):
    assert old in FIXTURE, f"fixture does not contain {old!r}"
    return FIXTURE.replace(old, new, count)


class ParserTests(unittest.TestCase):
    def test_tokenize_and_tree(self):
        c = cf.parse_course(FIXTURE)
        self.assertEqual([l.id for l in c.lines], ["e6-c6", "c5-main", "c5-nc6"])
        self.assertEqual(c.errors, [])
        n = c.nodes[(c.lines[0].moves[0].key_before, "d4")]
        self.assertEqual(n.owner, "e6-c6")                       # first line owns the shared opening moves
        self.assertEqual(len(n.lines), 3)
        self.assertTrue(c.lines[0].moves[12].plan)               # plan note on 7.Nf3
        self.assertEqual(c.lines[0].moves[12].ply, 13)
        self.assertEqual(c.lines[0].moves[12].san, "Nf3")
        self.assertEqual(c.lines[2].moves[7].nag, "?")           # 4...Nc6?
        self.assertTrue(c.lines[0].moves[12].mine)
        self.assertEqual(c.skips[0]["san"], "h6")

    def test_tokens(self):
        t = cf.tokenize("7. Bf4!sys {x [g:a1-a2]} 7...Nc6?! => other")
        self.assertEqual([k for k, _ in t], ["m", "c", "m", "to"])
        self.assertEqual(cf.split_nag("Bf4!sys"), ("Bf4", "!sys"))
        self.assertEqual(cf.split_nag("Nc6?!"), ("Nc6", "?!"))
        text, shapes = cf.extract_shapes("Hello [g:b5-c7] and [r:c7].")
        self.assertEqual(shapes, ["g:b5-c7", "r:c7"])
        self.assertEqual(text, "Hello and .")

    def test_xnote_alt_quiz(self):
        src = ("# COURSE t | T | white\n## CHAPTER a | A\n### LINE l | L | main\n> hi\n"
               "1. e4 {Centre. [g:e2-e4]} e5 {Q: x} 2. Nf3 {X: Bc4 | Not yet ((2.Bc4 Nf6)). | } Nc6 "
               "3. Bb5 {A: Bc4 | also good} {? What now? | *Castle | Nothing || Castling is safe.} a6")
        c = cf.parse_course(src)
        m = c.lines[0].moves
        self.assertEqual(m[2].xs[0]["san"], "Bc4")
        self.assertEqual(m[4].alts[0]["san"], "Bc4")
        self.assertEqual(m[4].quiz["answer"], 0)
        self.assertEqual(cf.variations(m[2].xs[0]["why"]), ["2.Bc4 Nf6"])


class SeededFaultTests(unittest.TestCase):
    def test_clean_fixture_has_no_fail(self):
        res = run(FIXTURE)
        self.assertEqual([f"{f['id']} {f['line']} {f['ply']} {f['msg']}" for f in fails(res)], [])
        self.assertEqual(len(res.summary), 3)

    def test_illegal_san(self):
        res = run(seeded("7. Nf3 {Develops", "7. Bxh7 {Develops"))
        hit = fails(res, "Q7")
        self.assertTrue(hit and hit[0]["line"] == "e6-c6" and hit[0]["ply"] == 13, hit)

    def test_opponent_hangs_a_knight(self):
        text = re.sub(r"Bf5 8\. O-O \{[^}]*\} e6 9\. Na4 \{[^}]*\}",
                      "Nxd4 8. Nxd4 {Wins a piece. [g:f3-d4]} e6 9. O-O {The king is safe. [g:g1]}", FIXTURE)
        self.assertNotEqual(text, FIXTURE)
        res = run(text)
        hit = [f for f in fails(res, "Q5") if f["san"] == "Nxd4"]
        self.assertTrue(hit, res.findings)
        self.assertIn("loses", hit[0]["msg"])

    def test_our_move_loses_80cp(self):
        tail = re.search(r"8\. Bxa6.*?\n\n## CHAPTER c5", FIXTURE, re.S).group(0)
        new_tail = ("8. g4 {Grabs space on the kingside. [g:g2-g4]} Qb6 9. Bxa6 {Takes the knight. [g:f1-a6]} "
                    "{P: Your plan: 1. Castle. 2. Re1. 3. e4. [g:g1]}\n\n## CHAPTER c5")
        res = run(FIXTURE.replace(tail, new_tail))
        hit = [f for f in fails(res, "Q1") if f["san"] == "g4"]
        self.assertTrue(hit, res.findings)
        m = re.search(r"loses (\d+) cp", hit[0]["msg"])
        self.assertTrue(60 <= int(m.group(1)) <= 120, hit)

    def test_two_moves_in_one_position(self):
        extra = ("\n### LINE e6-order | Move order: 1...Nf6 | side\n> Same position reached by a different move order.\n"
                 "1. d4 Nf6 2. Nc3 d5 3. Bf4 e6 4. Nb5 Na6 5. a3 {A different move in the same position.}\n")
        res = run(seeded("\n## CHAPTER c5", extra + "\n## CHAPTER c5"))
        hit = fails(res, "Q10")
        self.assertTrue(hit and "a3" in hit[0]["msg"] and "e3" in hit[0]["msg"], hit)

    def test_line_ends_mid_exchange(self):
        tail = re.search(r"bxa6 9\. O-O.*?\n\n## CHAPTER c5", FIXTURE, re.S).group(0)
        res = run(FIXTURE.replace(tail, "{P: Your plan: 1. Castle. 2. Re1. 3. e4. [g:g1]}\n\n## CHAPTER c5"))
        hit = [f for f in fails(res, "Q12") if f["line"] == "e6-c6"]
        self.assertTrue(hit, res.findings)
        self.assertIn("mid-exchange", hit[0]["msg"])

    def test_bad_variation(self):
        res = run(seeded("Opens the road for the bishop on f1 and guards d4.",
                         "Opens the road for the bishop on f1 and guards d4 ((5.e3 Bb4+ 6.c3 Bxc3+))."))
        hit = fails(res, "Q19")
        self.assertTrue(hit and "does not hold" in hit[0]["msg"], hit)

    def test_illegal_variation(self):
        res = run(seeded("guards d4.", "guards d4 ((5.e3 Bb4+ 6.Qd1))."))
        self.assertTrue(fails(res, "Q19"))

    def test_good_variation_passes(self):
        res = run(seeded("guards d4.", "guards d4 ((5.Nf3 c6 6.e3 Bd7))."))
        self.assertEqual(fails(res, "Q19"), [])

    def test_made_up_model_source(self):
        for src in ("chessgames.com:12345", "explorer.json:jobava", "explorer.json:nosuchcourse"):
            res = run(FIXTURE + f"### GAME zz999999 | Carlsen, M. | Nobody, X. | 2019 | 1-0 | {src}\n")
            self.assertTrue(fails(res, "M1"), src)
        ok = run(FIXTURE + "### GAME AbCdEfGh | Carlsen, M. | Nobody, X. | 2019 | 1-0 | lichess-masters:AbCdEfGh\n")
        self.assertEqual(fails(ok, "M1"), [])

    def test_text_rules(self):
        res = run(seeded("It eyes the c7 square.", "It eyes the c7 square, +0.35 says the engine says obviously."))
        self.assertTrue(fails(res, "Q18"))
        res = run(seeded("[g:b5-c7]} Na6", "[g:b5-z9]} Na6"))
        self.assertTrue(fails(res, "Q20"))
        res = run(seeded("5. e3 {Opens the road for the bishop on f1 and guards d4. [g:f1-d3]}", "5. e3"))
        self.assertTrue([f for f in fails(res, "Q17") if f["san"] == "e3"])

    def test_wrong_length_and_conflicting_comment(self):
        res = run(seeded("\n## CHAPTER c5", "\n### LINE short | Too short | side\n> x\n1. d4 d5 2. Nc3 {c} Nf6 3. Bf4 {c}\n\n## CHAPTER c5"))
        self.assertTrue(fails(res, "Q8"))
        res = run(seeded("\n## CHAPTER c5", "\n### LINE dup | Dup | side\n> x\n1. d4 d5 2. Nc3 {A different comment.} Nf6 3. Bf4 e6\n\n## CHAPTER c5"))
        self.assertTrue(fails(res, "F1") or fails(res, "Q8"))


class CacheAndCompileTests(unittest.TestCase):
    def test_second_run_uses_cache_under_10s(self):
        py = sys.executable
        cmd = [py, str(TOOLS / "verify_course.py"), str(HERE / "fixture.txt"), "--out", str(Path(tempfile.gettempdir()) / "fx.verify.txt"), "--quiet"]
        EV.save()
        subprocess.run(cmd, capture_output=True, text=True)           # make sure the cache is warm
        t = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True)
        dt = time.time() - t
        self.assertEqual(p.returncode, 0, p.stdout[-800:])
        self.assertIn("0 new searches", p.stderr)
        self.assertLess(dt, 10, f"cached run took {dt:.1f}s")

    def test_compile_matches_spec_and_ids_are_stable(self):
        tmp = Path(tempfile.mkdtemp())
        src1 = tmp / "fx.txt"; src1.write_text(FIXTURE, encoding="utf-8")
        # same course, chapters and lines written in another order
        chs = re.split(r"(?m)^(?=## CHAPTER )", FIXTURE.split("## MODELS")[0])
        head, ch_e6, ch_c5 = chs[0], chs[1], chs[2]
        c5_head = ch_c5.split("### LINE")[0]
        c5_lines = ["### LINE" + x for x in ch_c5.split("### LINE")[1:]]
        reordered = head + c5_head + c5_lines[1] + c5_lines[0] + ch_e6 + "## MODELS\n"
        src2 = tmp / "fx2.txt"; src2.write_text(reordered, encoding="utf-8")
        out1, out2 = tmp / "a.json", tmp / "b.json"
        for s, o in ((src1, out1), (src2, out2)):
            rc = cc.main([str(s), "--out", str(o), "--report-dir", str(tmp), "--quiet"])
            self.assertEqual(rc, 0)
        d1 = json.loads(out1.read_text(encoding="utf-8")); d2 = json.loads(out2.read_text(encoding="utf-8"))
        self.assertEqual(d1["v"], 2)
        c1, c2 = d1["courses"][0], d2["courses"][0]
        for k in ("id", "title", "side", "sub", "why", "ideas", "structures", "chapters", "lines", "nodes", "cards", "traps", "models"):
            self.assertIn(k, c1)
        self.assertEqual(set(c1["nodes"]), set(c2["nodes"]))
        self.assertEqual({c["id"] for c in c1["cards"]}, {c["id"] for c in c2["cards"]})
        self.assertEqual(c1["lines"][0]["nodes"], [l for l in c1["lines"] if l["id"] == "e6-c6"][0]["nodes"])
        # a node: shape of section 3
        n = next(iter(c1["nodes"].values()))
        for k in ("k", "san", "uci", "ply", "mine", "key", "nag", "c", "shapes", "plan", "x", "quiz", "ev", "loss"):
            self.assertIn(k, n)
        mine = [n for n in c1["nodes"].values() if n["mine"]]
        self.assertTrue(all("alts" in n for n in mine))
        opp = [n for n in c1["nodes"].values() if not n["mine"]]
        self.assertTrue(any(n.get("st") for n in opp))
        card = c1["cards"][0]
        for k in ("id", "k", "fen", "san", "node", "line", "lines", "ply"):
            self.assertIn(k, card)
        self.assertEqual(card["id"], card["node"])
        self.assertEqual(len(card["id"]), 8)
        # id formula
        import hashlib
        self.assertEqual(card["id"], hashlib.md5(f"fx|{card['k']}|{card['san']}".encode()).hexdigest()[:8])
        for l in c1["lines"]:
            self.assertIn("reach", l); self.assertIn("ev", l); self.assertIn("to", l)

    def test_compile_refuses_failing_course_without_force(self):
        tmp = Path(tempfile.mkdtemp())
        bad = tmp / "bad.txt"; bad.write_text(seeded("7. Nf3 {Develops", "7. Bxh7 {Develops"), encoding="utf-8")
        out = tmp / "o.json"
        rc = cc.main([str(bad), "--out", str(out), "--report-dir", str(tmp), "--quiet"])
        self.assertEqual(rc, 1); self.assertFalse(out.exists())
        rc = cc.main([str(bad), "--out", str(out), "--report-dir", str(tmp), "--quiet", "--force"])
        self.assertTrue(json.loads(out.read_text(encoding="utf-8"))["courses"][0].get("draft"))


if __name__ == "__main__":
    unittest.main()
