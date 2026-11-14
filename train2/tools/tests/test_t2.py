"""Tests for the Train 2 foundation tools.  Run:  python -m unittest discover -s train2/tools/tests -v

They use the real Stockfish and the real Lichess tablebase (answers are cached in train2/cache/*, so the first run needs a few
minutes and a handful of HTTP requests; later runs are warm and finish in about a minute).  Each seeded-fault test changes the
2-lesson fixture and checks that the verifier reports the right check as FAIL; the clean fixture must have no FAIL.
"""
import json, os, sys, tempfile, textwrap, time, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
sys.path.insert(0, str(TOOLS))
import chess, chess.engine
import t2common as tc
import tb as tbmod
import lesson_format as lf
import verify_lessons as vl
import compile_train2 as ct

FIXTURE = (HERE / "fixture.txt").read_text(encoding="utf-8")
EV = None
TB = None
PY = sys.executable


def setUpModule():
    global EV, TB
    EV = tc.T2Evals()
    TB = tbmod.default()


def tearDownModule():
    EV.close()
    TB.save()


def run(text, lesson=None, **kw):
    course = lf.parse_course(text)
    return vl.verify(course, ev=EV, tb=TB, only_lesson=lesson, verbose=False, **kw)


def fails(res, fid=None):
    return [f for f in res.findings if f["sev"] == "FAIL" and (fid is None or f["id"] == fid)]


def seeded(old, new, count=1):
    assert old in FIXTURE, f"fixture does not contain {old!r}"
    return FIXTURE.replace(old, new, count)


FAKE_ENGINE = textwrap.dedent("""
    import sys
    # answers the UCI handshake, then never answers 'go'
    for line in sys.stdin:
        line = line.strip()
        if line == 'uci':
            print('id name Fake'); print('uciok'); sys.stdout.flush()
        elif line == 'isready':
            print('readyok'); sys.stdout.flush()
        elif line == 'quit':
            break
""")


class CommonTests(unittest.TestCase):
    def test_win_pct(self):
        self.assertAlmostEqual(tc.win_pct(0), 50.0, places=3)
        self.assertGreater(tc.win_pct(300), 70); self.assertLess(tc.win_pct(300), 80)
        self.assertEqual(tc.win_pct(10000), 100.0); self.assertEqual(tc.win_pct(-10000), 0.0)
        self.assertAlmostEqual(tc.win_pct(5000), tc.win_pct(1000), places=6)        # clamp at +-1000

    def test_jsonl_cache_resume_and_deeper_entry_serves(self):
        with tempfile.TemporaryDirectory() as d:
            c = tc.JsonlCache(Path(d) / "x.jsonl")
            c.append([("f1", 16, 3, [{"m": "a", "cp": 1, "pv": [], "d": 16}, {"m": "b", "cp": 0, "pv": [], "d": 16}]), ("f2", 16, 3, "timeout")])
            c2 = tc.JsonlCache(Path(d) / "x.jsonl")
            self.assertEqual(c2.n, 2)
            self.assertEqual(c2.find("f1", 12, 2)[0]["m"], "a")            # deeper + wider serves shallower + narrower
            self.assertEqual(len(c2.find("f1", 12, 1)), 1)
            self.assertIsNone(c2.find("f1", 20, 3))
            self.assertEqual(c2.find("f2", 16, 3), "timeout")
            with open(Path(d) / "x.jsonl", "a") as f:
                f.write('{"k": "half')                                       # a crash left half a line
            self.assertEqual(tc.JsonlCache(Path(d) / "x.jsonl").n, 2)


class WatchdogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = Path(tempfile.mkdtemp()) / "fake_engine.py"
        cls.fake.write_text(FAKE_ENGINE, encoding="utf-8")

    def test_no_uncapped_search(self):
        e = tc.SafeEngine([PY, str(self.fake)])
        with self.assertRaises(ValueError):
            e.analyse(chess.Board(), chess.engine.Limit(depth=5))

    def test_hung_engine_is_killed_within_cap_plus_15(self):
        e = tc.SafeEngine([PY, str(self.fake)], threads=1)
        t0 = time.time()
        with self.assertRaises(tc.EngineTimeout):
            e.analyse(chess.Board(), chess.engine.Limit(time=2))
        dt = time.time() - t0
        self.assertLess(dt, 2 + 15 + 5, f"took {dt:.1f}s")
        self.assertEqual(e.kills, 1)
        self.assertIsNone(e.eng)                                              # next call would start a fresh process

    def test_bulk_survives_a_hung_engine_and_records_timeouts(self):
        with tempfile.TemporaryDirectory() as d:
            t0 = time.time()
            r = tc.bulk([chess.STARTING_FEN, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"], Path(d) / "c.jsonl",
                        depth=5, time_cap=2, workers=2, cmd=[PY, str(self.fake)], max_minutes=2)
            self.assertLess(time.time() - t0, 2 + 15 + 25)
            self.assertEqual(r["timeouts"], 2)
            r2 = tc.bulk([chess.STARTING_FEN], Path(d) / "c.jsonl", depth=5, time_cap=2, workers=1, cmd=[PY, str(self.fake)])
            self.assertEqual(r2["searched"], 0)                                # the timeout is cached: skipped, not retried

    def test_bulk_real_engine_resumable(self):
        fens = [chess.STARTING_FEN, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "b.jsonl"
            r = tc.bulk(fens, p, depth=8, time_cap=3, multipv=2, workers=2)
            self.assertEqual(r["searched"], 3); self.assertEqual(r["timeouts"], 0)
            self.assertTrue(all(len(v) == 2 for v in r["results"].values()))
            r2 = tc.bulk(fens, p, depth=8, time_cap=3, multipv=2, workers=2)
            self.assertEqual(r2["searched"], 0); self.assertEqual(r2["cached"], 3)
            r3 = tc.bulk(fens + ["4k3/8/8/8/8/8/8/4K2R w K - 0 1"], p, depth=8, time_cap=3, multipv=2, workers=2)
            self.assertEqual(r3["searched"], 1)                                # only the new position
            r4 = tc.bulk(fens + ["4k3/8/8/8/8/8/8/4K2R w - - 0 1"], p, depth=8, time_cap=3, multipv=2, workers=1, max_minutes=0)
            self.assertTrue(r4["stopped_by_time"] or r4["searched"] <= 1)


class TablebaseTests(unittest.TestCase):
    def test_selftest(self):
        self.assertTrue(tbmod.selftest(TB, verbose=False))

    def test_direction_is_the_movers_view(self):
        r = TB.probe("7k/5K2/8/8/8/8/8/6Q1 w - - 0 1")
        self.assertEqual(r["moves"]["g1g7"]["wdl"], "win")        # Qg7#
        self.assertEqual(r["moves"]["g1g6"]["wdl"], "draw")       # stalemate

    def test_a_wrong_direction_is_caught(self):
        real = tbmod.flip
        tbmod.flip = lambda x: x          # a module that forgets to flip the service's point of view
        try:
            # the probe() code uses flip() for moves, so the seeded bug breaks the mover's view
            with self.assertRaises(tbmod.TBError):
                tbmod.selftest(tbmod.Tablebase(), verbose=False)
        finally:
            tbmod.flip = real

    def test_rate_limit_backoff_and_cache(self):
        calls, sleeps = [], []
        seq = [(429, ""), (429, ""), (200, json.dumps({"category": "draw", "dtm": None, "dtz": 0, "moves": []}))]

        def runner(url):
            calls.append(url); return seq[min(len(calls) - 1, 2)]
        with tempfile.TemporaryDirectory() as d:
            t = tbmod.Tablebase(Path(d) / "tb.json", runner=runner, min_gap=0.5, sleeper=sleeps.append)
            r = t.probe("8/8/8/8/8/8/k7/K6P w - - 0 1")
            self.assertEqual(r["wdl"], "draw")
            self.assertEqual(len(calls), 3)
            self.assertGreaterEqual(max(sleeps), 10)                       # 5 s then 10 s back-off
            self.assertIn("tablebase.lichess.ovh", calls[0])
            t.probe("8/8/8/8/8/8/k7/K6P w - - 0 1")
            self.assertEqual(len(calls), 3)                                # cached
            with self.assertRaises(tbmod.TBError):
                t.probe(chess.STARTING_FEN)                                # > 7 men is never sent

    def test_classes(self):
        b = chess.Board("3k4/8/3K4/3P4/8/8/8/8 w - - 0 1")
        best, ref, cl = tbmod.move_classes(TB.probe(b))
        self.assertEqual(best, "win")
        self.assertEqual(sorted(b.san(chess.Move.from_uci(u)) for u, c in cl.items() if c == "ok"), ["Kc6", "Ke6"])


class ParserTests(unittest.TestCase):
    def test_fixture_parses(self):
        c = lf.parse_course(FIXTURE)
        self.assertEqual(c.errors, [])
        self.assertEqual([l.id for l in c.lessons], ["fork", "kpk"])
        ex = c.lesson("fork").item("fork-a")
        self.assertEqual([m.san for m in ex.moves], ["Nf7+", "Kg8", "Nxd8"])
        self.assertTrue(ex.moves[0].key)
        self.assertEqual(ex.moves[0].shapes, ["g:f7-h8", "g:f7-d8"])
        self.assertEqual(c.lesson("fork").item("fork-1").sol, ["Nf2+", "Kg1", "Nxd1"])
        self.assertEqual(c.lesson("kpk").item("kpk-1").also[0]["san"], "Ke6")
        self.assertEqual(c.lesson("kpk").item("kpk-p").params["finish"], "promote")

    def test_illegal_move_is_a_format_finding(self):
        c = lf.parse_course(seeded("2. Nxd8 {White wins", "2. Nxd1 {White wins"))
        self.assertTrue([e for e in c.errors if e["id"] == "F1"])

    def test_glossary_braces(self):
        c = lf.parse_course(seeded("{White wins the queen for free.}", "{White wins the {gl:fork} queen for free.}"))
        self.assertIn("fork", c.lesson("fork").item("fork-a").moves[2].c)
        self.assertEqual(c.errors, [])


class VerifierTests(unittest.TestCase):
    def test_clean_fixture_has_no_fail(self):
        res = run(FIXTURE)
        self.assertEqual([f for f in res.fails], [], "\n".join(f["msg"] for f in res.fails))
        self.assertTrue(res.items["kpk-1"]["tb"])
        self.assertEqual(res.items["kpk-1"]["ok"].__len__(), 2)

    def test_illegal_fen_L1(self):
        r = run(seeded("r5k1/ppp5/8/8/4n3/8/6PP/3Q3K b - - 0 1", "r5k1/ppp5/8/8/4n3/8/6PP/3Q3K b - - 0"), lesson="fork")
        self.assertEqual(fails(r, "L1"), [])                          # a missing fullmove counter is tolerated by python-chess ...
        r = run(seeded("r5k1/ppp5/8/8/4n3/8/6PP/3Q3K b - - 0 1", "r5k1/ppp5/8/8/4n3/8/6PP/3Q3 b - - 0 1"), lesson="fork")
        self.assertTrue(fails(r, "L1"))                               # no white king

    def test_side_to_move_and_last_move_L1(self):
        r = run(seeded("src=composed\nsol: Nf2+", "src=composed | last=a8a7\nsol: Nf2+"), lesson="fork")
        self.assertTrue(fails(r, "L1"), "last move that does not belong to the side that just moved")

    def test_duplicate_position_L1(self):
        r = run(seeded("#### CARD fork-2 | k3q3/pp6/8/3N4/8/8/5PPP/1K5R w - - 0 1", "#### CARD fork-2 | r5k1/ppp5/8/8/4n3/8/6PP/3Q3K b - - 0 1"), lesson="fork")
        self.assertTrue(fails(r, "L1"))

    def test_card_with_two_solutions_L4(self):
        extra = ("\n#### CARD fork-9 | 4k3/8/8/8/3q4/5N2/2N5/4K3 w - - 0 1 | src=composed\nsol: Ncxd4\nwhy: The knight takes the queen.\n"
                 "wrong: Ke2 | The queen runs away.\n")
        text = FIXTURE.replace("\n### LESSON kpk", extra.replace("The queen runs away.", "The queen runs away.") + "\n### LESSON kpk")
        r = run(text, lesson="fork")
        self.assertTrue(fails(r, "L4"), "two knights can take the queen")
        self.assertIn("not named", " ".join(f["msg"] for f in fails(r, "L4")))
        text2 = text.replace("sol: Ncxd4\n", "sol: Ncxd4\nalso: Nfxd4 | The other knight works too.\n")
        r2 = run(text2, lesson="fork")
        self.assertFalse([f for f in fails(r2, "L4") if f["item"] == "fork-9" and "not named" in f["msg"] and "Nfxd4" in f["msg"]])   # named in an 'also:' line: accepted

    def test_opponent_defends_badly_L3(self):
        ex = ("\n#### EX fork-b | 3q3k/6pp/8/4N3/8/8/PPP5/R5K1 b - - 0 1 | src=composed\n"
              "1... h6{Q} {Black ignores the knight.} 2. Nf7+! {The fork.} Kh7 3. Nxd8 {White wins the queen.}\nkey: Look at the knight first.\n")
        bad = FIXTURE.replace("\n#### CARD fork-1", ex.replace("h6{Q}", "h6") + "\n#### CARD fork-1")
        self.assertTrue(fails(run(bad, lesson="fork"), "L3"))
        flagged = bad.replace("1... h6 {Black ignores", "1... h6? {Black ignores")
        self.assertEqual(fails(run(flagged, lesson="fork"), "L3"), [])

    def test_drawn_win_playout_L8(self):
        text = seeded("#### PLAY kpk-p | 8/8/3k4/8/3K4/3P4/8/8 b - - 0 1 | side=white", "#### PLAY kpk-p | 8/8/3k4/8/3P4/3K4/8/8 w - - 0 1 | side=white")
        r = run(text, lesson="kpk")
        self.assertTrue([f for f in fails(r, "L8") if "true result" in f["msg"]])

    def test_playout_max_too_small_L8(self):
        r = run(seeded("max=80", "max=3"), lesson="kpk")
        self.assertTrue([f for f in fails(r, "L8") if "max" in f["msg"]])

    def test_jargon_X2(self):
        bad = seeded("rule: A knight check that also attacks the queen wins the queen.", "rule: A knight check that creates zugzwang wins the queen.")
        self.assertTrue(fails(run(bad, lesson="fork"), "X2"))
        self.assertEqual(fails(run(bad.replace("creates zugzwang", "creates {gl:zugzwang}"), lesson="fork"), "X2"), [])
        self.assertEqual(fails(run(bad.replace("zugzwang wins", "zugzwang (the other side must move and loses) wins"), lesson="fork"), "X2"), [])

    def test_false_material_claim_X4(self):
        bad = seeded("3. Ke4 {The king keeps in front of the pawn.}", "3. Ke4 {The king keeps in front and wins the queen.}")
        self.assertTrue(fails(run(bad, lesson="kpk"), "X4"))
        self.assertEqual(fails(run(FIXTURE, lesson="fork"), "X4"), [])              # the true claim in fork-a passes

    def test_wrong_line_must_be_worse_L7(self):
        bad = seeded("wrong: Nd2 | ((1...Nd2 2.Qxd2)) The queen takes the knight.", "wrong: Nxd... | ((1...Nd2 2.Qxd2)) x")
        self.assertTrue(run(bad, lesson="fork").findings)                              # (illegal wrong move) -> format finding
        bad2 = seeded("((1...Nd2 2.Qxd2))", "((1...Nd2 2.Qxd4))")
        r2 = run(bad2, lesson="fork")
        self.assertTrue(fails(r2, "X3") and fails(r2, "L7"))                           # illegal variation

    def test_text_limits_X1_X5(self):
        long = "This is a very long sentence that keeps going on and on without any sensible place to stop for breath so the reader gets lost and then keeps reading anyway."
        self.assertTrue(fails(run(seeded("goal: Fork the king and the queen with a knight.", "goal: " + long), lesson="fork"), "X1"))
        self.assertTrue(fails(run(seeded("The knight checks the king and attacks the queen on d1. You win the queen.", "The engine says +3.2 so this is obviously good."), lesson="fork"), "X5"))

    def test_shape_L10(self):
        r = run(seeded("key: Look for a knight check that also attacks the queen.\n", ""), lesson="fork")
        self.assertTrue(fails(r, "L10"))


class CompilerTests(unittest.TestCase):
    def test_compile_fixture_and_warm_run(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "fixture.txt"; src.write_text(FIXTURE, encoding="utf-8")
            out = Path(d) / "train2.json"
            args = [str(src), "--out", str(out), "--lock", str(Path(d) / "lock.json"), "--report-dir", d]
            self.assertEqual(ct.main(args), 0)
            t0 = time.time()
            self.assertEqual(ct.main(args), 0)
            self.assertLess(time.time() - t0, 30, "warm second run must take < 30 s")
            doc = json.loads(out.read_text(encoding="utf-8"))
            c = doc["courses"][0]
            self.assertEqual(c["id"], "fixture"); self.assertNotIn("draft", c)
            self.assertEqual(set(c["lessons"]), {"fork", "kpk"})
            card = c["cards"]["kpk-1"]
            self.assertEqual(sorted(card["ok"]), ["d6c6", "d6e6"]); self.assertTrue(card["tb"])
            self.assertEqual(card["sol"], ["d6c6"]); self.assertIn("d6e6", card["also"])
            self.assertEqual(c["cards"]["fork-1"]["sol"], ["e4f2", "h1g1", "f2d1"]); self.assertFalse(c["cards"]["fork-1"]["tb"])
            self.assertEqual([s["t"] for s in c["lessons"]["kpk"]["steps"]], ["ex", "card", "card", "card", "play"])
            self.assertTrue(c["plays"]["kpk-p"]["tb"])
            self.assertTrue(c["lessons"]["fork"]["steps"][0]["moves"][0]["key"])

    def test_refuses_on_fail_and_force_stamps_draft(self):
        with tempfile.TemporaryDirectory() as d:
            bad = seeded("sol: Kc6", "sol: Kc5")
            src = Path(d) / "fixture.txt"; src.write_text(bad, encoding="utf-8")
            out = Path(d) / "train2.json"
            args = [str(src), "--out", str(out), "--lock", str(Path(d) / "lock.json"), "--report-dir", d]
            self.assertEqual(ct.main(args), 1)
            self.assertFalse(out.exists())
            self.assertEqual(ct.main(args + ["--force"]), 0)
            self.assertTrue(json.loads(out.read_text(encoding="utf-8"))["courses"][0]["draft"])


if __name__ == "__main__":
    unittest.main()
