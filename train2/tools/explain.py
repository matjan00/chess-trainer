"""Generated "why" sentences for puzzles and own-game cards (BLUEPRINT 3.3).  Never free text: every sentence is a template
filled with facts that python-chess computes from the solution line, and every result is linted (`lint_why`, = PZ7 / X1-X5).

    explain(fen, moves, themes, group=None)   Lichess convention: fen is BEFORE moves[0] (the opponent's set-up move);
                                              the solver plays moves[1], moves[3], ...
    explain_line(fen, ucis, themes, group)    fen is the position with the solver to move; ucis start with the solver's move
                                              (use this one for own-game cards; add "You played ...; ..." yourself)
    lint_why(text, fen=None, ucis=None)       list of problems ([] = ok)

Output: one theme sentence (what the key move does, named by piece and square) + one pay-off sentence (checkmate, material
won, promotion).  If no theme template fits its checks, the fallback is "The key is the <piece> to <square>: <pay-off>".
Moves are named in words ("the queen to h7"), never in algebraic notation, so nothing needs the (( )) markup of the lessons.
The sentences avoid every jargon word of X2 (a fork is explained as "attacks two things at once", and so on).
"""
import re, sys
from pathlib import Path
import chess

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
NAME = {chess.PAWN: "pawn", chess.KNIGHT: "knight", chess.BISHOP: "bishop", chess.ROOK: "rook", chess.QUEEN: "queen", chess.KING: "king"}
SLIDERS = (chess.BISHOP, chess.ROOK, chess.QUEEN)
# lichess tag -> template, in the order they are tried when no group is preferred
TAG_ORDER = ["backRankMate", "mateIn1", "mateIn2", "doubleCheck", "fork", "skewer", "pin", "discoveredAttack", "capturingDefender",
             "trappedPiece", "intermezzo", "deflection", "attraction", "hangingPiece", "promotion", "advancedPawn",
             "defensiveMove", "pawnEndgame", "rookEndgame"]
GROUP_TAGS = {"hanging": ["hangingPiece"], "fork": ["fork"], "pin": ["pin"], "skewer": ["skewer"],
              "discovered": ["doubleCheck", "discoveredAttack"], "removal": ["capturingDefender"],
              "deflection": ["deflection", "attraction"], "trapped": ["trappedPiece"], "intermezzo": ["intermezzo"],
              "mate1": ["mateIn1"], "mate2": ["mateIn2"], "backrank": ["backRankMate"], "defend": ["defensiveMove"],
              "promotion": ["promotion", "advancedPawn"], "pawnEndgame": ["pawnEndgame"], "rookEndgame": ["rookEndgame"]}


# ---------------------------------------------------------------- small helpers
def art(n):
    return "an" if n[0] in "aeiou" else "a"


def pname(board, sq, own=None, solver=None):
    """'the knight on e7' (enemy) or 'your knight on e7' (solver's own)."""
    pc = board.piece_at(sq)
    if pc is None:
        return None
    who = "your" if (solver is not None and pc.color == solver) else "the"
    return f"{who} {NAME[pc.piece_type]} on {chess.square_name(sq)}"


def join(items):
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def cap_first(s):
    return s[:1].upper() + s[1:]


