"""Parser for the openings2 course source format (BLUEPRINT section 2).

parse_course(path_or_text) -> Course.  Nothing here needs the engine.
Format problems never raise: they are collected in Course.errors as findings
{"id", "sev", "line", "ply", "san", "msg"} so the verifier can print them as ordinary FAILs.
"""
import hashlib, re
from pathlib import Path
import chess

try:
    from common import pos_key
except ImportError:  # imported as a package
    from .common import pos_key

SQUARE = re.compile(r"^[a-h][1-8]$")
SHAPE_ITEM = re.compile(r"^(?:([rgby]):)?([a-z][0-9])(?:-([a-z][0-9]))?$")
SHAPEISH = re.compile(r"^(?:[rgby]:\S*|[a-z][0-9](?:-[a-z][0-9])?)$")
VARIATION = re.compile(r"\(\((.*?)\)\)", re.S)
NAGS_OUR = ("", "!", "!sys")
NAGS_OPP = ("", "?!", "?")
KINDS = ("main", "side", "punish")
TRAP_KINDS = ("set", "avoid", "punish")


def node_id(course_id, key, san):
    """Stable node / card id: first 8 hex of md5(courseId|posKey|san)."""
    return hashlib.md5(f"{course_id}|{key}|{san}".encode("utf-8")).hexdigest()[:8]


def finding(fid, sev, msg, line=None, ply=None, san=None):
    return {"id": fid, "sev": sev, "line": line, "ply": ply, "san": san, "msg": msg}


# ------------------------------------------------------------------ text helpers
def extract_shapes(text, where=None, errors=None):
    """Remove [g:b5-c7] style groups from text; return (clean_text, shapes) with shapes like 'g:b5-c7' / 'r:c7'.
    A bracket group is a shape group when every item looks like a shape; invalid squares are a Q20 FAIL."""
    shapes = []

    def repl(m):
        items = [i for i in re.split(r"[\s,]+", m.group(1).strip()) if i]
        if not items or not all(SHAPEISH.match(i) for i in items):
            return m.group(0)
        for it in items:
            sm = SHAPE_ITEM.match(it)
            if not sm or not SQUARE.match(sm.group(2)) or (sm.group(3) and not SQUARE.match(sm.group(3))):
                if errors is not None:
                    errors.append(finding("Q20", "FAIL", f"invalid arrow/circle '{it}'", *(where or (None, None, None))))
                continue
            col = sm.group(1) or "g"
            shapes.append(f"{col}:{sm.group(2)}" + (f"-{sm.group(3)}" if sm.group(3) else ""))
        return ""

    clean = re.sub(r"\[([^\[\]]*)\]", repl, text)
    return re.sub(r"\s+", " ", clean).strip(), shapes


def tokenize(text):
    """Split a move block into ('c', comment) / ('m', raw move) / ('to', lineid) tokens."""
    out, i, n = [], 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "{":
            j = text.find("}", i)
            if j < 0:
                out.append(("c", text[i + 1:].strip())); break
            out.append(("c", text[i + 1:j].strip())); i = j + 1
        elif ch.isspace():
            i += 1
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] != "{":
                j += 1
            tok = text[i:j]; i = j
            if tok.startswith("=>"):
                rest = tok[2:]
                if not rest:  # id is the next token
                    while i < n and text[i].isspace(): i += 1
                    j = i
                    while j < n and not text[j].isspace(): j += 1
                    rest = text[i:j]; i = j
                out.append(("to", rest.strip()))
                continue
            tok = re.sub(r"^\d+\s*(?:\.{3}|…|\.)", "", tok)   # '7.' '7...' '7…'
            tok = tok.lstrip(".…")
            if tok and tok not in ("1-0", "0-1", "1/2-1/2", "*"):
                out.append(("m", tok))
    return out


def split_nag(raw):
    m = re.match(r"^(.*?)(!sys|\?!|!\?|\?\?|!!|\?|!)?$", raw)
    return m.group(1), (m.group(2) or "")


