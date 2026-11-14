"""Parser for the Train 2 lesson source format (BLUEPRINT section 3.1).  No engine needed.

parse_course(path_or_text) -> Course.  Format problems never raise: they are collected in Course.errors as findings
{"id", "sev", "lesson", "item", "ply", "msg"} so the verifier prints them as ordinary FAILs.

Dialect: like the opening courses (comments {...}, arrows [g:e3-d4], circles [r:c7], variations ((...)), glossary {gl:term}),
but every position starts from a FEN.  Item headers:
    #### EX   <id> | <FEN> | src=... [| side=white|black]      move text with {comments}, then  key: ...
    #### CARD <id> | <FEN> | src=... [| last=e7e6] [| tag=hold] [| goal=win|draw]     sol: / why: / also: / wrong:
    #### PLAY <id> | <FEN> | goal=win|draw | finish=mate|promote|hold:<n>|eval:<cp> | max=<n> | failBelow=<cp> [| side=...]
    #### JUDGE <id> | <FEN> | move=<SAN> | verdict=safe|blunder | src=...           refute: / why:
    #### SET <id> | theme=<group> | rating=700-1500 | n=20 | moves=1-2
    #### MINE <type> | kind=... | n=6
Reused from openings2/tools/course_format.py: shape extraction and NAG splitting (credit: Openings 2 tools).
"""
import re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import chess
from t2common import pos_key
from course_format import extract_shapes, split_nag          # openings2 helpers (path set up by t2common)

VARIATION = re.compile(r"\(\((.*?)\)\)", re.S)
GL = re.compile(r"\{gl:([^{}]+)\}")
KINDS = ("EX", "CARD", "PLAY", "JUDGE", "SET", "MINE")
NAGS = ("", "!", "?", "!!", "??", "!?", "?!")
RESULTS = ("1-0", "0-1", "1/2-1/2", "*")


def finding(fid, sev, msg, lesson=None, item=None, ply=None):
    return {"id": fid, "sev": sev, "lesson": lesson, "item": item, "ply": ply, "msg": msg}


# ------------------------------------------------------------------ text helpers
def gl_terms(text):
    return [t.strip().lower() for t in GL.findall(text or "")]


def variations(text):
    return [v.strip() for v in VARIATION.findall(text or "")]


def plain(text):
    """Learner-visible prose: variations, arrows/circles removed, {gl:term} -> term."""
    t = VARIATION.sub(" ", text or "")
    t = GL.sub(lambda m: m.group(1), t)
    t, _ = extract_shapes(t)
    return re.sub(r"\s+", " ", t).strip()


def tokenize(text):
    """('c', comment) / ('m', raw move).  Comments are {...} and may contain one level of {gl:term}."""
    out, i, n = [], 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "{":
            depth, j = 1, i + 1
            while j < n and depth:
                if text[j] == "{": depth += 1
                elif text[j] == "}": depth -= 1
                j += 1
            out.append(("c", text[i + 1:j - 1 if depth == 0 else j].strip()))
            i = j
        elif ch.isspace():
            i += 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] != "{":
                j += 1
            tok = text[i:j]; i = j
            tok = re.sub(r"^\d+\s*(?:\.{3}|…|\.)", "", tok)      # '7.' '7...' '7…'
            tok = tok.lstrip(".…")
            if tok and tok not in RESULTS:
                out.append(("m", tok))
    return out


def number_prefix(tok):
    """'3...Kd5' -> (3, 'b') ; '3.Kd5' -> (3, 'w') ; plain 'Kd5' -> None."""
    m = re.match(r"^(\d+)\s*(\.{3}|…|\.)", tok)
    if not m:
        return None
    return int(m.group(1)), ("b" if m.group(2) in ("...", "…") else "w")


# ------------------------------------------------------------------ data classes
class Move:
    def __init__(self):
        self.raw = ""; self.san = ""; self.uci = ""; self.ply = 0; self.mover = None
        self.nag = ""; self.key = False; self.c = ""; self.shapes = []; self.vars = []; self.gl = []
        self.fen_before = ""

    @property
    def mark_good(self):
        return self.nag in ("!", "!!")