class Line:
    """The solution line from the solver's point of view."""

    def __init__(self, fen, ucis):
        self.b0 = chess.Board(fen)
        self.solver = self.b0.turn
        self.enemy = not self.solver
        self.ucis = list(ucis)
        self.boards = [self.b0.copy()]
        self.moves = []
        self.sans = []
        b = self.b0.copy()
        for u in self.ucis:
            mv = chess.Move.from_uci(u)
            if mv not in b.legal_moves:
                raise ValueError(f"illegal move {u} in {b.fen()}")
            self.sans.append(b.san(mv))
            self.moves.append(mv)
            b.push(mv)
            self.boards.append(b.copy())
        self.key = self.moves[0]
        self.before = self.boards[0]
        self.after = self.boards[1]
        self.end = self.boards[-1]

    # captured pieces by whom; returns (gains, losses) as lists of piece types, plus promotions
    def captures(self):
        gains, losses, promos = [], [], []
        for i, mv in enumerate(self.moves):
            bd = self.boards[i]
            mover = bd.turn
            if bd.is_en_passant(mv):
                cap = chess.PAWN
            else:
                p = bd.piece_at(mv.to_square)
                cap = p.piece_type if p else None
            if cap is not None:
                (gains if mover == self.solver else losses).append(cap)
            if mv.promotion and mover == self.solver:
                promos.append(mv.promotion)
        return gains, losses, promos

    def captured_squares(self):
        """squares where the solver captured, in order (with the captured piece type)."""
        out = []
        for i, mv in enumerate(self.moves):
            bd = self.boards[i]
            if bd.turn != self.solver:
                continue
            if bd.is_en_passant(mv):
                out.append((mv.to_square, chess.PAWN, i))
            elif bd.piece_at(mv.to_square):
                out.append((mv.to_square, bd.piece_at(mv.to_square).piece_type, i))
        return out

    def mate(self):
        return self.end.is_checkmate() and self.end.turn == self.enemy

    def key_piece(self):
        return self.before.piece_at(self.key.from_square)


def value_sum(types):
    return sum(VAL[t] for t in types)


def material_sentence(line):
    """What the solver wins, or None.  Facts: captures (and promotion) along the line."""
    gains, losses, promos = line.captures()
    g, l = list(gains), list(losses)
    for t in list(g):                       # a piece taken and a piece of the same kind lost cancel out
        if t in l:
            l.remove(t)
            g.remove(t)
    net = value_sum(g) - value_sum(l)
    if line.mate() and net <= 0:
        return None
    if net <= 0:
        return None
    gl = sorted(g, key=lambda t: -VAL[t])
    ll = sorted(l, key=lambda t: -VAL[t])
    ng = [art(NAME[t]) + " " + NAME[t] for t in gl]
    if not ll:
        if len(ng) > 2:
            ng = ng[:2]
        return "You win " + " and ".join(ng) + "."
    nl = [art(NAME[t]) + " " + NAME[t] for t in ll]
    if net == 1:
        return "You come out a pawn up."
    top_g = ng[0] if len(gl) == 1 else join(ng[:2])
    return f"You win {top_g} for {join(nl[:2])}."


def promo_sentence(line):
    gains, losses, promos = line.captures()
    if promos:
        for i, mv in enumerate(line.moves):
            if mv.promotion and line.boards[i].turn == line.solver:
                return f"The pawn reaches {chess.square_name(mv.to_square)} and becomes {art(NAME[mv.promotion])} {NAME[mv.promotion]}."
    return None


def payoff(line):
    if line.mate():
        return "It ends in checkmate."
    ms = material_sentence(line)
    return ms


def attacked_enemy(board, sq, enemy):
    """enemy pieces attacked by the piece on sq."""
    return [t for t in board.attacks(sq) if board.piece_at(t) and board.piece_at(t).color == enemy]


# ---------------------------------------------------------------- theme templates: each returns a sentence or None
def t_mate(line, mate_in=None):
    if not line.mate():
        return None
    last = line.moves[-1]
    bd = line.boards[-2]
    mover = bd.piece_at(last.from_square)
    mv_name = NAME[last.promotion or mover.piece_type]
    sq = chess.square_name(last.to_square)
    ksq = line.end.king(line.enemy)
    n = (len(line.moves) + 1) // 2
    if n == 1:
        return f"Checkmate: your {mv_name} goes to {sq}, the king is attacked and has no safe square."
    first = NAME[line.before.piece_at(line.key.from_square).piece_type]
    return (f"Mate in {n}: after your {first} goes to {chess.square_name(line.key.to_square)}, "
            f"your {mv_name} mates on {sq} whatever the reply.")