def parse_quiz(s):
    body, _, explain = s[1:].partition("||")
    parts = [p.strip() for p in body.split("|")]
    q, opts = parts[0], parts[1:]
    ans = [i for i, o in enumerate(opts) if o.startswith("*")]
    if len(opts) < 2 or len(ans) != 1:
        raise ValueError("quiz needs a question, 2+ options and exactly one *right option")
    return {"q": q, "options": [o.lstrip("*").strip() for o in opts], "answer": ans[0], "explain": explain.strip()}


# ------------------------------------------------------------------ data classes
class Move:
    def __init__(self):
        self.raw = ""; self.san = ""; self.uci = ""; self.ply = 0; self.mine = False
        self.nag = ""; self.key = False; self.sys = False
        self.key_before = ""; self.fen_before = ""
        self.c = ""; self.shapes = []; self.plan = None; self.xs = []; self.alts = []; self.quiz = None
        self.has_comment = False

    def comment_texts(self):
        """Every free-text piece attached to this move (for text checks)."""
        t = []
        if self.c: t.append(("c", self.c))
        if self.plan: t.append(("plan", self.plan["text"]))
        for x in self.xs: t.append(("x", x["why"]))
        for a in self.alts: t.append(("a", a["note"]))
        if self.quiz: t.append(("quiz", self.quiz["explain"]))
        return t


class Line:
    def __init__(self, lid, title, kind, section="line"):
        self.id, self.title, self.kind, self.section = lid, title, kind, section
        self.tags = set(); self.ch = None; self.intro = ""; self.raw = ""; self.to = None
        self.moves = []; self.broken = False; self.order = 0
        self.plan_count = 0; self.path = []      # path: list of Node (filled by build_tree)


class Node:
    def __init__(self, mv):
        self.key, self.san, self.uci, self.ply, self.mine = mv.key_before, mv.san, mv.uci, mv.ply, mv.mine
        self.fen_before = mv.fen_before
        self.nag = mv.nag; self.keymove = mv.key; self.sys = mv.sys
        self.c = mv.c; self.shapes = list(mv.shapes); self.plan = mv.plan; self.xs = list(mv.xs); self.alts = list(mv.alts); self.quiz = mv.quiz
        self.owner = None; self.lines = []; self.traps = []
        self.id = None


class Course:
    def __init__(self):
        self.id = ""; self.title = ""; self.side = "white"; self.sub = ""; self.why = ""
        self.ideas = []; self.structures = []; self.skips = []; self.chapters = []
        self.lines = []; self.traps = []; self.models = []; self.models_wanted = []
        self.errors = []; self.nodes = {}; self.path = None

    @property
    def me(self):
        return chess.WHITE if self.side == "white" else chess.BLACK

    def line(self, lid):
        for l in self.lines + self.traps:
            if l.id == lid:
                return l
        return None

    def node_id(self, key, san):
        return node_id(self.id, key, san)


# ------------------------------------------------------------------ parsing
def _fields(s, n=None):
    return [x.strip() for x in (s.split("|", n - 1) if n else s.split("|"))]


