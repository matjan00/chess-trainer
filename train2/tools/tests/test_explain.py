"""explain.py tests: 30 puzzles (two or more per theme group) whose generated sentence was read against the board by hand.
Run: python -m unittest discover -s train2/tools/tests -p "test_explain.py" -v   (no engine needed)"""
import json, sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import chess
import explain as ex

CASES = json.loads((HERE / "explain_cases.json").read_text(encoding="utf-8"))


class ExplainTests(unittest.TestCase):
    def test_hand_checked_texts(self):
        self.assertGreaterEqual(len(CASES), 30)
        for c in CASES:
            mv = c["moves"].split()
            self.assertEqual(ex.explain(c["fen"], mv, c["themes"], c["group"]), c["why"], c["id"])

    def test_lint_passes_and_facts_hold(self):
        for c in CASES:
            mv = c["moves"].split()
            b = chess.Board(c["fen"]); b.push_uci(mv[0])
            self.assertEqual(ex.lint_why(c["why"], b.fen(), mv[1:]), [], c["id"])

    def test_every_group_covered(self):
        self.assertEqual({c["group"] for c in CASES}, {"hanging", "fork", "pin", "skewer", "discovered", "removal", "deflection",
                         "trapped", "intermezzo", "mate1", "mate2", "backrank", "defend", "promotion", "pawnEndgame", "rookEndgame"})

    def test_lint_catches_faults(self):
        fen = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"
        self.assertTrue(ex.lint_why("The knight on e5 wins the queen.", fen, ["d1d8"]))          # no knight on e5, no queen
        self.assertTrue(ex.lint_why("You win a queen.", fen, ["d1d8"]))                             # nothing captured
        self.assertTrue(ex.lint_why("Best is Rd8#.", fen, ["d1d8"]))                                # notation
        self.assertTrue(ex.lint_why("This is a zugzwang.", fen, ["d1d8"]))                          # jargon
        self.assertTrue(ex.lint_why("The rook is " + "very " * 50 + "good.", fen, ["d1d8"]))          # too long
        self.assertEqual(ex.lint_why("Checkmate: your rook goes to d8, the king is attacked and has no safe square.", fen, ["d1d8"]), [])


if __name__ == "__main__":
    unittest.main()