class Item:
    def __init__(self, kind, iid, lineno):
        self.kind, self.id, self.lineno = kind, iid, lineno
        self.fen = None; self.params = {}; self.lesson = None
        self.text = ""                  # '>' lines (EX setting / PLAY text)
        self.body = ""                  # raw move block (EX)
        self.moves = []                 # EX
        self.key_text = ""              # EX 'key:'
        self.sol_raw = ""; self.sol = []        # CARD: SAN list (and uci after replay)
        self.sol_uci = []
        self.why = ""
        self.also = []                  # [{"san", "uci", "text"}]
        self.wrong = []                 # [{"san", "uci", "text", "vars": [str]}]
        self.refute_raw = ""; self.refute = []; self.refute_uci = []   # JUDGE
        self.broken = False

    @property
    def src(self):
        return self.params.get("src", "")


class Lesson:
    def __init__(self, lid, title, chapter):
        self.id, self.title, self.ch = lid, title, chapter
        self.goal = self.rule = self.intro = ""
        self.items = []
        self.gl = set()

    def item(self, iid):
        return next((i for i in self.items if i.id == iid), None)


class Course:
    def __init__(self):
        self.id = ""; self.title = ""; self.sub = ""; self.why = ""
        self.chapters = []; self.lessons = []; self.errors = []; self.path = None

    def lesson(self, lid):
        return next((l for l in self.lessons if l.id == lid), None)

    def all_items(self):
        for l in self.lessons:
            for it in l.items:
                yield l, it


def _fields(s):
    return [x.strip() for x in s.split("|")]


def _params(fields):
    p = {}
    for f in fields:
        if "=" in f:
            k, _, v = f.partition("=")
            p[k.strip()] = v.strip()
    return p


