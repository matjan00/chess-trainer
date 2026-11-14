"""Lichess tablebase client for the Train 2 tools (BLUEPRINT section 2.1).

    probe(fen)  ->  {"wdl": "win|draw|loss"  (side to move),  "dtm": plies | None,  "dtz": int | None,
                     "moves": {uci: {"wdl": ... (MOVER's view),  "dtm": plies from the position, "dtz": ...}}}

* `https://tablebase.lichess.ovh/standard?fen=...` called with `curl` (Python's certificate store is outdated on this PC),
  generic user agent, no personal data, at most 1 request per second, retry with back-off on 429 / 5xx.
* The service labels a move's `category` from the point of view of the side to move AFTER the move: a move marked `loss`
  wins for the player who made it.  This module hides that: `moves[uci]["wdl"]` is always the mover's own view.
* `cursed-win` / `blessed-loss` (won or lost only on the 50-move rule) count as `draw`.
* `dtm` is in plies counted from the probed position (1 = the next move mates); for a drawn move it is None.
  `dtm_moves(plies)` turns it into full moves.  Where the service has no dtm (some 6-7 man positions) `dtz` is used by callers.
* The RAW service answer is cached in train2/cache/tb.json (key: first 4 FEN fields), so a re-run costs nothing.
  Only <= 7 men, no castling rights.
* `python tb.py --selftest` must pass before anything trusts the module; `python tb.py "<fen>"` prints a position.
"""
import json, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chess
from t2common import CACHE_DIR, LockedJson, men

URL = "https://tablebase.lichess.ovh/standard?fen="
UA = "chess-trainer-build/1.0"
TB_PATH = CACHE_DIR / "tb.json"
MIN_GAP = 1.1                      # seconds between two requests
CAT = {"win": "win", "loss": "loss", "draw": "draw", "cursed-win": "draw", "blessed-loss": "draw",
       "maybe-win": "win", "maybe-loss": "loss"}


class TBError(Exception):
    pass


def key_of(fen):
    f = fen.split()
    return " ".join((f + ["-", "-"])[:4])


def available(board):
    """True when the tablebase can decide this position (<= 7 men, no castling rights)."""
    return men(board) <= 7 and not board.castling_rights


def flip(wdl):
    return {"win": "loss", "loss": "win", "draw": "draw"}[wdl]


class Tablebase:
    def __init__(self, path=TB_PATH, runner=None, min_gap=MIN_GAP, sleeper=time.sleep):
        self.cache = LockedJson(path)
        self.runner = runner or self._curl      # a stand-in for tests: runner(url) -> (http_code, body_text)
        self.min_gap, self.sleep = min_gap, sleeper
        self.last = 0.0
        self.calls = 0; self.hits = 0; self.retries = 0

    @staticmethod
    def _curl(url):
        p = subprocess.run(["curl", "-s", "-m", "25", "-A", UA, "-w", "\n%{http_code}", url],
                           capture_output=True, timeout=40)
        out = p.stdout.decode("utf-8", "replace")
        body, _, code = out.rpartition("\n")
        return int(code or 0), body

    def _fetch(self, fen):
        url = URL + fen.replace(" ", "_")
        delay = 5.0
        for attempt in range(7):
            gap = self.min_gap - (time.time() - self.last)
            if gap > 0:
                self.sleep(gap)
            self.last = time.time()
            self.calls += 1
            try:
                code, body = self.runner(url)
            except Exception as e:             # curl missing / timeout: treat like a 5xx
                code, body = 0, str(e)
            if code == 200:
                return json.loads(body)
            if code in (400, 404):
                raise TBError(f"tablebase rejected the position ({code}): {fen}")
            if code in (429, 0) or code >= 500:
                self.retries += 1
                self.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise TBError(f"unexpected HTTP {code} for {fen}")
        raise TBError(f"tablebase unavailable after retries: {fen}")

    def raw(self, fen):
        board = chess.Board(fen)
        if not available(board):
            raise TBError(f"not a tablebase position (>7 men or castling rights): {fen}")
        k = key_of(board.fen())
        r = self.cache.get(k)
        if r is not None:
            self.hits += 1
            return r
        full = self._fetch(" ".join(board.fen().split()[:4]) + " 0 1")
        r = {"cat": full.get("category"), "dtm": full.get("dtm"), "dtz": full.get("dtz"),
             "mate": bool(full.get("checkmate")), "stale": bool(full.get("stalemate")),
             "moves": [[m["uci"], m.get("category"), m.get("dtm"), m.get("dtz")] for m in full.get("moves", [])]}
        self.cache.set(k, r)
        if len(self.cache.dirty) >= 20:
            self.cache.save()
        return r

    def probe(self, fen_or_board):
        fen = fen_or_board if isinstance(fen_or_board, str) else fen_or_board.fen()
        r = self.raw(fen)
        if r["cat"] not in CAT:
            raise TBError(f"unknown category {r['cat']!r}: {fen}")
        board = chess.Board(fen)
        out = {"wdl": CAT[r["cat"]], "dtm": abs(r["dtm"]) if r.get("dtm") is not None else None,
               "dtz": abs(r["dtz"]) if r.get("dtz") is not None else None, "moves": {}}
        for uci, cat, dtm, dtz in r["moves"]:
            if cat not in CAT:
                raise TBError(f"unknown move category {cat!r}: {fen} {uci}")
            mover = flip(CAT[cat])                      # service: category is for the side to move AFTER the move
            mate_now = False
            if dtm is None and mover == "win":              # the service leaves dtm empty for a move that mates
                board.push_uci(uci); mate_now = board.is_checkmate(); board.pop()
            out["moves"][uci] = {"wdl": mover,
                                 "dtm": 1 if mate_now else ((abs(dtm) + 1) if (dtm is not None and mover != "draw") else None),
                                 "dtz": (abs(dtz) + 1) if (dtz is not None and mover != "draw") else None}
        return out

    def save(self):
        self.cache.save()