def t_backrank(line):
    if not line.mate():
        return None
    last = line.moves[-1]
    bd = line.boards[-2]
    mover = bd.piece_at(last.from_square)
    if last.promotion:
        return None
    ksq = line.end.king(line.enemy)
    rank_edge = chess.square_rank(ksq) in (0, 7)
    if not rank_edge or mover.piece_type not in (chess.ROOK, chess.QUEEN):
        return None
    if chess.square_rank(last.to_square) != chess.square_rank(ksq):
        return None
    return (f"Back-rank mate: the king is stuck behind its own pawns, so your {NAME[mover.piece_type]} "
            f"checks on {chess.square_name(last.to_square)} and nothing can escape.")


def t_double_check(line):
    if len(line.after.checkers()) < 2:
        return None
    sqs = list(line.after.checkers())
    names = [pname(line.after, s, solver=line.solver) for s in sqs]
    return f"Double check: {join(names)} both give check, so the king has to move."


def t_fork(line):
    mv = line.key
    pc = line.after.piece_at(mv.to_square)
    if pc is None or pc.color != line.solver:
        return None
    tg = []
    for t in attacked_enemy(line.after, mv.to_square, line.enemy):
        p = line.after.piece_at(t)
        if p.piece_type == chess.KING:
            tg.append((100, t, True))
        elif p.piece_type != chess.PAWN and (VAL[p.piece_type] > VAL[pc.piece_type] or not line.after.is_attacked_by(line.enemy, t)):
            tg.append((VAL[p.piece_type], t, False))
    if len(tg) < 2:
        return None
    tg.sort(key=lambda x: -x[0])
    tg = tg[:3]
    if not line.mate():
        won = {ty for _s, ty, _i in line.captured_squares()}
        if not any(line.after.piece_at(t).piece_type in won for _v, t, k in tg if not k):
            return None
    parts = []
    for v, t, king in tg:
        parts.append("the king" if king else pname(line.after, t, solver=line.solver))
    me = f"your {NAME[pc.piece_type]} on {chess.square_name(mv.to_square)}"
    if tg[0][2]:
        rest = parts[1:]
        return f"Fork: {me} checks the king and attacks {join(rest)}."
    return f"Fork: {me} attacks {join(parts)} at once."


def find_pin(board, solver):
    """-> (pinned_sq, behind_sq, absolute) for an enemy piece pinned by a solver slider, or None."""
    enemy = not solver
    best = None
    for sq in chess.SquareSet(board.occupied_co[enemy]):
        pc = board.piece_at(sq)
        if pc.piece_type == chess.KING:
            continue
        if board.is_pinned(enemy, sq):
            ksq = board.king(enemy)
            return (sq, ksq, True)
    for ssq in chess.SquareSet(board.occupied_co[solver]):
        sp = board.piece_at(ssq)
        if sp.piece_type not in SLIDERS:
            continue
        for d in _dirs(sp.piece_type):
            r = _ray(board, ssq, d)
            if len(r) >= 2 and r[0][1].color == enemy and r[1][1].color == enemy:
                a, b = r[0], r[1]
                if b[1].piece_type != chess.KING and VAL[b[1].piece_type] > VAL[a[1].piece_type] and a[1].piece_type != chess.KING:
                    cand = (a[0], b[0], False)
                    if best is None:
                        best = cand
    return best


DIRS = {chess.BISHOP: [(1, 1), (1, -1), (-1, 1), (-1, -1)], chess.ROOK: [(1, 0), (-1, 0), (0, 1), (0, -1)]}
DIRS[chess.QUEEN] = DIRS[chess.BISHOP] + DIRS[chess.ROOK]


def _dirs(pt):
    return DIRS[pt]


def _ray(board, sq, d):
    """pieces met along direction d from sq: [(square, piece), ...] (at most 3)."""
    f, r = chess.square_file(sq), chess.square_rank(sq)
    out = []
    while True:
        f += d[0]
        r += d[1]
        if not (0 <= f < 8 and 0 <= r < 8):
            break
        s = chess.square(f, r)
        p = board.piece_at(s)
        if p:
            out.append((s, p))
            if len(out) == 3:
                break
    return out


def pinner_is_key(bd, pin, line):
    """the moved piece is the one that pins (it attacks the pinned piece along the pin line)."""
    if bd is not line.after:
        return False
    return bool(bd.attacks_mask(line.key.to_square) & chess.BB_SQUARES[pin[0]])