# ------------------------------------------------------------------ parsing
def parse_course(src):
    c = Course()
    if isinstance(src, Path) or (isinstance(src, str) and "\n" not in src and not src.lstrip().startswith("#")):
        c.path = Path(src); text = c.path.read_text(encoding="utf-8")
    else:
        text = src
    text = text.lstrip("﻿")
    chapter = lesson = item = None
    in_ex_body = False

    def err(msg, lineno):
        c.errors.append(finding("F0", "FAIL", f"line {lineno}: {msg}", lesson.id if lesson else None, item.id if item else None))

    for lineno, raw in enumerate(text.splitlines(), 1):
        s = raw.strip()
        if not s:
            continue
        if s.startswith("# COURSE"):
            f = _fields(s[len("# COURSE"):])
            if len(f) < 2:
                err("'# COURSE id | title' expected", lineno); continue
            c.id, c.title = f[0], f[1]
            chapter = lesson = item = None
        elif s.startswith("## CHAPTER"):
            f = _fields(s[len("## CHAPTER"):])
            if not f or not f[0]:
                err("'## CHAPTER id | title | theme=...' expected", lineno); continue
            chapter = {"id": f[0], "title": f[1] if len(f) > 1 else f[0], "theme": _params(f[2:]).get("theme"), "intro": "", "lessons": []}
            c.chapters.append(chapter); lesson = item = None
        elif s.startswith("### LESSON"):
            f = _fields(s[len("### LESSON"):])
            if len(f) < 2:
                err("'### LESSON id | title' expected", lineno); continue
            lesson = Lesson(f[0], f[1], chapter["id"] if chapter else None)
            if chapter is None:
                err("lesson outside any chapter", lineno)
            else:
                chapter["lessons"].append(lesson.id)
            c.lessons.append(lesson); item = None
        elif s.startswith("#### "):
            f = _fields(s[5:])
            head = f[0].split(None, 1)
            kind = head[0]
            if kind not in KINDS or lesson is None:
                err(f"item header not understood or outside a lesson: '{s[:60]}'", lineno); item = None; continue
            rest = head[1].strip() if len(head) > 1 else ""
            if kind == "MINE":
                item = Item("MINE", f"mine-{lesson.id}-{len([i for i in lesson.items if i.kind == 'MINE']) + 1}", lineno)
                item.params = _params(f[1:]); item.params["type"] = rest
            elif kind == "SET":
                item = Item("SET", rest, lineno); item.params = _params(f[1:])
            else:
                item = Item(kind, rest, lineno)
                if len(f) < 2:
                    err(f"{kind} needs 'id | FEN | ...'", lineno)
                else:
                    item.fen = f[1]; item.params = _params(f[2:])
            item.lesson = lesson.id
            lesson.items.append(item)
            in_ex_body = kind == "EX"
        elif s.startswith(">"):
            t = s[1:].strip()
            if item is not None and item.kind in ("EX", "PLAY", "JUDGE"):
                item.text = (item.text + " " + t).strip()
            elif lesson is not None:
                lesson.intro = (lesson.intro + " " + t).strip()
            elif chapter is not None:
                chapter["intro"] = (chapter["intro"] + " " + t).strip()
            else:
                err("'>' line outside a chapter", lineno)
        elif re.match(r"^(sub|why|goal|rule|key|sol|also|wrong|refute)\s*:", s):
            key, _, val = s.partition(":"); key = key.strip(); val = val.strip()
            if lesson is None and item is None:
                if key == "sub": c.sub = val
                elif key == "why": c.why = val
                else: err(f"'{key}:' outside a lesson", lineno)
            elif item is None:
                if key == "goal": lesson.goal = val
                elif key == "rule": lesson.rule = val
                else: err(f"'{key}:' before any item in lesson {lesson.id}", lineno)
            else:
                in_ex_body = False
                if key == "key" and item.kind == "EX": item.key_text = val
                elif key == "sol" and item.kind == "CARD": item.sol_raw = val
                elif key == "why" and item.kind in ("CARD", "JUDGE"): item.why = val
                elif key == "refute" and item.kind == "JUDGE": item.refute_raw = val
                elif key in ("also", "wrong") and item.kind == "CARD":
                    mv, _, txt = val.partition("|")
                    entry = {"san": mv.strip().rstrip("!?"), "uci": None, "text": txt.strip(), "vars": variations(txt)}
                    (item.also if key == "also" else item.wrong).append(entry)
                else: err(f"'{key}:' does not belong in a {item.kind}", lineno)
        elif s.startswith("#"):
            continue
        elif item is not None and item.kind == "EX" and in_ex_body:
            item.body += " " + s
        else:
            err(f"not understood: '{s[:70]}'", lineno)
    for l in c.lessons:
        _post(c, l)
    return c


# ------------------------------------------------------------------ replay (SAN -> UCI, legality)
def _post(c, lesson):
    for it in lesson.items:
        for t in (lesson.goal, lesson.rule, lesson.intro, it.text, it.why, it.key_text):
            lesson.gl.update(gl_terms(t))
        if it.kind in ("EX", "CARD", "PLAY", "JUDGE"):
            try:
                board = chess.Board(it.fen)
            except Exception:
                board = None
            if board is None:
                it.broken = True      # L1 reports the FEN; nothing to replay
                if it.kind == "EX":
                    it.moves = _moves_without_board(it)
                continue
        if it.kind == "EX":
            _replay_ex(c, lesson, it, board)
        elif it.kind == "CARD":
            _replay_card(c, lesson, it, board)
        elif it.kind == "JUDGE":
            _replay_judge(c, lesson, it, board)


def _fail(c, lesson, it, msg, ply=None):
    c.errors.append(finding("F1", "FAIL", msg, lesson.id, it.id, ply))
    it.broken = True


def _moves_without_board(it):
    out = []
    for kind, val in tokenize(it.body):
        if kind == "m":
            m = Move(); m.raw = val; m.san, m.nag = split_nag(val); out.append(m)
    return out


