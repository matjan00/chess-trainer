"""Verifier for Train 2 lesson courses (BLUEPRINT section 2.3 and 2.6): checks L1-L12, X1-X6.

Usage:
  python verify_lessons.py <courseId | path/to/course.txt> [--lesson ID] [--no-engine] [--out FILE] [--pool puzzles2.json]
Exit code 1 on any FAIL.  Report default: train2/reports/<course>.verify.txt (also printed).

Engine: content search (T2Evals: depth 20, multipv 4, 60 s cap, watchdog) cached in train2/cache/evals.json; positions with <= 7 men
are decided by the Lichess tablebase (tb.py, cached in train2/cache/tb.json).  Play-out self-play results are cached in
train2/cache/selfplay.json.  Findings: FAIL blocks the compiler, WARN must be answered by the worker.
"""
import argparse, json, math, os, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chess, chess.engine
import t2common as tc
from t2common import (CACHE_DIR, COURSES_DIR, DATA_DIR, REPORTS_DIR, CONTENT_DEPTH, CONTENT_MPV, T2Evals, SafeEngine, EngineTimeout,
                      LockedJson, win_pct, men, pos_key, material, VALUES)
import tb as tbmod
import lesson_format as lf
from lesson_format import finding, plain, variations, gl_terms

SAN_RE = re.compile(r"(?<![A-Za-z])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?|[a-h]x[a-h][1-8][+#]?|O-O(?:-O)?[+#]?)(?![A-Za-z0-9])")
NUM_EVAL = re.compile(r"(?<![\w.])[+\-−]\d+\.\d+")
JARGON = ["zugzwang", "opposition", "tempo", "zwischenzug", "intermezzo", "deflection", "decoy", "battery", "outflank", "outflanking",
          "key squares", "cut-off", "prophylaxis", "desperado", "overloaded", "x-ray", "luft", "fianchetto"]
EXCHANGE = re.compile(r"(?:\b(?:win|won|winning|lose|lost|losing|sacrifice|sacrificing|give|giving|up|down|take|taking)\s+)?\bthe exchange\b(?!\s+of)", re.I)
EXPLAINERS = ("(", "—", ":", " means ", " i.e.", "that is", " so ", " which ", " = ", " called ", " – ", " is when ")
AMERICAN = ["color", "colors", "center", "defense", "analyze", "favorite", "realize", "gray", "meter", "recognize", "organize"]
SLOW_WORDS = ("slow", "quick", "fast", "longer", "shorter", "also", "safe")
PIECE_NAMES = {"queen": chess.QUEEN, "rook": chess.ROOK, "bishop": chess.BISHOP, "knight": chess.KNIGHT, "pawn": chess.PAWN, "king": chess.KING}
CLAIM = re.compile(r"\bwins?\s+(?:the|a|an)\s+(queen|rook|piece|pawn|exchange|bishop|knight)\b", re.I)
MATE_CLAIM = re.compile(r"\b(?:checkmates?|gives? mate|is mate|delivers? mate|forces? mate|wins? by mate|mate in \d)\b", re.I)
RESTATE = re.compile(r"^(?:the\s+)?(?:king|queen|rook|bishop|knight|pawn)\s+(?:goes|moves|jumps|slides|captures|takes|steps|runs)\s+(?:to\s+)?[a-h][1-8]\.?$", re.I)
SQUARE_CLAIM = re.compile(r"\bthe\s+(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b", re.I)
GOAL_ENGINE_DEPTH = 28
WIN_THRESH, DRAW_THRESH = 300, 60
SELFPLAY_PATH = CACHE_DIR / "selfplay.json"
ANALYSIS_PATH = DATA_DIR / "analysis.json"


class Result:
    def __init__(self):
        self.findings = []; self.items = {}; self.info = []; self.stats = {"searches": 0, "tb": 0}
        self.t0 = time.time()

    @property
    def fails(self):
        return [f for f in self.findings if f["sev"] == "FAIL"]

    @property
    def warns(self):
        return [f for f in self.findings if f["sev"] == "WARN"]


class Skip(Exception):
    """An engine timeout or tablebase problem on one position: reported, item skipped."""


# ================================================================== pool and games
def load_pool(path=None):
    """{id: {"fen", "moves", "rating", "groups", "start"}} from data/puzzles2.json (T2's output) or None if missing."""
    p = Path(path or os.environ.get("T2_POOL") or DATA_DIR / "puzzles2.json")
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    groups = [g["id"] for g in d.get("groups", [])]
    pool = {}
    for r in d.get("rows", []):
        pid, fen, moves, rating, gidx = r[0], r[1], r[2].split(), r[3], r[4]
        try:
            b = chess.Board(fen); b.push_uci(moves[0]); start = pos_key(b)
        except Exception:
            start = None
        pool[pid] = {"fen": fen, "moves": moves, "rating": rating, "groups": [groups[i] for i in gidx if i < len(groups)], "start": start}
    return pool


_ANALYSIS = None


def game_exists(gid, ply):
    global _ANALYSIS
    if _ANALYSIS is None:
        _ANALYSIS = {}
        if ANALYSIS_PATH.exists():
            for g in json.loads(ANALYSIS_PATH.read_text(encoding="utf-8")):
                _ANALYSIS[str(g.get("url", "")).rstrip("/").rsplit("/", 1)[-1]] = len(g.get("plies", []))
    n = _ANALYSIS.get(str(gid))
    return n is not None and 1 <= ply <= n