def t_pin(line):
    caps = {s for s, _t, _i in line.captured_squares()}
    for bd in (line.after, line.before):
        pin = find_pin(bd, line.solver)
        if pin and (pin[0] in caps or pinner_is_key(bd, pin, line)):
            a, b, absolute = pin
            an = pname(bd, a, solver=line.solver)
            if absolute:
                return f"Pin: {an} is pinned to the king, so it cannot move."
            bn = pname(bd, b, solver=line.solver)
            return f"Pin: if {an} moves, {bn} behind it is lost."
    return None


def t_skewer(line):
    caps = {s for s, _t, _i in line.captured_squares()}
    for bd in (line.after,):
        for ssq in chess.SquareSet(bd.occupied_co[line.solver]):
            sp = bd.piece_at(ssq)
            if sp.piece_type not in SLIDERS:
                continue
            for d in _dirs(sp.piece_type):
                r = _ray(bd, ssq, d)
                if len(r) >= 2 and r[0][1].color == line.enemy and r[1][1].color == line.enemy:
                    a, b = r[0], r[1]
                    if (a[1].piece_type == chess.KING or VAL[a[1].piece_type] > VAL[b[1].piece_type]) and b[1].piece_type != chess.KING \
                            and b[0] in caps:
                        me = f"your {NAME[sp.piece_type]} on {chess.square_name(ssq)}"
                        if a[1].piece_type == chess.KING:
                            return f"Skewer: {me} checks the king, and when it moves you take {pname(bd, b[0], solver=line.solver)} behind it."
                        return f"Skewer: {me} attacks {pname(bd, a[0], solver=line.solver)}, and when it moves you take {pname(bd, b[0], solver=line.solver)} behind it."
    return None


def t_discovered(line):
    mv = line.key
    bd0, bd1 = line.before, line.after
    mover = bd0.piece_at(mv.from_square)
    for wsq in chess.SquareSet(bd1.occupied_co[line.solver]):
        if wsq == mv.to_square:
            continue
        wp = bd1.piece_at(wsq)
        if wp.piece_type not in SLIDERS:
            continue
        new = set(attacked_enemy(bd1, wsq, line.enemy)) - set(attacked_enemy(bd0, wsq, line.enemy))
        new = {t for t in new if t != mv.to_square}
        tg = []
        for t in new:
            p = bd1.piece_at(t)
            if p.piece_type == chess.KING:
                tg.append((100, t))
            elif VAL[p.piece_type] >= 3 or not bd1.is_attacked_by(line.enemy, t):
                tg.append((VAL[p.piece_type], t))
        if tg:
            tg.sort(reverse=True)
            v, t = tg[0]
            me = f"your {NAME[mover.piece_type]}"
            w = f"your {NAME[wp.piece_type]} on {chess.square_name(wsq)}"
            if v == 100:
                return f"Discovered check: moving {me} uncovers {w}, which now checks the king."
            return f"Discovered attack: moving {me} uncovers {w}, which now attacks {pname(bd1, t, solver=line.solver)}."
    return None


def t_removal(line):
    caps = line.captured_squares()
    if not caps or caps[0][2] != 0:
        return None
    sq, ptype, _i = caps[0]
    bd0 = line.before
    victim = bd0.piece_at(sq)
    later = {s for s, _t, i in caps[1:]}
    # pieces the captured piece was guarding that the solver then wins
    for t in chess.SquareSet(bd0.attacks_mask(sq) & bd0.occupied_co[line.enemy]):
        if t in later:
            return (f"Remove the defender: taking the {NAME[victim.piece_type]} on {chess.square_name(sq)} "
                    f"leaves {pname(bd0, t, solver=line.solver)} without its protection.")
    return None