def parse_course(src, course_id=None):
    """src: a Path / path string to a .txt file, or the text itself (contains a newline or starts with '#')."""
    c = Course()
    if isinstance(src, Path) or (isinstance(src, str) and "\n" not in src and not src.lstrip().startswith("#")):
        c.path = Path(src); text = c.path.read_text(encoding="utf-8")
    else:
        text = src
    text = text.lstrip("﻿")
    cur = None            # current Line / trap / model
    chapter = None
    section = None        # 'chapter' | 'line' | 'trap' | 'model'
    for lineno, raw in enumerate(text.splitlines(), 1):
        s = raw.strip()
        if not s:
            continue
        if s.startswith("# COURSE"):
            f = _fields(s[len("# COURSE"):])
            if len(f) < 3:
                c.errors.append(finding("F0", "FAIL", f"line {lineno}: '# COURSE id | title | side' needs 3 fields")); continue
            c.id, c.title, c.side = f[0], f[1], f[2].lower()
            if c.side not in ("white", "black"):
                c.errors.append(finding("F0", "FAIL", f"side must be white or black, got '{c.side}'"))
            section = None; cur = None
        elif s.startswith("## CHAPTER"):
            f = _fields(s[len("## CHAPTER"):])
            chapter = {"id": f[0], "title": f[1] if len(f) > 1 else f[0], "intro": "", "lines": []}
            c.chapters.append(chapter); section = "chapter"; cur = None
        elif s.startswith("## TRAPS"):
            section = "traptop"; cur = None
        elif s.startswith("## MODELS"):
            section = "modeltop"; cur = None
        elif s.startswith("### LINE"):
            f = _fields(s[len("### LINE"):])
            if len(f) < 3 or f[2] not in KINDS:
                c.errors.append(finding("F0", "FAIL", f"line {lineno}: '### LINE id | title | main/side/punish' expected, got '{s[:60]}'"))
                f = (f + ["?", "?", "side"])[:3] if len(f) < 3 else f[:2] + ["side"]
            cur = Line(f[0], f[1], f[2]); cur.tags = set(x.lower() for x in f[3:])
            cur.order = len(c.lines); cur.ch = chapter["id"] if chapter else None
            if not chapter:
                c.errors.append(finding("F0", "FAIL", "line outside any chapter", line=cur.id))
            else:
                chapter["lines"].append(cur.id)
            c.lines.append(cur); section = "line"
        elif s.startswith("### TRAP"):
            f = _fields(s[len("### TRAP"):])
            if len(f) < 3 or f[2] not in TRAP_KINDS:
                c.errors.append(finding("F0", "FAIL", f"line {lineno}: '### TRAP id | title | set/avoid/punish' expected"))
                f = (f + ["?", "?", "avoid"])[:3] if len(f) < 3 else f[:2] + ["avoid"]
            cur = Line(f[0], f[1], f[2], section="trap"); cur.tags = set(x.lower() for x in f[3:])
            cur.order = len(c.traps); c.traps.append(cur); section = "trap"
        elif s.startswith("### GAME"):
            f = _fields(s[len("### GAME"):])
            f = (f + [""] * 6)[:6]
            cur = {"id": f[0], "white": f[1], "black": f[2], "year": f[3], "result": f[4], "source": f[5], "notes": {}}
            c.models.append(cur); section = "model"
        elif s.startswith("#"):
            continue   # plain comment line
        elif s.startswith(">") and cur is not None and section in ("line", "trap"):
            cur.intro = (cur.intro + " " + s[1:].strip()).strip()
        elif s.startswith(">") and section == "chapter" and chapter is not None:
            chapter["intro"] = (chapter["intro"] + " " + s[1:].strip()).strip()
        elif s.startswith("note ") and section == "model" and isinstance(cur, dict):
            m = re.match(r"note\s+(\d+)\s*:\s*(.*)$", s)
            if m: cur["notes"][int(m.group(1))] = m.group(2).strip()
            else: c.errors.append(finding("F0", "FAIL", f"line {lineno}: model note must read 'note <ply>: text'"))
        elif re.match(r"^(sub|why|idea|structure|skip|models-wanted)\s*:", s) and section not in ("line", "trap") or \
                re.match(r"^(skip|models-wanted)\s*:", s):
            key, _, val = s.partition(":"); val = val.strip()
            if key == "sub": c.sub = val
            elif key == "why": c.why = val
            elif key == "idea": _parse_idea(c, val)
            elif key == "structure": _parse_structure(c, val)
            elif key == "skip": c.skips.append({"text": val, "line_no": lineno})
            elif key == "models-wanted": c.models_wanted += [x.strip() for x in re.split(r"[,\s]+", val) if x.strip()]
        elif cur is not None and section in ("line", "trap"):
            cur.raw += " " + s
        else:
            c.errors.append(finding("F0", "FAIL", f"line {lineno}: not understood outside a line: '{s[:70]}'"))
    if course_id and not c.id:
        c.id = course_id
    for l in c.lines + c.traps:
        _parse_line(c, l)
    _parse_skips(c)
    build_tree(c)
    return c