# ================================================================== the verifier
class Verifier:
    def __init__(self, course, ev=None, tb=None, pool=None, only_lesson=None, no_engine=False, verbose=True, selfplay=None, sp_time=0.3):
        self.c, self.ev, self.tb = course, ev, tb
        self.pool, self.only, self.no_engine, self.verbose = pool, only_lesson, no_engine, verbose
        self.r = Result(); self.r.findings += list(course.errors)
        self.seen_ids = {}; self.seen_pos = {}
        self.selfplay = selfplay or (LockedJson(SELFPLAY_PATH) if not no_engine else None)
        self.sp_time = sp_time
        self.sp_engine = None
        self.jargon_seen = set()

    # ---------------------------------------------------------------- utilities
    def add(self, fid, sev, msg, lesson=None, item=None, ply=None):
        self.r.findings.append(finding(fid, sev, msg, lesson, item, ply))

    def log(self, m):
        if self.verbose:
            print(m, file=sys.stderr, flush=True)

    def top(self, board):
        if self.no_engine:
            raise Skip("no engine")
        try:
            t = self.ev.top(board, CONTENT_DEPTH, CONTENT_MPV)
        except EngineTimeout as e:
            raise Skip(f"engine timeout: {e}")
        self.r.stats["searches"] = self.ev.searches
        return t

    def played(self, board, uci):
        try:
            return self.ev.played(board, uci, CONTENT_DEPTH, CONTENT_MPV)
        except EngineTimeout as e:
            raise Skip(f"engine timeout: {e}")

    def tbinfo(self, board):
        """Tablebase answer or None when the position is not (or the tablebase is switched off)."""
        if self.no_engine or self.tb is None or board.is_game_over() or not tbmod.available(board):
            return None
        try:
            self.r.stats["tb"] += 1
            return self.tb.probe(board)
        except tbmod.TBError as e:
            raise Skip(f"tablebase: {e}")

    @staticmethod
    def terminal_w(board, solver):
        """Win % for solver when the game is over, else None."""
        if board.is_checkmate():
            return 100.0 if board.turn != solver else 0.0
        if board.is_stalemate() or board.is_insufficient_material():
            return 50.0
        return None

    def w_of(self, board, solver):
        """Engine win % for `solver` at `board` (side to move may be either)."""
        t = self.terminal_w(board, solver)
        if t is not None:
            return t, []
        top = self.top(board)
        w = win_pct(top[0]["cp"])
        return (w if board.turn == solver else 100 - w), top[0]["pv"]

    # ---------------------------------------------------------------- run
    def run(self):
        c = self.c
        if not c.id:
            self.add("F0", "FAIL", "no '# COURSE id | title' line")
        for l in c.lessons:
            if self.only and l.id != self.only:
                continue
            self.log(f"lesson {l.id}")
            self.check_shape(l)
            self.jargon_seen = set()
            self.text_lessonlevel(l)
            for it in l.items:
                if it.broken and it.fen is None and it.kind in ("EX", "CARD", "PLAY", "JUDGE"):
                    pass
                self.check_item(l, it)
        if self.selfplay:
            self.selfplay.save()
        if self.tb:
            self.tb.save()
        if self.ev:
            self.ev.save()
        if self.sp_engine:
            self.sp_engine.quit()
        self.r.stats["seconds"] = round(time.time() - self.r.t0, 1)
        return self.r

    def check_item(self, l, it):
        # ids
        if it.kind in ("EX", "CARD", "PLAY", "JUDGE", "SET"):
            if not it.id:
                self.add("L1", "FAIL", "item has no id", l.id, None)
            elif it.id in self.seen_ids:
                self.add("L1", "FAIL", f"duplicate id '{it.id}' (also in lesson {self.seen_ids[it.id]})", l.id, it.id)
            self.seen_ids.setdefault(it.id, l.id)
        if it.kind in ("EX", "CARD", "PLAY", "JUDGE"):
            if not self.check_position(l, it):
                return
        if it.kind in ("EX", "CARD", "JUDGE"):
            self.check_src(l, it)
        try:
            if it.kind == "EX": self.check_ex(l, it)
            elif it.kind == "CARD": self.check_card(l, it)
            elif it.kind == "PLAY": self.check_play(l, it)
            elif it.kind == "JUDGE": self.check_judge(l, it)
            elif it.kind == "SET": self.check_set(l, it)
        except Skip as e:
            self.add("L0", "FAIL", f"could not be checked: {e}", l.id, it.id)

    # ---------------------------------------------------------------- L1 position
    def check_position(self, l, it):
        try:
            b = chess.Board(it.fen)
        except Exception:
            self.add("L1", "FAIL", f"illegal FEN: {it.fen}", l.id, it.id); return False
        if not b.is_valid():
            self.add("L1", "FAIL", f"FEN is not a legal position ({b.status().name}): {it.fen}", l.id, it.id); return False
        if b.is_game_over():
            self.add("L1", "FAIL", "the game is already over in this position", l.id, it.id); return False
        k = pos_key(b)
        if k in self.seen_pos and self.seen_pos[k] != it.id:
            self.add("L1", "FAIL", f"same position as '{self.seen_pos[k]}' (posKey); mirrored or shifted versions are welcome, identical ones are not", l.id, it.id)
        self.seen_pos.setdefault(k, it.id)
        last = it.params.get("last")
        if last:
            try:
                mv = chess.Move.from_uci(last)
                pc = b.piece_at(mv.to_square)
                if pc is None or pc.color == b.turn:
                    self.add("L1", "FAIL", f"last={last}: the piece on {chess.square_name(mv.to_square)} must belong to the side that just moved (wrong side to move?)", l.id, it.id)
            except Exception:
                self.add("L1", "FAIL", f"last={last} is not a move like e7e6", l.id, it.id)
        return True

    # ---------------------------------------------------------------- L10 shape
    def check_shape(self, l):
        c = self.c
        n = lambda k: sum(1 for i in l.items if i.kind == k)
        if not l.rule:
            self.add("L10", "FAIL", "lesson has no 'rule:'", l.id)
        if not l.goal:
            self.add("L10", "WARN", "lesson has no 'goal:'", l.id)
        habit = c.id in ("think", "convert")
        if n("EX") < 1:
            self.add("L10", "FAIL", "lesson needs at least 1 EX", l.id)
        need = 4 if c.id == "tactics" else 3
        if habit:
            if n("CARD") + n("JUDGE") + n("MINE") < need:
                self.add("L10", "FAIL", f"habit lesson needs at least {need} practice items (CARD/JUDGE/MINE)", l.id)
        elif n("CARD") < need:
            self.add("L10", "FAIL", f"lesson needs at least {need} CARD (has {n('CARD')})", l.id)
        if c.id == "endgames" and n("PLAY") < 1:
            self.add("L10", "FAIL", "an endgame lesson needs at least 1 PLAY", l.id)
        if c.id == "tactics" and n("SET") < 1 and not self.only:
            ch = next((x for x in c.chapters if l.id in x["lessons"]), None)
            if ch and not any(i.kind == "SET" for lid in ch["lessons"] for i in (c.lesson(lid).items if c.lesson(lid) else [])):
                self.add("L10", "FAIL", f"chapter {ch['id']} has no SET", l.id)
        for it in l.items:
            if it.kind == "EX" and not it.key_text:
                self.add("L10", "FAIL", "example has no 'key:' line", l.id, it.id)
            if it.kind == "CARD" and not it.wrong:
                self.add("L7", "FAIL", "card needs at least one 'wrong:' line (the most tempting mistake)", l.id, it.id)

    # ---------------------------------------------------------------- L11 sources
    def check_src(self, l, it):
        src = it.src
        if not src:
            self.add("L11", "FAIL", "src= missing", l.id, it.id); return
        try:
            b = chess.Board(it.fen)
        except Exception:
            return
        if src.startswith("lichess:"):
            pid = src[8:]
            if self.pool is None:
                self.add("L11", "WARN", f"puzzle pool (data/puzzles2.json) not built yet: {src} not checked", l.id, it.id)
            elif pid not in self.pool:
                self.add("L11", "FAIL", f"{src} is not in the verified pool", l.id, it.id)
            elif self.pool[pid]["start"] != pos_key(b):
                self.add("L11", "FAIL", f"{src}: the FEN is not the puzzle's start position (after its first move)", l.id, it.id)
        elif src.startswith("game:"):
            m = re.match(r"^game:(\d+)-(\d+)$", src)
            if not m:
                self.add("L11", "FAIL", f"bad src '{src}' (game:<gameId>-<ply>)", l.id, it.id)
            elif not game_exists(m.group(1), int(m.group(2))):
                self.add("L11", "FAIL", f"{src}: no such game/ply in data/analysis.json", l.id, it.id)
        elif src == "book":
            if men(b) > 7:
                self.add("L11", "WARN", f"src=book but {men(b)} men: cannot be tablebase-proved; the engine rule is used", l.id, it.id)
        elif src == "composed":
            if it.kind not in ("EX", "CARD"):
                self.add("L11", "FAIL", "src=composed is allowed for examples and cards only", l.id, it.id)
            if men(b) > 12:
                self.add("L11", "FAIL", f"src=composed with {men(b)} men (max 12)", l.id, it.id)
        else:
            self.add("L11", "FAIL", f"unknown src '{src}' (lichess:<id> | game:<gid>-<ply> | book | composed)", l.id, it.id)

    # ---------------------------------------------------------------- engine/tablebase view of one position
    def solver_options(self, board):
        """What the mover can do here.  Returns dict:
          kind 'tb': {"best": wdl, "classes": {uci: ok|slow|worse}, "info": probe}
          kind 'engine': {"top": [...], "w": {uci: win% for mover}} (top list moves only; others fetched by `move_w`)."""
        info = self.tbinfo(board)
        if info is not None and info["moves"]:
            best, ref, classes = tbmod.move_classes(info)
            return {"kind": "tb", "best": best, "classes": classes, "info": info, "ref": ref}
        top = self.top(board)
        return {"kind": "engine", "top": top, "wbest": win_pct(top[0]["cp"]), "w": {t["m"]: win_pct(t["cp"]) for t in top}}

    def move_w(self, board, uci, opts):
        """Win % for the mover after `uci` (engine mode)."""
        if uci in opts["w"]:
            return opts["w"][uci]
        r = self.played(board, uci)
        return win_pct(r[0])

    # ---------------------------------------------------------------- EXAMPLES (L2, L3, L6, X3, X4)
    def our_side(self, it):
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

    def check_ex(self, l, it):
        if it.broken or not it.moves:
            if not it.broken:
                self.add("L10", "FAIL", "example has no moves", l.id, it.id)
            return
        board = chess.Board(it.fen)
        ours = self.our_side(it)
        boards = [board.copy()]
        for m in it.moves:
            board.push_uci(m.uci); boards.append(board.copy())
        qcount = 0
        ucis = [m.uci for m in it.moves]
        for i, m in enumerate(it.moves):
            b = boards[i]; mine = m.mover == ours
            if m.nag in ("?", "??"):
                qcount += 1
                if mine:
                    self.add("L2", "FAIL", f"our own move {m.san} is flagged '?'", l.id, it.id, m.ply)
                if not m.c:
                    self.add("L3", "FAIL", f"'?' move {m.san} needs a comment", l.id, it.id, m.ply)
            try:
                opts = self.solver_options(b)
            except Skip as e:
                self.add("L0", "FAIL", f"{it.id} move {m.ply}.{m.san}: {e}", l.id, it.id, m.ply); continue
            if opts["kind"] == "tb":
                cls = opts["classes"].get(m.uci)
                if mine:
                    if cls == "worse":
                        self.add("L2", "FAIL", f"{m.san} changes the tablebase result (not the best category)", l.id, it.id, m.ply)
                    elif cls == "slow" and not any(w in m.c.lower() for w in SLOW_WORDS):
                        self.add("L2", "FAIL", f"{m.san} is more than 4 moves slower than the quickest; say so in a comment", l.id, it.id, m.ply)
                else:
                    if cls == "worse":
                        if m.nag not in ("?", "??"):
                            self.add("L3", "FAIL", f"opponent move {m.san} changes the tablebase result but is not flagged '?'", l.id, it.id, m.ply)
                    elif cls == "slow" and m.nag not in ("?", "??"):
                        self.add("L3", "FAIL", f"opponent move {m.san} is not the longest defence (more than 4 moves short) and is not flagged '?'", l.id, it.id, m.ply)
            else:
                wbest = opts["wbest"]
                wm = self.move_w(b, m.uci, opts)
                loss = wbest - wm
                if mine:
                    if loss > 3:
                        self.add("L2", "FAIL", f"{m.san} loses {loss:.1f} win-% against the best move {self.san_of(b, opts['top'][0]['m'])}", l.id, it.id, m.ply)
                else:
                    in2 = m.uci in [t["m"] for t in opts["top"][:2]]
                    sound = in2 or loss <= 5
                    if not sound and m.nag not in ("?", "??"):
                        self.add("L3", "FAIL", f"opponent plays {m.san} ({loss:.1f} win-% worse than best, outside the top 2) without a '?' flag", l.id, it.id, m.ply)
                    if sound and m.nag in ("?", "??"):
                        self.add("L3", "WARN", f"{m.san} is flagged '?' but is a sound defence", l.id, it.id, m.ply)
            if m.nag in ("!", "!!") and not mine:
                self.add("L2", "WARN", f"'!' on the opponent's move {m.san}", l.id, it.id, m.ply)
        if qcount > 1:
            self.add("L3", "FAIL", f"{qcount} opponent mistakes flagged '?' in one example (max 1)", l.id, it.id)
        # end of the example: quiet (L6)
        self.check_quiet(l, it, boards[-1], "example end")
        pv_tail = self.pv_after(boards[-1])
        # text rules with positions
        for i, m in enumerate(it.moves):
            self.text_positional(l, it, m.c, boards, i, ours, pv_tail, f"{m.ply}.{m.san}", ucis)
        for lbl, text in (("setting", it.text), ("key", it.key_text)):
            if text:
                self.text_positional(l, it, text, boards, None, ours, pv_tail, lbl, ucis)
        self.r.items[it.id] = {"kind": "EX", "ours": "w" if ours == chess.WHITE else "b", "tb": men(boards[0]) <= 7}

    def san_of(self, board, uci):
        try:
            return board.san(chess.Move.from_uci(uci))
        except Exception:
            return uci

    def pv_after(self, board):
        if board.is_game_over() or self.no_engine:
            return []
        try:
            return self.top(board)[0]["pv"]
        except Skip:
            return []

    def check_quiet(self, l, it, board, what):
        if board.is_checkmate() or board.is_game_over():
            return
        if board.is_check():
            self.add("L6", "FAIL", f"{what}: the side to move is in check", l.id, it.id)
        if self.no_engine:
            return
        try:
            pv = self.top(board)[0]["pv"]
        except Skip as e:
            self.add("L0", "FAIL", f"{it.id}: {e}", l.id, it.id); return
        b = board.copy(); m0 = material(b)
        for u in pv[:2]:
            try:
                b.push_uci(u)
            except Exception:
                break
        if material(b) != m0:
            self.add("L6", "FAIL", f"{what} is not quiet: material changes in the first 2 plies of the best line ({' '.join(pv[:2])})", l.id, it.id)

    # ---------------------------------------------------------------- CARDS (L4, L5, L6, L7)
    def check_card(self, l, it):
        if it.broken:
            return
        solver = chess.Board(it.fen).turn
        hold = it.params.get("tag") == "hold"
        board = chess.Board(it.fen)
        boards = [board.copy()]
        for u in it.sol_uci:
            board.push_uci(u); boards.append(board.copy())
        if len(it.sol_uci) % 2 == 0:
            self.add("L4", "FAIL", "sol: must end on a solver move (odd number of plies)", l.id, it.id)
        if len(it.sol_uci) > 5:
            self.add("L4", "FAIL", "sol: more than 3 solver moves", l.id, it.id)
        also_u = {e["uci"] for e in it.also}
        record = {"kind": "CARD", "ok": [], "slow": [], "tb": False, "w": None}
        first_opts = None
        for k, u in enumerate(it.sol_uci):
            b = boards[k]
            try:
                opts = self.solver_options(b)
            except Skip as e:
                self.add("L0", "FAIL", f"{it.id} step {k + 1}: {e}", l.id, it.id); return
            if k == 0:
                first_opts = opts
            if k % 2 == 1:
                # opponent reply: should be a good defence (warning only: cards replay it automatically)
                if opts["kind"] == "tb":
                    if opts["classes"].get(u) == "worse":
                        self.add("L4", "WARN", f"the reply {self.san_of(b, u)} in sol: is not the best defence", l.id, it.id, k + 1)
                else:
                    top2 = [t["m"] for t in opts["top"][:2]]
                    if u not in top2 and opts["wbest"] - self.move_w(b, u, opts) > 5:
                        self.add("L4", "WARN", f"the reply {self.san_of(b, u)} in sol: is not a best defence", l.id, it.id, k + 1)
                continue
            # solver step: uniqueness
            sv = self.step_unique(l, it, b, u, opts, also_u, hold, k)
            record.setdefault("steps", []).append(sv["ok"])
            if k == 0:
                record.update(sv)
        # L5 pay-off
        end = boards[-1]
        try:
            if first_opts and first_opts["kind"] == "tb":
                goal = it.params.get("goal") or first_opts["best"]
                info = self.tbinfo(end)
                if end.is_checkmate(): res = "win"
                elif end.is_stalemate(): res = "draw"
                elif info is None: res = None
                else: res = info["wdl"] if end.turn == solver else tbmod.flip(info["wdl"])
                if res is not None and res != goal:
                    self.add("L5", "FAIL", f"after sol: the tablebase says {res} for the solver; the card goal is {goal}", l.id, it.id)
            elif first_opts:
                w, _ = self.w_of(end, solver)
                need = 40 if hold else 75
                if w < need:
                    self.add("L5", "FAIL", f"pay-off: after the solution the solver has {w:.0f} win-% (needs {need})", l.id, it.id)
                record["wEnd"] = round(w, 1)
        except Skip as e:
            self.add("L0", "FAIL", f"{it.id}: {e}", l.id, it.id)
        self.check_quiet(l, it, end, "end of the solution")
        # L7 wrong lines
        if first_opts:
            self.check_wrong(l, it, boards, first_opts, record, solver, hold)
        pv_tail = self.pv_after(end)
        self.text_positional(l, it, it.why, boards, None, solver, pv_tail, "why", it.sol_uci)
        for e in it.also:
            self.text_positional(l, it, e["text"], boards, None, solver, pv_tail, f"also {e['san']}", it.sol_uci)
        for e in it.wrong:
            self.text_positional(l, it, e["text"], boards, None, solver, pv_tail, f"wrong {e['san']}", it.sol_uci)
        record["also"] = {e["uci"]: e["text"] for e in it.also}
        self.r.items[it.id] = record

    def step_unique(self, l, it, b, sol_u, opts, also_u, hold, k):
        """L4 for one solver step.  Returns {"ok": [...], "slow": [...], "tb": bool, "w": float}."""
        out = {"ok": [], "slow": [], "tb": False}
        if opts["kind"] == "tb":
            out["tb"] = True
            cls = opts["classes"]
            ok = [u for u, c in cls.items() if c == "ok"]
            slow = [u for u, c in cls.items() if c == "slow"]
            worse = [u for u, c in cls.items() if c == "worse"]
            out["ok"], out["slow"] = ok, slow
            if sol_u not in ok:
                self.add("L4", "FAIL", f"step {k // 2 + 1}: the solution {self.san_of(b, sol_u)} is not a best tablebase move ({cls.get(sol_u, 'illegal')})", l.id, it.id)
            if not worse:
                self.add("L4", "FAIL", f"step {k // 2 + 1}: every legal move keeps the result; the position is not critical", l.id, it.id)
        else:
            top = opts["top"]; wbest = opts["wbest"]
            ws = {t["m"]: win_pct(t["cp"]) for t in top}
            ok = [t["m"] for t in top if wbest - ws[t["m"]] <= 3]
            if sol_u not in ok:
                wsol = self.move_w(b, sol_u, opts)
                self.add("L4", "FAIL", f"step {k // 2 + 1}: the solution {self.san_of(b, sol_u)} is {wbest - wsol:.1f} win-% below the best move {self.san_of(b, top[0]['m'])}", l.id, it.id)
                ok = ok + [sol_u]
            outside = [t for t in top if t["m"] not in ok]
            if outside:
                gap = wbest - win_pct(outside[0]["cp"])
                need = 15 if hold else 12
                if gap < need:
                    self.add("L4", "FAIL", f"step {k // 2 + 1}: a second move also works: {self.san_of(b, outside[0]['m'])} is only {gap:.1f} win-% worse than the best (needs {need})", l.id, it.id)
            elif len(list(b.legal_moves)) > len(ok):
                pass                                    # fewer than 4 moves returned: none outside the list
            else:
                self.add("L4", "FAIL", f"step {k // 2 + 1}: forced move (no alternative), not a puzzle", l.id, it.id)
            out["ok"] = ok; out["w"] = round(wbest, 1)
            out["gap"] = round(wbest - win_pct(outside[0]["cp"]), 1) if outside else None
        if len(out["ok"]) > 2:
            self.add("L4", "FAIL", f"step {k // 2 + 1}: {len(out['ok'])} moves are fine ({', '.join(self.san_of(b, u) for u in out['ok'])}); a card may have at most 2", l.id, it.id)
        extra = [u for u in out["ok"] if u != sol_u and u not in also_u]
        if extra:
            self.add("L4", "FAIL", f"step {k // 2 + 1}: {', '.join(self.san_of(b, u) for u in extra)} is also fine but not named in an 'also:' line", l.id, it.id)
        for e in it.also:
            if e["uci"] and e["uci"] not in out["ok"] and k == 0:
                self.add("L4", "FAIL", f"also: {e['san']} is not as good as the solution", l.id, it.id)
        return out

    def check_wrong(self, l, it, boards, opts, record, solver, hold):
        b0 = boards[0]
        okset = set(record["ok"]) | set(record["slow"])
        wsol_end = None
        for e in it.wrong:
            if not e["uci"]:
                continue
            u = e["uci"]
            if u in okset:
                self.add("L7", "FAIL", f"wrong: {e['san']} is actually a good move", l.id, it.id); continue
            try:
                if opts["kind"] == "tb":
                    pass          # classes already say 'worse' (not in ok/slow)
                else:
                    wm = self.move_w(b0, u, opts)
                    if opts["wbest"] - wm < 12:
                        self.add("L7", "FAIL", f"wrong: {e['san']} is only {opts['wbest'] - wm:.1f} win-% worse than the best move (needs 12)", l.id, it.id)
                for v in e["vars"]:
                    self.check_wrong_var(l, it, b0, v, opts, solver)
            except Skip as ex:
                self.add("L0", "FAIL", f"{it.id}: {ex}", l.id, it.id)
        # is the engine's best non-ok move among the wrong lines?
        if opts["kind"] == "engine":
            outside = [t["m"] for t in opts["top"] if t["m"] not in okset]
            if outside and outside[0] not in {e["uci"] for e in it.wrong}:
                self.add("L7", "WARN", f"the most tempting wrong move may be {self.san_of(b0, outside[0])} (engine's best alternative); it is not among the wrong: lines", l.id, it.id)

    def check_wrong_var(self, l, it, b0, vtext, opts, solver):
        pos = [(b0.fullmove_number, b0.turn)]
        try:
            start = self.var_start(vtext, [b0], 0)
            vb = (start or b0).copy()
            for kind, val in lf.tokenize(vtext):
                if kind != "m":
                    continue
                san, _ = lf.split_nag(val)
                vb.push(vb.parse_san(san))
        except Exception as e:
            self.add("L7", "FAIL", f"wrong: variation (( {vtext[:40]} )) is illegal: {e}", l.id, it.id); return
        if vb.is_game_over() and not vb.is_checkmate():
            return
        try:
            if opts["kind"] == "tb":
                info = self.tbinfo(vb)
                if info is not None:
                    res = info["wdl"] if vb.turn == solver else tbmod.flip(info["wdl"])
                    order = {"win": 2, "draw": 1, "loss": 0}
                    if order[res] >= order[opts["best"]]:
                        self.add("L7", "FAIL", f"wrong: variation ends {res} for the solver; it must be worse than {opts['best']}", l.id, it.id)
                    return
            w, _ = self.w_of(vb, solver)
            if w > opts["wbest"] - 12:
                self.add("L7", "FAIL", f"wrong: variation ends at {w:.0f} win-% for the solver, not at least 12 below the solution ({opts['wbest']:.0f})", l.id, it.id)
        except Skip as e:
            self.add("L0", "FAIL", f"{it.id}: {e}", l.id, it.id)

    # ---------------------------------------------------------------- variations in text (X3)
    def var_start(self, vtext, boards, default_i):
        """Board a variation starts from: the line position whose move number/side matches the variation's first move number,
        else boards[default_i]."""
        toks = vtext.split()
        pref = lf.number_prefix(toks[0]) if toks else None
        if pref:
            n, side = pref
            want = chess.WHITE if side == "w" else chess.BLACK
            cands = [i for i, bd in enumerate(boards) if bd.fullmove_number == n and bd.turn == want]
            if cands:
                return boards[min(cands, key=lambda i: abs(i - default_i))]
        return boards[min(default_i, len(boards) - 1)]

    def text_positional(self, l, it, text, boards, idx, ours, pv_tail, label, ucis=()):
        """X3 (variations legal, moves only inside (( )), named squares), X4 (material / mate claims)."""
        if not text:
            return
        default_i = idx if idx is not None else 0
        for v in variations(text):
            try:
                start = self.var_start(v, boards, default_i)
                vb = start.copy()
                for kind, val in lf.tokenize(v):
                    if kind != "m":
                        continue
                    san, _ = lf.split_nag(val)
                    vb.push(vb.parse_san(san))
            except Exception as e:
                self.add("X3", "FAIL", f"{label}: variation (( {v[:40]} )) is not legal: {e}", l.id, it.id)
        pt = plain(text)
        m = SAN_RE.search(pt)
        if m:
            self.add("X3", "WARN", f"{label}: move '{m.group(0)}' written outside (( ))", l.id, it.id)
        # named squares
        cand = []
        if idx is not None:
            cand = [boards[idx], boards[idx + 1]] if idx + 1 < len(boards) else [boards[idx]]
        else:
            cand = boards
        for m in SQUARE_CLAIM.finditer(pt):
            col, pname, sq = m.group(1), m.group(2).lower(), chess.parse_square(m.group(3))
            ok = False
            for bd in cand:
                pc = bd.piece_at(sq)
                if pc and pc.piece_type == PIECE_NAMES[pname] and (col is None or pc.color == (col.lower() == "white")):
                    ok = True; break
            if not ok:
                self.add("X3", "WARN", f"{label}: 'the {pname} on {m.group(3)}' - there is no such piece there", l.id, it.id)
        # X4
        claims = CLAIM.findall(pt)
        mate = MATE_CLAIM.search(pt)
        if claims or mate:
            start_i = idx if idx is not None else 0
            seg = self.line_moves(boards[start_i:], list(ucis)[start_i:], pv_tail)
            for kind in claims:
                if not self.claim_holds(kind.lower(), seg):
                    self.add("X4", "FAIL", f"{label}: claims it wins the {kind.lower()}, but the line does not", l.id, it.id)
            if mate and not self.mate_holds(seg, boards[-1]):
                self.add("X4", "FAIL", f"{label}: claims mate, but the line does not end in checkmate", l.id, it.id)

    @staticmethod
    def line_moves(boards, ucis, pv_tail):
        """[(board before, move)] for the rest of the line, then the first 4 plies of the engine's best line after it."""
        out = []
        for bd, u in zip(boards, ucis):
            out.append((bd, chess.Move.from_uci(u)))
        if not boards:
            return out
        last = boards[-1].copy()
        for u in pv_tail[:4]:
            try:
                mv = chess.Move.from_uci(u)
                if mv not in last.legal_moves:
                    break
                out.append((last.copy(), mv)); last.push(mv)
            except Exception:
                break
        return out

    def claim_holds(self, kind, seg):
        want = {"queen": {chess.QUEEN}, "rook": {chess.ROOK}, "pawn": {chess.PAWN}, "bishop": {chess.BISHOP}, "knight": {chess.KNIGHT},
                "piece": {chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN}, "exchange": {chess.ROOK}}[kind]
        need = {"queen": 6, "rook": 2, "pawn": 1, "bishop": 2, "knight": 2, "piece": 2, "exchange": 2}[kind]
        for side in (chess.WHITE, chess.BLACK):
            captured = False; start = None; end = None
            for bd, mv in seg:
                if start is None:
                    start = material(bd) * (1 if side == chess.WHITE else -1)
                if bd.turn == side:
                    if bd.is_en_passant(mv):
                        pt = chess.PAWN
                    else:
                        pt = bd.piece_type_at(mv.to_square)
                    if pt in want:
                        captured = True
                    if mv.promotion and kind in ("piece", "queen") and False:
                        pass
                t = bd.copy(); t.push(mv); end = material(t) * (1 if side == chess.WHITE else -1)
            if captured and start is not None and end - start >= need:
                return True
        return False

    @staticmethod
    def mate_holds(seg, final_board):
        if final_board.is_checkmate():
            return True
        if seg:
            t = seg[-1][0].copy(); t.push(seg[-1][1])
            return t.is_checkmate()
        return False

    # ---------------------------------------------------------------- PLAY (L8)
    def check_play(self, l, it):
        if it.broken:
            return
        p = it.params
        board = chess.Board(it.fen)
        goal = p.get("goal"); finish = p.get("finish", "")
        side = chess.WHITE if p.get("side") == "white" else chess.BLACK if p.get("side") == "black" else board.turn
        if goal not in ("win", "draw"):
            self.add("L8", "FAIL", f"goal= must be win or draw (got '{goal}')", l.id, it.id); return
        if not re.match(r"^(mate|promote|hold:\d+|eval:-?\d+)$", finish):
            self.add("L8", "FAIL", f"finish= must be mate | promote | hold:<n> | eval:<cp> (got '{finish}')", l.id, it.id); return
        try:
            mx = int(p.get("max", ""))
        except ValueError:
            self.add("L8", "FAIL", "max= (moves) missing or not a number", l.id, it.id); return
        if self.no_engine:
            return
        # the true result
        info = self.tbinfo(board)
        try:
            if info is not None:
                res = info["wdl"] if board.turn == side else tbmod.flip(info["wdl"])
                src = "tablebase"
            else:
                try:
                    r = self.ev.single(board, GOAL_ENGINE_DEPTH)
                except EngineTimeout as e:
                    raise Skip(f"engine timeout: {e}")
                cp = r[0] if board.turn == side else -r[0]
                res = "win" if cp >= WIN_THRESH else "draw" if abs(cp) <= DRAW_THRESH else "loss" if cp < 0 else "unclear-plus"
                src = f"Stockfish depth {GOAL_ENGINE_DEPTH} ({cp / 100:+.2f})"
        except Skip as e:
            self.add("L0", "FAIL", f"{it.id}: {e}", l.id, it.id); return
        if res != goal:
            self.add("L8", "FAIL", f"the stated goal is '{goal}' but the true result is '{res}' ({src})", l.id, it.id); return
        # self-play
        try:
            needed, reached, why = self.run_selfplay(board, side, finish)
        except (Skip, EngineTimeout) as e:
            self.add("L0", "FAIL", f"{it.id}: self-play: {e}", l.id, it.id); return
        if not reached:
            self.add("L8", "FAIL", f"self-play: Stockfish (0.3 s/move) as the learner did not reach the finish '{finish}' ({why})", l.id, it.id)
        elif mx < math.ceil(1.5 * needed):
            self.add("L8", "FAIL", f"max={mx} is too small: self-play needed {needed} moves, max must be at least {math.ceil(1.5 * needed)}", l.id, it.id)
        self.r.items[it.id] = {"kind": "PLAY", "tb": info is not None, "selfplay": needed, "result": res}
        self.text_positional(l, it, it.text, [board], None, side, [], "text")

    def run_selfplay(self, board, side, finish):
        key = f"{pos_key(board)}|{'w' if side == chess.WHITE else 'b'}|{finish}|{self.sp_time}"
        hit = self.selfplay.get(key)
        if hit is not None:
            return hit["moves"], hit["reached"], hit.get("why", "")
        if self.sp_engine is None:
            self.sp_engine = SafeEngine(threads=int(os.environ.get("O2_THREADS", 2)), hash_mb=128)
        eng = self.sp_engine
        b = board.copy()
        n = 0; reached = False; why = "move limit of the test (300 plies)"
        kind, _, arg = finish.partition(":")
        start_pieces = sum(1 for _ in b.pieces(chess.QUEEN, side)) + sum(1 for _ in b.pieces(chess.ROOK, side))
        promoted_at = None
        for ply in range(300):
            if b.is_game_over():
                if b.is_checkmate() and b.turn != side and kind == "mate":
                    reached = True
                else:
                    why = "game over: " + ("mate against the learner" if b.is_checkmate() and b.turn == side else b.result())
                break
            mv, info = eng.play(b, chess.engine.Limit(time=self.sp_time))
            if mv is None:
                why = "engine returned no move"; break
            cp = info["score"].pov(side).score(mate_score=10000)
            mover = b.turn
            promo = bool(mv.promotion)
            b.push(mv)
            if mover == side:
                n += 1
                if kind == "eval" and cp >= int(arg):
                    reached = True; break
                if kind == "hold" and n >= int(arg):
                    reached = cp > -150 and not b.is_checkmate(); why = "" if reached else f"hold failed (eval {cp})"; break
                if kind == "promote" and promo:
                    promoted_at = n
            if kind == "promote" and promoted_at and mover != side:     # opponent has replied: is the new piece still there?
                now = sum(1 for _ in b.pieces(chess.QUEEN, side)) + sum(1 for _ in b.pieces(chess.ROOK, side)) + \
                      sum(1 for _ in b.pieces(chess.BISHOP, side)) + sum(1 for _ in b.pieces(chess.KNIGHT, side))
                reached = now > 0 and cp >= 0
                why = "" if reached else "the promoted piece was lost"; break
            if kind == "mate" and b.is_checkmate() and mover == side:
                reached = True; break
        self.selfplay.set(key, {"moves": n, "reached": reached, "why": why})
        self.selfplay.save()
        return n, reached, why

    # ---------------------------------------------------------------- JUDGE
    def check_judge(self, l, it):
        if it.broken:
            return
        p = it.params
        verdict = p.get("verdict")
        if verdict not in ("safe", "blunder"):
            self.add("L12", "FAIL", f"verdict= must be safe or blunder", l.id, it.id); return
        if verdict == "blunder" and not it.refute_uci:
            self.add("L12", "FAIL", "a blunder needs a 'refute:' line", l.id, it.id)
        if self.no_engine:
            return
        b = chess.Board(it.fen)
        mover = b.turn
        try:
            opts = self.solver_options(b)
            if opts["kind"] == "tb":
                cls = opts["classes"].get(p["uci"])
                bad = cls == "worse"
            else:
                loss = opts["wbest"] - self.move_w(b, p["uci"], opts)
                bad = loss >= 12
                if verdict == "safe" and loss > 5:
                    self.add("L12", "FAIL", f"verdict 'safe' but the move loses {loss:.1f} win-%", l.id, it.id)
            if verdict == "blunder" and not bad:
                self.add("L12", "FAIL", "verdict 'blunder' but the move does not lose enough", l.id, it.id)
        except Skip as e:
            self.add("L0", "FAIL", f"{it.id}: {e}", l.id, it.id)
        self.r.items[it.id] = {"kind": "JUDGE"}

    # ---------------------------------------------------------------- SET (L9)
    def check_set(self, l, it):
        p = it.params
        for k in ("theme", "rating", "n"):
            if k not in p:
                self.add("L9", "FAIL", f"SET needs {k}=", l.id, it.id)
        if self.pool is None:
            self.add("L9", "WARN", "puzzle pool (data/puzzles2.json) not built yet: SET not checked", l.id, it.id); return
        sel = select_set(self.pool, p, exclude=set())
        n = int(p.get("n", 0) or 0)
        if len(sel) < n:
            self.add("L9", "FAIL", f"only {len(sel)} pool puzzles match theme={p.get('theme')} rating={p.get('rating')}; {n} asked", l.id, it.id)

    # ---------------------------------------------------------------- text rules (X1, X2, X5, X6) at lesson level
    def text_lessonlevel(self, l):
        for label, text, kind, it in lf.lesson_texts(l):
            self.lint(l, it.id if it else None, label, text, kind)

    def lint(self, l, item_id, label, raw, kind):
        pt = plain(raw)
        words = len(pt.split())
        sents = [s for s in re.split(r"(?<=[.!?])\s+", pt) if s.strip()]
        limit = {"comment": 60, "intro": 90, "why": 45, "rule": 22, "key": 22, "sentence": 90}[kind]
        if words > limit:
            self.add("X1", "FAIL", f"{label}: {words} words (limit {limit})", l.id, item_id)
        slim = 22 if kind in ("rule", "key") else 25
        for s in sents:
            if len(s.split()) > slim:
                self.add("X1", "FAIL", f"{label}: sentence of {len(s.split())} words (limit {slim}): '{s[:50]}...'", l.id, item_id)
        if kind in ("rule", "key") and len(sents) > 1:
            self.add("X1", "FAIL", f"{label}: must be one sentence ({len(sents)} found)", l.id, item_id)
        # X2 jargon: first use per lesson
        gl_marked = re.sub(r"\{gl:([^{}]+)\}", lambda m: "§" + m.group(1) + "§", lf.VARIATION.sub(" ", raw))
        for s in re.split(r"(?<=[.!?])\s+", gl_marked):
            sl = s.lower()
            terms = [(t, re.compile(r"§?\b" + re.escape(t) + r"\b§?")) for t in JARGON]
            found = []
            for t, rx in terms:
                m = rx.search(sl)
                if m:
                    found.append((t, "§" in m.group(0)))
            if EXCHANGE.search(sl):
                found.append(("exchange", "§exchange§" in sl))
            for t, is_gl in found:
                key = "outflank" if t == "outflanking" else t
                if key in self.jargon_seen:
                    continue
                self.jargon_seen.add(key)
                if not is_gl and not any(e in sl for e in EXPLAINERS):
                    self.add("X2", "FAIL", f"{label}: jargon '{t}' is not explained in its sentence (explain it or use {{gl:{t}}})", l.id, item_id)
        low = pt.lower()
        if NUM_EVAL.search(pt):
            self.add("X5", "FAIL", f"{label}: engine number in learner text ('{NUM_EVAL.search(pt).group(0)}')", l.id, item_id)
        for bad in ("obviously", "simply", "of course", "centipawn"):
            if re.search(r"\b" + bad + r"\b", low):
                self.add("X5", "FAIL", f"{label}: banned word '{bad}'", l.id, item_id)
        for w in AMERICAN:
            if re.search(r"\b" + w + r"\b", low):
                self.add("X5", "FAIL", f"{label}: American spelling '{w}' (the app uses British spelling)", l.id, item_id)
        if kind == "comment" and RESTATE.match(pt.strip()):
            self.add("X6", "WARN", f"{label}: the comment only restates the move", l.id, item_id)