_DEFAULT = None


def default():
    global _DEFAULT
    if _DEFAULT is None:
        _DEFAULT = Tablebase()
    return _DEFAULT


def probe(fen_or_board):
    return default().probe(fen_or_board)


def dtm_moves(plies):
    return None if plies is None else (plies + 1) // 2


def move_classes(info, slack_moves=4):
    """Split the legal moves of a probe() result by quality for the mover.
    Returns (best_wdl, quickest_plies | None, {uci: 'ok' | 'slow' | 'worse'}).
    ok = keeps the best category and, in a win/loss, is at most `slack_moves` full moves slower than the quickest (loss: faster
    mate delay does not matter - the *longest* defence is best); slow = keeps the category but wastes more than that; worse = changes it."""
    order = {"win": 2, "draw": 1, "loss": 0}
    best = max((v["wdl"] for v in info["moves"].values()), key=order.get) if info["moves"] else info["wdl"]
    same = {u: v for u, v in info["moves"].items() if v["wdl"] == best}
    ref = None
    if best == "win":
        d = [(v["dtm"] if v["dtm"] is not None else v["dtz"]) for v in same.values()]
        ref = min(x for x in d if x is not None) if any(x is not None for x in d) else None
    elif best == "loss":
        d = [(v["dtm"] if v["dtm"] is not None else v["dtz"]) for v in same.values()]
        ref = max(x for x in d if x is not None) if any(x is not None for x in d) else None
    out = {}
    for u, v in info["moves"].items():
        if v["wdl"] != best:
            out[u] = "worse"
        elif ref is None or best == "draw":
            out[u] = "ok"
        else:
            x = v["dtm"] if v["dtm"] is not None else v["dtz"]
            slower = (x - ref) if best == "win" else (ref - x)
            out[u] = "ok" if slower <= 2 * slack_moves else "slow"
    return best, ref, out


def selftest(tb=None, verbose=True):
    """KQ v K is a win, K+P v K with the defender in the corner is a draw, mate = win and stalemate = draw for the MOVER.
    Raises TBError on any mismatch (a wrong direction would silently poison every endgame lesson)."""
    tb = tb or default()
    checks = []
    a = tb.probe("7k/5K2/8/8/8/8/8/6Q1 w - - 0 1")          # Qg7# wins, Qg6 is stalemate
    checks.append(("KQ v K, white to move = win", a["wdl"] == "win"))
    checks.append(("Qg7# is a win for the mover", a["moves"]["g1g7"]["wdl"] == "win" and a["moves"]["g1g7"]["dtm"] == 1))
    checks.append(("Qg6 (stalemate) is a draw for the mover", a["moves"]["g1g6"]["wdl"] == "draw"))
    b = tb.probe("k7/8/K7/P7/8/8/8/8 b - - 0 1")             # rook pawn, defender in the corner
    checks.append(("K+P v K, defender in the corner = draw", b["wdl"] == "draw"))
    c = tb.probe("8/8/8/8/8/2k5/8/K6Q b - - 0 1")            # black to move in KQ v K: lost for the side to move
    checks.append(("KQ v K, black to move = loss", c["wdl"] == "loss"))
    bad = [n for n, ok in checks if not ok]
    if verbose:
        for n, ok in checks:
            print(("ok   " if ok else "FAIL ") + n)
    if bad:
        raise TBError("tablebase self-test failed: " + "; ".join(bad))
    return True


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--selftest":
        selftest(); default().save(); print(f"self-test passed ({default().calls} requests, {default().hits} cached)")
    elif args:
        b = chess.Board(args[0])
        r = probe(b)
        print("side to move:", r["wdl"], "dtm", r["dtm"], "dtz", r["dtz"])
        for u, v in sorted(r["moves"].items(), key=lambda kv: (-{"win": 2, "draw": 1, "loss": 0}[kv[1]["wdl"]], kv[1]["dtm"] or 999)):
            print(f"  {b.san(chess.Move.from_uci(u)):8} {v['wdl']:5} dtm={v['dtm']} dtz={v['dtz']}")
        default().save()
    else:
        print(__doc__)