def t_trapped(line):
    bd1 = line.after
    caps = line.captured_squares()
    for t in chess.SquareSet(bd1.occupied_co[line.enemy]):
        p = bd1.piece_at(t)
        if p.piece_type in (chess.KING, chess.PAWN) or not bd1.is_attacked_by(line.solver, t):
            continue
        probe = bd1.copy()
        probe.turn = line.enemy
        safe = False
        for m in probe.legal_moves:
            if m.from_square != t:
                continue
            probe.push(m)
            attacked = probe.is_attacked_by(line.solver, m.to_square)
            probe.pop()
            if not attacked:
                safe = True
                break
        if not safe and any(ty == p.piece_type for _s, ty, _i in caps):
            return f"Trapped piece: {pname(bd1, t, solver=line.solver)} has no safe square left, so you win it."
    return None


def t_intermezzo(line):
    mv = line.key
    # the set-up move of the opponent is not part of this line; use the capture history: a recapture on a square was available
    return None


def t_intermezzo_ctx(line, prev_move, prev_board):
    """prev_board: position before the opponent's set-up move."""
    if prev_move is None or not prev_board.is_capture(prev_move):
        return None
    sq = prev_move.to_square
    if line.key.to_square == sq:
        return None
    if not any(m.to_square == sq for m in line.before.legal_moves):
        return None
    pc = line.before.piece_at(line.key.from_square)
    chk = " with check" if line.after.is_check() else ""
    return (f"In-between move: instead of taking back on {chess.square_name(sq)} at once, "
            f"your {NAME[pc.piece_type]} goes to {chess.square_name(line.key.to_square)}{chk} first.")


def t_deflection(line):
    # line: s1, o1, s2 ...   the opponent's reply o1 takes (or must answer); the piece that moved no longer guards s2's target
    if len(line.moves) < 3:
        return None
    o1, s2 = line.moves[1], line.moves[2]
    bd1 = line.boards[1]
    mover = bd1.piece_at(o1.from_square)
    if mover is None or mover.piece_type == chess.KING:
        return None
    guarded = bd1.attacks_mask(o1.from_square)
    if not (guarded & chess.BB_SQUARES[s2.to_square]):
        return None
    if line.boards[2].is_attacked_by(line.enemy, s2.to_square) and line.boards[2].piece_at(s2.to_square) is None:
        return None
    tgt = line.boards[2].piece_at(s2.to_square)
    if o1.to_square != line.key.to_square and not line.boards[1].is_capture(o1):
        return None
    dest = chess.square_name(s2.to_square)
    pn = f"the {NAME[mover.piece_type]} on {chess.square_name(o1.from_square)}"
    if tgt is not None:
        return f"Lure away: {pn} is drawn off, and it no longer guards {dest}, where you then take."
    return f"Lure away: {pn} is drawn off, and it no longer guards {dest}."


def t_hanging(line):
    caps = line.captured_squares()
    if not caps or caps[0][2] != 0:
        return None
    sq, ptype, _i = caps[0]
    victim = line.before.piece_at(sq)
    taker = line.before.piece_at(line.key.from_square)
    protected = line.after.is_attacked_by(line.enemy, sq)
    vn = f"the {NAME[victim.piece_type]} on {chess.square_name(sq)}"
    if not protected:
        return f"Free piece: {vn} has no defender, so you take it for nothing."
    if VAL[victim.piece_type] > VAL[taker.piece_type]:
        return f"Worth more: {vn} is worth more than your {NAME[taker.piece_type]}, so taking it pays even if it is defended."
    return None


def t_promotion(line):
    ps = promo_sentence(line)
    if ps:
        return "Promotion: " + ps[:1].lower() + ps[1:]
    return None


def t_defend(line):
    bd0 = line.before
    # what would the opponent do if it were their move?
    if bd0.is_check():
        return "Defence: you are in check, and this is the only reply that keeps the position safe."
    probe = bd0.copy()
    probe.turn = line.enemy
    probe.ep_square = None
    for m in probe.legal_moves:
        probe.push(m)
        if probe.is_checkmate():
            sq = chess.square_name(m.to_square)
            probe.pop()
            return f"Defence: the other side threatens mate on {sq}, and this move stops it."
        probe.pop()
    best = None
    for m in probe.legal_moves:
        if probe.is_capture(m):
            v = probe.piece_at(m.to_square)
            if v is None:
                continue
            a = probe.piece_at(m.from_square)
            if VAL[v.piece_type] > VAL[a.piece_type] or not probe.is_attacked_by(line.solver, m.to_square):
                if best is None or VAL[v.piece_type] > best[0]:
                    best = (VAL[v.piece_type], v, m.to_square)
    if best:
        return f"Defence: the other side threatens to take your {NAME[best[1].piece_type]} on {chess.square_name(best[2])}, and this move deals with it."
    return None