def _parse_idea(c, val):
    f = _fields(val)
    fen = None
    rest = []
    for x in f[1:]:
        if x.startswith("fen=") and fen is None: fen = x[4:].strip()
        else: rest.append(x)
    text, shapes = extract_shapes(" | ".join(rest), errors=c.errors)
    c.ideas.append({"t": f[0], "text": text, "shapes": shapes, "fen": fen})


def _parse_structure(c, val):
    f = _fields(val)
    if len(f) < 3:
        c.errors.append(finding("F0", "FAIL", "structure: needs 'id | title | fen=<FEN> | text'")); return
    fen = None; rest = []
    for x in f[2:]:
        if x.startswith("fen=") and fen is None: fen = x[4:].strip()
        else: rest.append(x)
    text, shapes = extract_shapes(" | ".join(rest), errors=c.errors)
    if fen:
        try: chess.Board(fen)
        except ValueError: c.errors.append(finding("F0", "FAIL", f"structure {f[0]}: bad FEN"))
    c.structures.append({"id": f[0], "t": f[1], "fen": fen, "text": text, "shapes": shapes})


def _replay_san(board, text):
    """Replay a bare move list (used for skip:) -> list of (key_before, san) or raise ValueError."""
    out = []
    for kind, val in tokenize(text):
        if kind != "m": continue
        san_raw, _ = split_nag(val)
        try:
            mv = board.parse_san(san_raw)
        except ValueError as e:
            raise ValueError(f"'{san_raw}': {e}")
        out.append((pos_key(board), board.san(mv))); board.push(mv)
    return out


def _parse_skips(c):
    for sk in c.skips:
        moves, _, reason = sk["text"].partition("|")
        sk["reason"] = reason.strip(); sk["key"] = None; sk["san"] = None
        try:
            seq = _replay_san(chess.Board(), moves)
            sk["key"], sk["san"] = seq[-1]
        except (ValueError, IndexError) as e:
            c.errors.append(finding("Q7", "FAIL", f"skip entry '{moves.strip()[:50]}': {e}"))
        if not sk["reason"]:
            c.errors.append(finding("Q14", "FAIL", f"skip entry '{moves.strip()[:50]}' has no reason after '|'"))


def _parse_line(c, l):
    b = chess.Board()
    me_white = c.side == "white"
    last = None
    for kind, val in tokenize(l.raw):
        if kind == "to":
            l.to = val; continue
        if kind == "m":
            if l.broken: continue
            san_raw, nag = split_nag(val)
            ply = len(l.moves) + 1
            mine = (ply % 2 == 1) == me_white
            try:
                mv = b.parse_san(san_raw)
            except chess.AmbiguousMoveError:
                c.errors.append(finding("Q7", "FAIL", f"ambiguous SAN '{san_raw}'", l.id, ply, san_raw)); l.broken = True; continue
            except ValueError as e:
                c.errors.append(finding("Q7", "FAIL", f"illegal SAN '{san_raw}' ({str(e).split(':')[0]})", l.id, ply, san_raw)); l.broken = True; continue
            m = Move(); m.raw = val; m.san = b.san(mv); m.uci = mv.uci(); m.ply = ply; m.mine = mine
            m.key_before = pos_key(b); m.fen_before = b.fen()
            ok = NAGS_OUR if mine else NAGS_OPP
            if nag not in ok:
                c.errors.append(finding("F0", "FAIL", f"annotation '{nag}' not allowed on {'our' if mine else 'opponent'} moves (allowed: {', '.join(repr(x) for x in ok if x)})", l.id, ply, m.san))
                nag = ""
            m.nag = "sys" if nag == "!sys" else nag
            m.key = nag == "!"; m.sys = nag == "!sys"
            b.push(mv); l.moves.append(m); last = m
        else:  # comment
            if last is None:
                c.errors.append(finding("F0", "FAIL", "comment before the first move", l.id)); continue
            _attach_comment(c, l, last, val)
    if not l.broken and l.moves:
        if not l.moves[-1].mine:
            c.errors.append(finding("Q7", "FAIL", "line does not end on OUR move", l.id, l.moves[-1].ply, l.moves[-1].san))
    elif not l.moves and not l.broken:
        c.errors.append(finding("F0", "FAIL", "line has no moves", l.id))
    l.plan_count = sum(1 for m in l.moves if m.plan)