# ================================================================== SET selection (shared with the compiler)
def select_set(pool, params, exclude):
    """Deterministic pick of `n` puzzles: filter by theme group, rating range, solver-move count; spread evenly over the rating range."""
    theme = params.get("theme"); lo, hi = 0, 4000
    if params.get("rating"):
        a, _, b = params["rating"].partition("-"); lo, hi = int(a), int(b or a)
    mlo, mhi = 1, 3
    if params.get("moves"):
        a, _, b = params["moves"].partition("-"); mlo, mhi = int(a), int(b or a)
    n = int(params.get("n", 0) or 0)
    cand = []
    for pid, p in pool.items():
        if pid in exclude or (theme and theme not in p["groups"]):
            continue
        sm = len(p["moves"]) // 2
        if lo <= p["rating"] <= hi and mlo <= sm <= mhi:
            cand.append((p["rating"], pid))
    cand.sort()
    if len(cand) <= n:
        return [pid for _, pid in cand]
    out = []
    for i in range(n):
        j = round(i * (len(cand) - 1) / max(1, n - 1)) if n > 1 else len(cand) // 2
        out.append(cand[j][1])
    # evenly spaced indices can collide only when len(cand) < n, which is handled above
    return out


# ================================================================== report and CLI
def format_report(course, res, lesson=None):
    lines = [f"Train 2 verification: course {course.id} ({course.title})" + (f", lesson {lesson}" if lesson else ""),
             f"{len(course.lessons)} lessons, {sum(len(l.items) for l in course.lessons)} items; "
             f"{len(res.fails)} FAIL, {len(res.warns)} WARN; {res.stats.get('seconds', 0)} s, "
             f"{res.stats.get('searches', 0)} engine searches, {res.stats.get('tb', 0)} tablebase probes", ""]
    for sev in ("FAIL", "WARN"):
        group = [f for f in res.findings if f["sev"] == sev]
        if not group:
            continue
        lines.append(f"== {sev} ({len(group)})")
        for f in group:
            where = " / ".join(str(x) for x in (f["lesson"], f["item"], (f"ply {f['ply']}" if f["ply"] else None)) if x)
            lines.append(f"[{f['id']}] {where}: {f['msg']}")
        lines.append("")
    for i in res.info:
        lines.append(i)
    return "\n".join(lines)


def resolve(arg):
    p = Path(arg)
    if p.suffix == ".txt" or p.exists():
        return p
    return COURSES_DIR / f"{arg}.txt"


def verify(course, ev=None, tb=None, no_engine=False, **kw):
    own = False
    if not no_engine:
        own = ev is None
        ev = ev or T2Evals()
        tb = tb or tbmod.default()
    v = Verifier(course, ev, tb, no_engine=no_engine, **kw)
    try:
        return v.run()
    finally:
        if own:
            ev.close()          # the engine thread would keep the process alive after the last line


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("course")
    ap.add_argument("--lesson")
    ap.add_argument("--no-engine", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--pool")
    a = ap.parse_args(argv)
    path = resolve(a.course)
    course = lf.parse_course(path)
    pool = load_pool(a.pool)
    t0 = time.time()
    res = verify(course, no_engine=a.no_engine, only_lesson=a.lesson, pool=pool)
    rep = format_report(course, res, a.lesson)
    out = Path(a.out) if a.out else REPORTS_DIR / f"{course.id or path.stem}.verify.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(rep, encoding="utf-8")
    print(rep)
    return 1 if res.fails else 0


if __name__ == "__main__":
    sys.exit(main())