def t_endgame(line, kind):
    ps = promo_sentence(line)
    if ps:
        return f"{kind}: " + ps[:1].lower() + ps[1:]
    return None


ENDGAME_LABEL = {"pawnEndgame": "Pawn endgame", "rookEndgame": "Rook endgame"}
TEMPLATES = {
    "backRankMate": t_backrank, "mateIn1": t_mate, "mateIn2": t_mate, "doubleCheck": t_double_check, "fork": t_fork,
    "skewer": t_skewer, "pin": t_pin, "discoveredAttack": t_discovered, "capturingDefender": t_removal,
    "trappedPiece": t_trapped, "deflection": t_deflection, "attraction": t_deflection, "hangingPiece": t_hanging,
    "promotion": t_promotion, "advancedPawn": t_promotion, "defensiveMove": t_defend,
    "pawnEndgame": lambda l: t_endgame(l, "Pawn endgame"), "rookEndgame": lambda l: t_endgame(l, "Rook endgame"),
}


def fallback(line, label=None):
    pc = line.key_piece()
    mv = line.key
    sq = chess.square_name(mv.to_square)
    if line.before.is_capture(mv) and line.before.piece_at(mv.to_square):
        v = line.before.piece_at(mv.to_square)
        base = f"the key is taking the {NAME[v.piece_type]} on {sq} with your {NAME[pc.piece_type]}"
    else:
        base = f"the key is moving your {NAME[pc.piece_type]} to {sq}"
    tail = payoff(line) or promo_sentence(line)
    head = f"{label}: {base}." if label else cap_first(base) + "."
    return f"{head} {tail}" if tail else f"{head} It is the only good move here."


def explain_line(fen, ucis, themes=(), group=None, prev=None):
    """prev = (board_before_setup_move, setup_move) for the in-between-move template."""
    line = Line(fen, ucis)
    tags = list(themes)
    order = []
    if group:
        order += [t for t in GROUP_TAGS.get(group, []) if t in tags or True]
    order += [t for t in TAG_ORDER if t in tags and t not in order]
    theme_s = None
    for tag in order:
        if tag == "intermezzo":
            s = t_intermezzo_ctx(line, prev[1], prev[0]) if prev else None
        elif tag == "mateIn2" and line.mate() and False:
            s = None
        else:
            fn = TEMPLATES.get(tag)
            s = fn(line) if fn else None
        if s:
            theme_s = s
            break
    if theme_s is None and line.mate():
        theme_s = t_mate(line)
    if theme_s is None:
        return fallback(line, ENDGAME_LABEL.get(group))
    pay = payoff(line)
    if pay and (line.mate() and "heckmate" in theme_s or line.mate() and "mate" in theme_s.lower()):
        pay = None
    if pay and pay.startswith("You win") and theme_s.startswith(("Free piece",)) and False:
        pay = None
    text = theme_s + (" " + pay if pay else "")
    return text


def explain(fen, moves, themes=(), group=None):
    b = chess.Board(fen)
    setup = chess.Move.from_uci(moves[0])
    prev = (b.copy(), setup)
    b.push(setup)
    return explain_line(b.fen(), moves[1:], themes, group, prev=prev)


# ---------------------------------------------------------------- lint (PZ7 = BLUEPRINT 2.6 X1-X5 on generated text)
SAN_RE = re.compile(r"(?<![A-Za-z])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?|[a-h]x[a-h][1-8][+#]?|O-O(?:-O)?[+#]?)(?![A-Za-z0-9])")
NUM_EVAL = re.compile(r"(?<![\w.])[+\-−]\d+\.\d+")
JARGON = ["zugzwang", "opposition", "tempo", "zwischenzug", "intermezzo", "deflection", "decoy", "battery", "outflank",
          "outflanking", "key squares", "cut-off", "prophylaxis", "desperado", "overloaded", "x-ray", "luft", "fianchetto",
          "the exchange", "fork", "skewer", "discovered"]