def _attach_comment(c, l, m, text):
    where = (l.id, m.ply, m.san)
    try:
        if text.startswith("?"):
            m.quiz = parse_quiz(text); m.has_comment = True; return
        if text.startswith("P:"):
            t, sh = extract_shapes(text[2:].strip(), where, c.errors)
            if m.plan: c.errors.append(finding("F1", "FAIL", "two plan notes on one move", *where))
            m.plan = {"text": t, "shapes": sh}; m.has_comment = True; return
        if text.startswith("X:") or text.startswith("A:"):
            body = text[2:].strip()
            san_s, bar, expl = body.partition("|")
            if not bar:
                c.errors.append(finding("F0", "FAIL", f"'{text[:2]}' note needs 'san | text'", *where)); return
            t, _ = extract_shapes(expl.strip(), where, c.errors)
            san_s = san_s.strip()
            if text.startswith("X:"): m.xs.append({"san": san_s, "why": t})
            else: m.alts.append({"san": san_s, "note": t})
            m.has_comment = True; return
    except ValueError as e:
        c.errors.append(finding("F0", "FAIL", f"bad quiz: {e}", *where)); return
    t, sh = extract_shapes(text, where, c.errors)
    m.c = (m.c + " " + t).strip(); m.shapes += sh; m.has_comment = True


# ------------------------------------------------------------------ tree
def build_tree(c):
    """Merge all lines (file order) into c.nodes {(posKey, san): Node}; fill Line.path.  First line owns comments."""
    c.nodes = {}
    for l in c.lines + c.traps:
        l.path = []
        for m in l.moves:
            k = (m.key_before, m.san)
            n = c.nodes.get(k)
            if n is None:
                n = Node(m); n.owner = l.id; n.id = node_id(c.id, m.key_before, m.san); c.nodes[k] = n
                new = True
            else:
                new = False
                _merge(c, n, m, l)
            (n.traps if l.section == "trap" else n.lines).append(l.id)
            l.path.append(n)
    ids = {}
    for n in c.nodes.values():
        if n.id in ids:
            c.errors.append(finding("F0", "FAIL", f"node id collision {n.id}: {n.san} / {ids[n.id].san}"))
        ids[n.id] = n


def _merge(c, n, m, l):
    """A later line repeats an existing node: compare / adopt annotations (first non-empty wins, differing = FAIL F1)."""
    where = (l.id, m.ply, m.san)

    def same(a, b, what):
        if a and b and a != b:
            c.errors.append(finding("F1", "FAIL", f"{what} differs from the one written in line {n.owner} (first line owns it)", *where))
            return False
        return True

    if m.nag and n.nag and m.nag != n.nag:
        c.errors.append(finding("F1", "FAIL", f"annotation '{m.nag}' differs from '{n.nag}' in line {n.owner}", *where))
    if m.nag and not n.nag:
        n.nag, n.keymove, n.sys = m.nag, m.key, m.sys
    if m.c:
        if same(n.c, m.c, "comment") and not n.c:
            n.c = m.c; n.shapes = list(m.shapes)
            c.errors.append(finding("F2", "WARN", f"comment added in a later line than the first ({n.owner}); keep comments in the first line", *where))
    if m.plan:
        if same(n.plan and n.plan["text"], m.plan["text"], "plan note") and not n.plan: n.plan = m.plan
    if m.xs and not n.xs: n.xs = list(m.xs)
    elif m.xs and [x["san"] for x in m.xs] != [x["san"] for x in n.xs]:
        c.errors.append(finding("F1", "FAIL", f"X-note differs from the one in line {n.owner}", *where))
    if m.alts and not n.alts: n.alts = list(m.alts)
    if m.quiz and not n.quiz: n.quiz = m.quiz


def variations(text):
    """List of variation strings from '((...))' groups."""
    return [v.strip() for v in VARIATION.findall(text or "")]


def strip_variations(text):
    return VARIATION.sub(" ", text or "")