def _replay_ex(c, lesson, it, board):
    last = None
    ply = 0
    for kind, val in tokenize(it.body):
        if kind == "c":
            if last is None:
                it.text = (it.text + " " + val).strip()
                continue
            text, shapes = extract_shapes(val, errors=c.errors)
            last.c = (last.c + " " + text).strip() if last.c else text
            last.shapes += shapes
            last.vars += variations(val)
            lesson.gl.update(gl_terms(val))
            continue
        m = Move(); m.raw = val
        m.san, m.nag = split_nag(val)
        if m.nag not in NAGS:
            _fail(c, lesson, it, f"unknown annotation '{m.nag}' on {m.san}", ply + 1); return
        m.key = m.nag in ("!", "!!")
        m.fen_before = board.fen(); m.mover = board.turn
        m.ply = board.fullmove_number * 2 - (1 if board.turn == chess.WHITE else 0)
        try:
            mv = board.parse_san(m.san)
        except Exception:
            _fail(c, lesson, it, f"illegal or unreadable move '{m.san}' after {len(it.moves)} moves", m.ply); return
        m.uci = mv.uci(); m.san = board.san(mv)
        board.push(mv)
        it.moves.append(m); last = m; ply += 1


def replay_san_list(fen, text):
    """Replay a bare SAN list from a FEN -> (sans, ucis) ; raises ValueError on an illegal move."""
    b = chess.Board(fen); sans, ucis = [], []
    for kind, val in tokenize(text):
        if kind != "m":
            continue
        san, _ = split_nag(val)
        try:
            mv = b.parse_san(san)
        except Exception:
            raise ValueError(f"illegal move '{san}' (after {' '.join(sans) or 'the start'})")
        sans.append(b.san(mv)); ucis.append(mv.uci()); b.push(mv)
    return sans, ucis


def _replay_card(c, lesson, it, board):
    if not it.sol_raw:
        _fail(c, lesson, it, "card has no 'sol:' line"); return
    try:
        it.sol, it.sol_uci = replay_san_list(it.fen, it.sol_raw)
    except ValueError as e:
        _fail(c, lesson, it, f"sol: {e}"); return
    for lst in (it.also, it.wrong):
        for e in lst:
            try:
                mv = board.parse_san(e["san"]); e["uci"] = mv.uci(); e["san"] = board.san(mv)
            except Exception:
                _fail(c, lesson, it, f"also/wrong move '{e['san']}' is illegal in the card position")
    if it.params.get("last"):
        pass     # checked by the verifier (L1)


def _replay_judge(c, lesson, it, board):
    mv_san = it.params.get("move", "")
    try:
        mv = board.parse_san(mv_san)
    except Exception:
        _fail(c, lesson, it, f"judge move '{mv_san}' is illegal"); return
    it.params["uci"] = mv.uci(); it.params["san"] = board.san(mv)
    board.push(mv)
    if it.refute_raw:
        try:
            it.refute, it.refute_uci = replay_san_list(board.fen(), it.refute_raw)
        except ValueError as e:
            _fail(c, lesson, it, f"refute: {e}")


# ------------------------------------------------------------------ texts for the linter
def lesson_texts(lesson):
    """[(label, text, kind, item_id)] in reading order; kind in sentence/comment/intro/rule/key/why."""
    out = []
    if lesson.goal: out.append(("goal", lesson.goal, "sentence", None))
    if lesson.rule: out.append(("rule", lesson.rule, "rule", None))
    if lesson.intro: out.append(("intro", lesson.intro, "intro", None))
    for it in lesson.items:
        if it.kind == "EX":
            if it.text: out.append((f"{it.id} setting", it.text, "sentence", it))
            for m in it.moves:
                if m.c: out.append((f"{it.id} {m.ply}.{m.san}", m.c, "comment", it))
            if it.key_text: out.append((f"{it.id} key", it.key_text, "key", it))
        elif it.kind == "CARD":
            if it.why: out.append((f"{it.id} why", it.why, "why", it))
            for e in it.also: out.append((f"{it.id} also {e['san']}", e["text"], "why", it))
            for e in it.wrong: out.append((f"{it.id} wrong {e['san']}", e["text"], "why", it))
        elif it.kind == "JUDGE":
            if it.why: out.append((f"{it.id} why", it.why, "why", it))
        elif it.kind == "PLAY":
            if it.text: out.append((f"{it.id} text", it.text, "sentence", it))
    return out