BANNED = ("obviously", "simply", "of course", "centipawn")
AMERICAN = ["color", "colors", "center", "defense", "analyze", "favorite", "realize", "gray", "meter", "recognize", "organize"]
SQ_CLAIM = re.compile(r"\b(?:the|your)\s+(king|queen|rook|bishop|knight|pawn)\s+on\s+([a-h][1-8])\b", re.I)
CLAIM = re.compile(r"\bwins?\s+(?:the|a|an)\s+(queen|rook|piece|pawn|exchange|bishop|knight)\b", re.I)


def lint_why(text, fen=None, ucis=None):
    """fen/ucis (solver to move) enable the fact checks (squares hold the named piece, wins/mate claims hold)."""
    bad = []
    if not text or not text.strip():
        return ["empty"]
    words = len(text.split())
    if words > 45:
        bad.append(f"X1 {words} words")
    for s in [x for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]:
        if len(s.split()) > 25:
            bad.append(f"X1 sentence of {len(s.split())} words")
    low = text.lower()
    if NUM_EVAL.search(text):
        bad.append("X5 engine number")
    for w in BANNED:
        if re.search(r"\b" + w + r"\b", low):
            bad.append(f"X5 banned word {w}")
    for w in AMERICAN:
        if re.search(r"\b" + w + r"\b", low):
            bad.append(f"X5 american spelling {w}")
    # Lichess/our jargon: only the "Fork:" style labels are explained in the same sentence, so those are allowed at the start
    plain_low = re.sub(r"^(fork|pin|skewer|discovered attack|discovered check|double check):", "", low)
    for t in ("zugzwang", "opposition", "tempo", "zwischenzug", "intermezzo", "deflection", "decoy", "battery", "outflank",
              "prophylaxis", "desperado", "overloaded", "x-ray", "luft", "fianchetto", "the exchange"):
        if re.search(r"\b" + re.escape(t) + r"\b", plain_low):
            bad.append(f"X2 jargon {t}")
    if SAN_RE.search(text):
        bad.append("X3 move written in notation")
    if fen and ucis:
        try:
            line = Line(fen, ucis)
        except Exception as e:
            return bad + [f"line illegal: {e}"]
        for m in SQ_CLAIM.finditer(text):
            pt, sq = m.group(1).lower(), chess.parse_square(m.group(2))
            ok = False
            for bd in line.boards:
                p = bd.piece_at(sq)
                if p and NAME[p.piece_type] == pt:
                    ok = True
                    break
            if not ok:
                bad.append(f"X3 no {pt} on {m.group(2)}")
        gains, losses, promos = line.captures()
        names = {NAME[t] for t in gains} | {"piece"} if gains else set()
        for m in CLAIM.finditer(text.replace("You win", "wins")):
            kind = m.group(1).lower()
            if kind == "piece":
                if not gains:
                    bad.append("X4 claims a piece, no capture")
            elif kind == "exchange":
                bad.append("X4 exchange")
            elif kind not in names:
                bad.append(f"X4 claims {kind}, never captured")
        if re.search(r"checkmate|mates? on|mate in|ends in checkmate", low) and not line.mate() and not low.startswith("defence"):
            bad.append("X4 claims mate, line is no mate")
        ms = material_sentence(line)
        if "You win" in text and not ms:
            bad.append("X4 claims a win of material, none in line")
    return bad


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("fen")
    ap.add_argument("moves", help="space separated uci, Lichess convention (first = opponent set-up)")
    ap.add_argument("--themes", default="")
    ap.add_argument("--group")
    a = ap.parse_args()
    mv = a.moves.split()
    w = explain(a.fen, mv, a.themes.split(), a.group)
    b = chess.Board(a.fen)
    b.push_uci(mv[0])
    print(w)
    print("lint:", lint_why(w, b.fen(), mv[1:]) or "ok")
