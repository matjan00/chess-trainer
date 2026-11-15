"""Own-games pipeline of Train 2 (BLUEPRINT 2.4, 3.4, 4, 6):  data/analysis.json  ->  data/mine2.json

    build_mine2.py [--analysis data/analysis.json] [--out data/mine2.json] [--max-minutes 45] [--workers 4]
                   [--no-engine] [--report FILE]

Cards (fix / pun / thr / tq), judgements (chk/), play-outs (cv/, eo/) and the statistics of section 6 of the blueprint.
Everything an engine has to say is searched with t2common.bulk() (watchdog, time caps, JSONL cache
train2/cache/mine_evals.jsonl): a position that is already in the cache is never searched again, so a nightly run only
searches the positions of new games, and a run that is stopped (--max-minutes, usage limit, crash) continues where it stopped.
The stored analysis (data/analysis.json: eval, best move, loss, tags, refutation, clock of every ply) is reused for choosing
candidates, tags, play-outs that need no engine, and all the statistics.

Rules applied (BLUEPRINT 2.4), all on a fresh search of depth 18 / multipv 4 unless said otherwise:
  M1 fix      his move lost >= 10: ok = moves within 3 of the best, <= 2 of them, next move >= 8 worse, best >= 30,
              4th best < 90, and the move he played is not in ok.
  M2 punish   position after an opponent blunder: best >= 75, <= 2 ok moves, gap to the rest >= 10.
  M3 decoy    a quiet move that lost < 2, not check, best minus 3rd best <= 6 (depth 16, multipv 3).
  M4 threat   the position before one of his blunders (his move, not in check, M1 passes): after a null move the opponent's
              best move gains >= 15 on the current evaluation and beats his second best by >= 8.
  M5 tq       he is clearly better (best >= 80, M1 rule), kind finish / defend / take / trade as build_middlegame.py.
  M6 play-outs  convert: first position with >= 85 for him (searched), >= 10 men, not check; own endings as build_endgame.py.
  M7          one item per position and type; the newest game wins.
  M8          link, opponent, date, his move, the refutation line and a generated explanation (explain.py) on every card.
Exit code 0 also when the time budget stopped the search (the output then holds what is finished and says so: "left").
"""
import argparse, json, os, statistics, sys, time, zlib, datetime as dt
from collections import Counter, defaultdict
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import chess
import t2common as tc
from t2common import win_pct, pos_key
import explain as ex

CACHE = tc.CACHE_DIR / "mine_evals.jsonl"
MAIN = dict(depth=18, time_cap=8.0, multipv=4)       # M1 M2 M4 M5 M6
NULL = dict(depth=16, time_cap=6.0, multipv=2)       # threats (M4) and the "defend" test of M5
QUIET = dict(depth=16, time_cap=4.0, multipv=3)      # decoys (M3)
VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
NAME = {chess.PAWN: "pawn", chess.KNIGHT: "knight", chess.BISHOP: "bishop", chess.ROOK: "rook", chess.QUEEN: "queen"}

# his "why" tags -> theme group of puzzles2 (BLUEPRINT 4)
TAG_GROUP = {"hung piece": "hanging", "missed capture": "hanging", "fork": "fork", "lost material": "removal",
             "missed mate": "mate1", "allowed mate": "backrank", "walked into check": "defend", "threw away win": None}



# ------------------------------------------------------------------ small helpers
def gid_of(url):
    return url.rstrip("/").rsplit("/", 1)[-1]


def move_no(i):
    return f'{i // 2 + 1}{"." if i % 2 == 0 else "..."}'


def my_win(e, me_white):
    """Win % for him from a stored white-POV eval {cp} / {m}.  None when the game was over (m == 0)."""
    if "m" in e:
        if e["m"] == 0:
            return None
        w = 100.0 if e["m"] > 0 else 0.0
    else:
        w = win_pct(e["cp"])
    return w if me_white else 100 - w


def crc(*a):
    return zlib.crc32("|".join(map(str, a)).encode())


def wlist(res):
    """Search lines sorted best first with their win % for the side to move."""
    lines = sorted((x for x in res if x.get("m")), key=lambda x: -x["cp"])
    return lines, [win_pct(x["cp"]) for x in lines]


def good_moves(res, min_best, gap, max_ok=2, ok_within=3.0, w4_below=90.0, need_rest=True):
    """The M1 / M2 / M5 rule.  -> (lines, W, ok_count) or (None, reason)."""
    if not isinstance(res, list):
        return None, "no result"
    lines, W = wlist(res)
    if len(lines) < 2:
        return None, "one legal move"
    best = W[0]
    k = sum(1 for w in W if best - w <= ok_within)
    if best < min_best:
        return None, "best too low"
    if k > max_ok:
        return None, "many ok moves"
    if k >= len(W):
        return None, "no contrast"
    if best - W[k] < gap:
        return None, "gap too small"
    if w4_below and len(W) >= 4 and W[3] >= w4_below:
        return None, "everything wins"
    return (lines, W, k), None


def key_fact(fen, uci):
    """One plain fact about the key move, or '': moves the attacked piece away / defends the attacked piece / attacks a piece."""
    try:
        b = chess.Board(fen)
        mv = chess.Move.from_uci(uci)
        me, opp = b.turn, not b.turn
        mover = b.piece_at(mv.from_square)

        def threatened(bd):
            out = {}
            for sq in chess.SquareSet(bd.occupied_co[me]):
                pc = bd.piece_at(sq)
                if pc.piece_type == chess.KING:
                    continue
                atk = bd.attackers(opp, sq)
                if not atk:
                    continue
                low = min(VAL[bd.piece_at(a).piece_type] for a in atk if bd.piece_at(a).piece_type != chess.KING)                     if any(bd.piece_at(a).piece_type != chess.KING for a in atk) else 99
                if not bd.is_attacked_by(me, sq) or low < VAL[pc.piece_type]:
                    out[sq] = pc
            return out
        before = threatened(b)
        a = b.copy()
        a.push(mv)
        a.turn = me                                   # look at the position as if it were still our move
        if mv.from_square in before and mover.piece_type != chess.KING and not b.is_capture(mv):
            return f"moves your {ex.NAME[mover.piece_type]} away from the attack"
        after = threatened(a)
        saved = [sq for sq in before if sq not in after and sq != mv.from_square]
        if saved:
            sq = max(saved, key=lambda q: VAL[before[q].piece_type])
            return f"defends your {ex.NAME[before[sq].piece_type]} on {chess.square_name(sq)}"
        if mover.piece_type != chess.KING:
            tgt = []
            for sq in a.attacks(mv.to_square):
                pc = a.piece_at(sq)
                if pc and pc.color == opp and pc.piece_type != chess.KING and                         (VAL[pc.piece_type] > VAL[mover.piece_type] or not a.is_attacked_by(opp, sq)):
                    tgt.append((VAL[pc.piece_type], sq, pc))
            if tgt:
                _, sq, pc = max(tgt, key=lambda t: t[0])
                return f"attacks the {ex.NAME[pc.piece_type]} on {chess.square_name(sq)}"
    except Exception:
        pass
    return ""


def fix_wording(text, n_ok, fen=None, uci=None):
    """explain.py's fallback says 'the only good move' - it says nothing; say what the key move does, or drop it."""
    fact = key_fact(fen, uci) if fen and uci else ""
    for old in ("It is the only good move here.", "It is one of the two good moves here."):
        if old in text:
            if fact:
                text = text.replace(old, f"It {fact}.")
            elif n_ok > 1:
                text = text.replace(old, "It is one of the two good moves here.")
            else:
                text = text.replace(old, "").strip()
    return text


def san_line(board, ucis):
    b = board.copy()
    out = []
    for u in ucis:
        mv = chess.Move.from_uci(u)
        if mv not in b.legal_moves:
            break
        out.append(mv)
        b.push(mv)
    return board.variation_san(out) if out else ""


def line_prefix(ucis, board):
    """A short quiet line for the explanation: up to the mate, else the first 4 plies (ends after the opponent's reply)."""
    b = board.copy()
    seq = []
    for u in ucis:
        mv = chess.Move.from_uci(u)
        if mv not in b.legal_moves:
            break
        b.push(mv)
        seq.append(u)
        if b.is_checkmate():
            return seq
    if len(seq) > 4:
        seq = seq[:4]
    return seq


def explain_text(fen, ucis, group=None):
    """Generated 'why' (explain.py), linted; falls back to the plain sentence."""
    board = chess.Board(fen)
    seq = line_prefix(ucis, board)
    if not seq:
        return ""
    try:
        t = ex.explain_line(fen, seq, (), group)
        if not ex.lint_why(t, fen, seq):
            return t
        t = ex.fallback(ex.Line(fen, seq))
        if not ex.lint_why(t, fen, seq):
            return t
    except Exception:
        pass
    mv = chess.Move.from_uci(seq[0])
    return f"The best move was {board.san(mv)}."


def material_after(board, ucis, who):
    """(net material change for `who` along the line, mate?)  The line is played in full; pieces counted P1 N3 B3 R5 Q9."""
    b = board.copy()
    tot = 0
    for u in ucis:
        mv = chess.Move.from_uci(u)
        if mv not in b.legal_moves:
            break
        mover = b.turn
        if b.is_en_passant(mv):
            v = 1
        else:
            p = b.piece_at(mv.to_square)
            v = VAL[p.piece_type] if p else 0
        if mv.promotion:
            v += VAL[mv.promotion] - 1
        tot += v if mover == who else -v
        b.push(mv)
    return tot, b.is_checkmate()


def worth(n):
    """A material number as words (only values that are exactly a piece are named)."""
    return {1: "a pawn", 2: "two pawns", 3: "a piece", 5: "a rook", 9: "a queen"}.get(n)


def reply_sentence(board_after, ucis, me, loss=None, w_before=None):
    """What his opponent's best reply costs him, as a phrase: 'answers Qe4 and wins a piece'.  Facts from the line."""
    if not ucis:
        return ""
    b = board_after
    try:
        first = b.san(chess.Move.from_uci(ucis[0]))
    except Exception:
        return ""
    seq = line_prefix(ucis, b)
    net, mate = material_after(b, seq, not me)
    if mate:
        return f"answers {first} and it ends in checkmate"
    w = worth(net)
    if w and net >= 1:
        return f"answers {first} and wins {w}"
    if loss is None:
        return f"answers {first} and you are worse"
    after = (w_before - loss) if w_before is not None else None
    if loss < 20:
        tail = "you have lost a little"
    elif after is not None and after < 35:
        tail = "you are losing"
    elif w_before is not None and w_before >= 55 and after < 50:
        tail = "you have lost your advantage"
    else:
        tail = "you have lost a good deal"
    return f"answers {first} and {tail}"


# ------------------------------------------------------------------ candidates from the stored analysis
def scan(games):
    """Replay every game once and list what has to be searched / built.  No engine."""
    C = defaultdict(list)          # kind -> list of dicts
    for g in games:
        me_white = g["color"] == "white"
        me = chess.WHITE if me_white else chess.BLACK
        gid = gid_of(g["url"])
        plies = g["plies"]
        b = chess.Board()
        first_conv = []
        eo_done = False
        for i, p in enumerate(plies):
            mine = (i % 2 == 0) == me_white
            mv = b.parse_san(p["san"])
            base = {"gid": gid, "i": i, "url": g["url"], "opp": g.get("opp", ""), "end": g["end"], "ph": p["ph"],
                    "mv": mv.uci(), "san": p["san"], "moveNo": move_no(i), "result": g["result"], "me": me, "lastmv": None}
            fen = b.fen()
            w = my_win(p["e"], me_white)
            lab = p.get("lab")
            # --- fix / thr (his mistakes)
            if mine and lab and p.get("best") != p["san"] and p["loss"] >= 10 and p.get("why") is not None:
                C["fix"].append({**base, "fen": fen, "loss": p["loss"], "w": w, "tags": p.get("why", []), "refute": p.get("refute", ""),
                                 "pv": p.get("pv", ""), "lab": lab,
                                 "prev": (b.peek().uci() if b.move_stack else None)})
            # --- his blunder judgement (no search needed: stored analysis)
            if mine and lab == "blunder" and p.get("refute") and i >= 8 and (w is not None and w >= 30) and not b.is_check() or \
                    (mine and lab == "blunder" and p.get("refute") and i >= 8 and w is not None and w >= 30):
                C["chk_blunder"].append({**base, "fen": fen, "loss": p["loss"], "w": w, "refute": p["refute"], "tags": p.get("why", [])})
            # --- thr: before his blunder, he is not in check
            if mine and lab == "blunder" and p.get("best") != p["san"] and p.get("why") is not None and not b.is_check() and i >= 2:
                nb = b.copy()
                nb.push(chess.Move.null())
                C["thr"].append({**base, "fen": fen, "nullfen": nb.fen(), "tags": p.get("why", []), "refute": p.get("refute", ""),
                                 "prev": (b.peek().uci() if b.move_stack else None), "loss": p["loss"]})
            # --- pun: after an opponent blunder
            if not mine and lab == "blunder" and i + 1 < len(plies):
                nb = b.copy()
                nb.push(mv)
                nxt = plies[i + 1]
                C["pun"].append({**base, "fen": nb.fen(), "oppsan": p["san"], "played": nxt["san"],
                                 "missed": nxt["loss"] >= 10, "moveNo": move_no(i + 1), "lastmv": mv.uci()})
            # --- tq: he is clearly better
            if mine and i >= 12 and w is not None and w >= 70 and not b.is_check():
                C["tq"].append({**base, "fen": fen, "playedloss": p["loss"], "w": w,
                                "prev": (b.peek().uci() if b.move_stack else None)})
            # --- decoys: quiet moves that cost < 2
            if i >= 8 and p["loss"] < 2 and not lab and not b.is_check() and w is not None and 20 <= w <= 95:
                C["decoy_me" if mine else "decoy_opp"].append({**base, "fen": fen})
            # --- convert candidates (searched later)
            if mine and w is not None and w >= 85 and i >= 10 and not b.is_check() and chess.popcount(b.occupied) >= 10 \
                    and len(first_conv) < 2:
                first_conv.append({**base, "fen": fen})
            # --- own endgame (no engine, as build_endgame.py)
            if mine and not eo_done and p["ph"] == "endgame" and not b.is_check() and p["e"].get("m", 1) != 0:
                eo_done = True
                if w is not None:
                    goal = "win" if 80 <= w <= 99 else "draw" if 35 <= w <= 65 and g["result"] == "loss" else None
                    if goal:
                        C["eo"].append({**base, "fen": fen, "goal": goal})
            b.push(mv)
        if first_conv:
            C["cv"].append(first_conv)       # list of candidates of one game
    return C


def per_game_pick(items, n, kind):
    """At most n per game, chosen by a hash of (game, ply, kind), so the choice never changes when other games arrive."""
    by = defaultdict(list)
    for x in items:
        by[x["gid"]].append(x)
    out = []
    for gid, xs in by.items():
        xs.sort(key=lambda x: crc(gid, x["i"], kind))
        out += xs[:n]
    return out


# ------------------------------------------------------------------ searching
class Budget:
    def __init__(self, minutes):
        self.end = time.time() + minutes * 60
        self.left_total = 0

    def minutes_left(self):
        return max(0.0, (self.end - time.time()) / 60)


def run_bulk(fens, params, budget, workers, no_engine, log):
    fens = list(dict.fromkeys(fens))
    if no_engine:
        cache = tc.JsonlCache(CACHE)
        res = {f: cache.find(f, params["depth"], params["multipv"]) for f in fens}
        return {f: r for f, r in res.items() if r is not None}, 0
    if not fens:
        return {}, 0
    ml = budget.minutes_left()
    if ml <= 0:
        cache = tc.JsonlCache(CACHE)
        res = {f: cache.find(f, params["depth"], params["multipv"]) for f in fens}
        res = {f: r for f, r in res.items() if r is not None}
        return res, len(fens) - len(res)
    r = tc.bulk(fens, CACHE, depth=params["depth"], time_cap=params["time_cap"], multipv=params["multipv"],
                workers=workers, max_minutes=ml, log=log)
    log(f"bulk {params}: {len(fens)} positions, {r['cached']} cached, {r['searched']} searched, "
        f"{r['timeouts']} timeouts, {r['left']} left")
    return r["results"], r["left"]


# ------------------------------------------------------------------ build
def build(args):
    t0 = time.time()
    log = lambda s: print(s, file=sys.stderr, flush=True)
    games = json.loads(Path(args.analysis).read_text(encoding="utf-8"))
    games.sort(key=lambda g: g["end"])
    C = scan(games)
    log(f"scan: {len(games)} games in {time.time() - t0:.1f}s")
    drops = defaultdict(Counter)

    fix_c = C["fix"]
    pun_c = C["pun"]
    thr_c = C["thr"]
    tq_c = per_game_pick(C["tq"], 5, "tq")
    dme = per_game_pick(C["decoy_me"], 2, "dme")
    dopp = per_game_pick(C["decoy_opp"], 2, "dopp")
    cv_games = C["cv"]

    # ---- main search, newest games first within each kind
    newest = lambda xs: sorted(xs, key=lambda x: -x["end"])
    main = [x["fen"] for x in newest(fix_c)] + [x["fen"] for x in newest(pun_c)]
    for cands in sorted(cv_games, key=lambda c: -c[0]["end"]):
        main += [c["fen"] for c in cands]
    main += [x["fen"] for x in newest(tq_c)]
    budget = Budget(args.max_minutes)
    left = 0
    R, l1 = run_bulk(main, MAIN, budget, args.workers, args.no_engine, log)
    left += l1

    # ---- fix (M1)
    cards, seen = {}, {}

    def keep(card, fen, g_end):
        """M7: one item per position and type, the newest game wins."""
        k = (card["type"], pos_key(fen))
        old = seen.get(k)
        if old and old["end"] >= g_end:
            drops[card["type"]]["duplicate position"] += 1
            return False
        if old:
            cards.pop(old["id"], None)
            drops[card["type"]]["duplicate position"] += 1
        seen[k] = card
        cards[card["id"]] = card
        return True

    def group_of(tags):
        return next((TAG_GROUP[t] for t in tags if TAG_GROUP.get(t)), None)

    fixres = {}
    for x in fix_c:
        res = R.get(x["fen"])
        if res is None:
            drops["fix"]["not searched yet"] += 1
            continue
        got, why = good_moves(res, 30, 8)
        if not got:
            drops["fix"][why] += 1
            continue
        lines, W, k = got
        b = chess.Board(x["fen"])
        oks = [l["m"] for l in lines[:k]]
        if x["mv"] in oks:
            drops["fix"]["his move is ok now"] += 1
            continue
        fixres[(x["gid"], x["i"])] = (lines, W, k)
        best = lines[0]
        text = explain_text(x["fen"], best["pv"], None)
        rs = reply_sentence_for_move(b, x["mv"], x["refute"], b.turn, x["loss"], x.get("w"))
        text = fix_wording(text, len(oks), x["fen"], best["m"])
        why_t = f"{text} You played {x['san']}." + (f" Your opponent {rs}." if rs else "")
        card = {"id": f"fix/{x['gid']}-{x['i']}", "type": "fix", "fen": x["fen"], "side": "white" if b.turn else "black",
                "last": x["prev"], "sol": [best["m"]], "ok": oks, "played": x["san"], "refute": x["refute"],
                "why": why_t, "tags": x["tags"], "group": group_of(x["tags"]), "ph": x["ph"], "moveNo": x["moveNo"],
                "url": x["url"], "opp": x["opp"], "end": x["end"], "pv": san_line(b, best["pv"][:6])}
        keep(card, x["fen"], x["end"])

    # ---- pun (M2)
    for x in pun_c:
        res = R.get(x["fen"])
        if res is None:
            drops["pun"]["not searched yet"] += 1
            continue
        got, why = good_moves(res, 75, 10, w4_below=0)
        if not got:
            drops["pun"][why] += 1
            continue
        lines, W, k = got
        b = chess.Board(x["fen"])
        best = lines[0]
        text = fix_wording(explain_text(x["fen"], best["pv"], None), k, x["fen"], best["m"])
        card = {"id": f"pun/{x['gid']}-{x['i']}", "type": "pun", "fen": x["fen"], "side": "white" if b.turn else "black",
                "last": x["lastmv"], "sol": [best["m"]], "ok": [l["m"] for l in lines[:k]], "played": x["played"],
                "refute": san_line(b, best["pv"][:6]), "why": f"Your opponent just blundered with {x['oppsan']}. {text}",
                "tags": [], "group": None, "ph": x["ph"], "moveNo": x["moveNo"], "url": x["url"], "opp": x["opp"],
                "end": x["end"], "missed": x["missed"]}
        keep(card, x["fen"], x["end"])

    # ---- cv (M6): the first candidate of a game that the search confirms
    plays = {}
    for cands in cv_games:
        for c in cands:
            res = R.get(c["fen"])
            if not isinstance(res, list):
                continue
            lines, W = wlist(res)
            if not W:
                continue
            b = chess.Board(c["fen"])
            if (W[0] if b.turn == c["me"] else 100 - W[0]) >= 85:
                plays[f"cv/{c['gid']}-{c['i']}"] = {"id": f"cv/{c['gid']}-{c['i']}", "fen": c["fen"],
                                                      "side": "white" if c["me"] else "black", "goal": "win",
                                                      "result": c["result"], "url": c["url"], "opp": c["opp"], "end": c["end"],
                                                      "moveNo": c["moveNo"]}
                break
            drops["cv"]["search below 85"] += 1
    for x in C["eo"]:
        plays[f"eo/{x['gid']}-{x['i']}"] = {"id": f"eo/{x['gid']}-{x['i']}", "fen": x["fen"], "side": "white" if x["me"] else "black",
                                            "goal": x["goal"], "result": x["result"], "url": x["url"], "opp": x["opp"],
                                            "end": x["end"], "moveNo": x["moveNo"]}

    # ---- tq (M5) needs the null-move search for "defend"; thr (M4) needs it as well
    tq_pass = []
    for x in tq_c:
        res = R.get(x["fen"])
        if res is None:
            drops["tq"]["not searched yet"] += 1
            continue
        got, why = good_moves(res, 80, 8, w4_below=0)
        if not got:
            drops["tq"][why] += 1
            continue
        tq_pass.append((x, got))
    thr_pass = []
    for x in thr_c:
        if (x["gid"], x["i"]) in fixres:
            thr_pass.append(x)
        else:
            drops["thr"]["fix rule fails or not searched"] += 1
    nulls = [x["nullfen"] for x in newest(thr_pass)]
    for x, got in tq_pass:
        b = chess.Board(x["fen"])
        mv = chess.Move.from_uci(got[0][0]["m"])
        if not (b.is_capture(mv)) and not (got[0][0]["cp"] >= 9000):
            nb = b.copy()
            nb.push(chess.Move.null())
            x["nullfen"] = nb.fen()
            nulls.append(x["nullfen"])
    RN, l2 = run_bulk(nulls, NULL, budget, args.workers, args.no_engine, log)
    left += l2

    # ---- thr (M4)
    for x in thr_pass:
        lines, W, k = fixres[(x["gid"], x["i"])]
        rn = RN.get(x["nullfen"])
        if not isinstance(rn, list):
            drops["thr"]["null search missing"] += 1
            continue
        nl, nW = wlist(rn)
        if len(nl) < 2:
            drops["thr"]["no second move"] += 1
            continue
        cur_opp = 100 - W[0]
        if nW[0] - cur_opp < 15:
            drops["thr"]["no threat (gain < 15)"] += 1
            continue
        if nW[0] - nW[1] < 8:
            drops["thr"]["threat not unique"] += 1
            continue
        b = chess.Board(x["fen"])
        nb = chess.Board(x["nullfen"])
        threat = nl[0]["m"]
        tmv = chess.Move.from_uci(threat)
        if tmv not in nb.legal_moves:
            drops["thr"]["threat illegal"] += 1
            continue
        tsan = nb.san(tmv)
        seq = line_prefix(nl[0]["pv"], nb)
        net, mate = material_after(nb, seq, nb.turn)
        wins = ", which leads to checkmate" if mate else f", which wins {worth(net)}" if net >= 1 and worth(net) else ""
        oks = [l["m"] for l in lines[:k]]
        best = lines[0]
        bsan = b.san(chess.Move.from_uci(best["m"]))
        why_t = f"Your opponent threatened {tsan}{wins}. Your best answer was {bsan}. You played {x['san']}."
        card = {"id": f"thr/{x['gid']}-{x['i']}", "type": "thr", "fen": x["fen"], "side": "white" if b.turn else "black",
                "last": x["prev"], "sol": [best["m"]], "ok": oks, "threat": threat, "played": x["san"], "refute": x["refute"],
                "why": why_t, "tags": x["tags"], "group": group_of(x["tags"]), "ph": x["ph"], "moveNo": x["moveNo"],
                "url": x["url"], "opp": x["opp"], "end": x["end"]}
        keep(card, x["fen"], x["end"])

    # ---- tq (M5): kinds as build_middlegame.py
    for x, (lines, W, k) in tq_pass:
        b = chess.Board(x["fen"])
        top = lines[0]
        mv = chess.Move.from_uci(top["m"])
        kind = None
        if top["cp"] >= 9000:
            bb = b.copy()
            for u in top["pv"]:
                bb.push_uci(u)
            if bb.is_checkmate() and len(top["pv"]) <= 7:
                kind = "finish"
        if kind is None and x.get("nullfen"):
            rn = RN.get(x["nullfen"])
            if isinstance(rn, list) and rn:
                nl, nW = wlist(rn)
                if nl and top["cp"] + nl[0]["cp"] >= 250:
                    kind = "defend"
        if kind is None and b.is_capture(mv):
            victim = b.piece_at(mv.to_square) or chess.Piece(chess.PAWN, not b.turn)
            mover = b.piece_at(mv.from_square)
            after = b.copy()
            after.push(mv)
            defended = after.is_attacked_by(not b.turn, mv.to_square)
            if not defended:
                kind = "take"
            elif VAL[victim.piece_type] == VAL[mover.piece_type] and victim.piece_type != chess.PAWN:
                kind = "trade"
            elif VAL[victim.piece_type] > VAL[mover.piece_type]:
                kind = "take"
        if kind is None:
            drops["tq"]["no kind"] += 1
            continue
        oks = [l["m"] for l in lines[:k]]
        text = fix_wording(explain_text(x["fen"], top["pv"], None), len(oks), x["fen"], top["m"])
        tail = " You found it." if x["mv"] in oks else f" You played {x['san']}."
        card = {"id": f"tq/{x['gid']}-{x['i']}", "type": "tq", "kind": kind, "fen": x["fen"],
                "side": "white" if b.turn else "black", "last": x["prev"], "sol": [top["m"]], "ok": oks, "played": x["san"],
                "refute": "", "why": text + tail, "tags": [], "group": None, "ph": x["ph"], "moveNo": x["moveNo"],
                "url": x["url"], "opp": x["opp"], "end": x["end"], "playedOk": x["mv"] in oks}
        keep(card, x["fen"], x["end"])

    # ---- judgements (chk/): blunders from the stored analysis, decoys from the M3 search
    judges = {}
    for x in C["chk_blunder"]:
        b = chess.Board(x["fen"])
        mvo = chess.Move.from_uci(x["mv"])
        a = b.copy()
        a.push(mvo)
        rs = reply_sentence_for_move(b, x["mv"], x["refute"], x["me"], x.get("loss"), x.get("w"))
        judges[f"chk/{x['gid']}-{x['i']}"] = {"id": f"chk/{x['gid']}-{x['i']}", "who": "me", "fen": x["fen"], "mv": x["mv"],
                                              "san": x["san"], "verdict": "blunder", "refute": x["refute"],
                                              "why": f"After {x['san']} your opponent " + (f"{rs}." if rs else "has a strong reply."),
                                              "url": x["url"], "opp": x["opp"], "end": x["end"], "tags": x["tags"]}
    dec = newest(dme) + newest(dopp)
    RD, l3 = run_bulk([x["fen"] for x in dec], QUIET, budget, args.workers, args.no_engine, log)
    left += l3
    for x in dec:
        who = "me" if x["me"] == chess.Board(x["fen"]).turn else "opp"
        res = RD.get(x["fen"])
        if not isinstance(res, list):
            drops["chk"]["not searched yet"] += 1
            continue
        lines, W = wlist(res)
        if len(W) < 3:
            drops["chk"]["fewer than 3 moves"] += 1
            continue
        if W[0] - W[2] > 6:
            drops["chk"]["something special to find"] += 1
            continue
        jid = f"chk/{x['gid']}-{x['i']}" + ("" if who == "me" else "o")
        judges[jid] = {"id": jid, "who": who, "fen": x["fen"], "mv": x["mv"], "san": x["san"], "verdict": "safe", "refute": "",
                       "why": "A normal move: nothing hangs and there is no tactic to punish." if who == "opp"
                       else "A normal move: nothing hangs and there is nothing better to find.",
                       "url": x["url"], "opp": x["opp"], "end": x["end"]}

    stats = build_stats(games)
    # R2 (lead review, T8): one card per position ACROSS types too. A threat card, a technique card, a punish card and a
    # fix card on the same position ask the same question; keep the richest (thr > tq > pun > fix) and merge the tags.
    PRIO = {"thr": 0, "tq": 1, "pun": 2, "fix": 3}
    by_pos = {}
    for c in sorted(cards.values(), key=lambda c: (PRIO.get(c["type"], 9), -c["end"], c["id"])):
        k = pos_key(c["fen"])
        first = by_pos.get(k)
        if first is None:
            by_pos[k] = c
            continue
        first["tags"] = list(dict.fromkeys(list(first.get("tags") or []) + list(c.get("tags") or [])))
        if not first.get("group") and c.get("group"):
            first["group"] = c["group"]
        if c.get("missed"):
            first["missed"] = True
        cards.pop(c["id"], None)
        drops[c["type"]]["same position as a richer card"] += 1
    def one_per_pos(items, rank):
        keep_ = {}
        for it in sorted(items.values(), key=rank):
            keep_.setdefault(pos_key(it["fen"]), it)
        return {it["id"]: it for it in keep_.values()}
    # same rule for judgements (a blunder beats a safe move) and play-outs: one item per position, newest game wins
    judges = one_per_pos(judges, lambda j: (j["verdict"] != "blunder", -j["end"], j["id"]))
    plays = one_per_pos(plays, lambda p: (-p["end"], p["id"]))
    out_cards = sorted(cards.values(), key=lambda c: (-c["end"], c["id"]))
    out = {"v": 1, "built": int(time.time()), "cards": out_cards,
           "judges": sorted(judges.values(), key=lambda j: (-j["end"], j["id"])),
           "plays": sorted(plays.values(), key=lambda p: (-p["end"], p["id"])), "stats": stats}
    if left:
        out["left"] = left                 # positions not searched yet (time budget): the next run continues
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)
    counts = Counter(c["type"] for c in out_cards)
    lines = [f"mine2: {len(out_cards)} cards {dict(counts)}; judges {Counter((j['who'], j['verdict']) for j in out['judges'])}; "
             f"plays {Counter(p['id'][:2] for p in out['plays'])}; left {left}; {time.time() - t0:.0f}s"]
    for t, c in sorted(drops.items()):
        lines.append(f"  dropped {t}: " + ", ".join(f"{k} {v}" for k, v in c.most_common()))
    rep = Path(args.report)
    rep.parent.mkdir(parents=True, exist_ok=True)
    rep.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return out


def reply_sentence_for_move(board, mv_uci, refute, me, loss=None, w_before=None):
    """'then Qe4 wins a piece' from the stored refutation line (SAN variation of the opponent's best reply)."""
    try:
        b = board.copy()
        b.push(chess.Move.from_uci(mv_uci))
        toks = [t.split(".")[-1] for t in refute.replace("...", ". ").split() if not t.rstrip(".").isdigit()]
        toks = [t for t in toks if t]
        ucis = []
        bb = b.copy()
        for t in toks[:6]:
            m = bb.parse_san(t)
            ucis.append(m.uci())
            bb.push(m)
        return reply_sentence(b, ucis, me, loss, w_before)
    except Exception:
        return ""


# ------------------------------------------------------------------ statistics (BLUEPRINT 6)
def ending_lessons(b):
    """Which course lessons match the material on this board (kings are always there)."""
    pcs = {c: Counter(p.piece_type for p in (b.piece_at(s) for s in chess.SquareSet(b.occupied_co[c])) if p and p.piece_type != chess.KING)
           for c in (chess.WHITE, chess.BLACK)}
    w, k = pcs[chess.WHITE], pcs[chess.BLACK]
    tw, tk = sum(w.values()), sum(k.values())
    if tw + tk == 0:
        return []
    out = []
    pieces = lambda c: {t: n for t, n in pcs[c].items() if t != chess.PAWN}
    nopieces = not pieces(chess.WHITE) and not pieces(chess.BLACK)
    if nopieces and w[chess.PAWN] + k[chess.PAWN] == 1:
        out += ["square", "kpfront", "oppwin", "oppdraw", "kpdef"]
        if any(chess.square_file(s) in (0, 7) for s in b.pieces(chess.PAWN, chess.WHITE) | b.pieces(chess.PAWN, chess.BLACK)):
            out.append("rookpawn")
    elif nopieces and w[chess.PAWN] >= 2 and k[chess.PAWN] >= 2:
        out += ["activeking", "majority", "outside", "protpass"]
        if w[chess.PAWN] >= 3 and k[chess.PAWN] >= 3:
            out.append("breakthru")
    for a, c in ((chess.WHITE, chess.BLACK), (chess.BLACK, chess.WHITE)):
        pa, pc = pcs[a], pcs[c]
        if pa == Counter({chess.QUEEN: 1}) and not pc:
            out.append("qmate")
        if pa == Counter({chess.ROOK: 1}) and not pc:
            out.append("rmate")
        if pa == Counter({chess.ROOK: 2}) and not pc:
            out.append("rrmate")
        if pa == Counter({chess.QUEEN: 1}) and pc == Counter({chess.PAWN: 1}):
            out += ["qvp", "qvpdraw"]
        if pa[chess.BISHOP] == 1 and sum(pa.values()) == pa[chess.BISHOP] + pa[chess.PAWN] and pa[chess.PAWN] >= 1 and not pc \
                and all(chess.square_file(s) in (0, 7) for s in b.pieces(chess.PAWN, a)):
            out.append("wrongb")
    if pcs[chess.WHITE][chess.ROOK] == 1 and pcs[chess.BLACK][chess.ROOK] == 1 and \
            all(not pieces(c).keys() - {chess.ROOK} for c in (chess.WHITE, chess.BLACK)) and tw + tk >= 3:
        out += ["rbehind", "r7th", "cutoff"]
        if abs(w[chess.PAWN] - k[chess.PAWN]) <= 1 and w[chess.PAWN] + k[chess.PAWN] <= 3:
            out += ["lucena", "philidor", "longside"]
    wb, bb = list(b.pieces(chess.BISHOP, chess.WHITE)), list(b.pieces(chess.BISHOP, chess.BLACK))
    if len(wb) == 1 and len(bb) == 1 and all(not pieces(c).keys() - {chess.BISHOP} for c in (chess.WHITE, chess.BLACK)) \
            and (w[chess.PAWN] + k[chess.PAWN]) >= 1:
        dark = lambda s: (chess.square_file(s) + chess.square_rank(s)) % 2 == 0
        if dark(wb[0]) != dark(bb[0]):
            out.append("ocb")
    return list(dict.fromkeys(out))


def build_stats(games):
    games = sorted(games, key=lambda g: g["end"])
    n = len(games)
    tag_n, tag_last, tag_prev = Counter(), Counter(), Counter()
    months = {}
    bad_t, other_t = [], []
    reached = kept = 0
    thrown, endings = [], defaultdict(list)
    for gi, g in enumerate(games):
        me_white = g["color"] == "white"
        mkey = dt.datetime.fromtimestamp(g["end"], dt.timezone.utc).strftime("%Y-%m")
        M = months.setdefault(mkey, {"m": mkey, "games": 0, "mist": 0, "blun": 0, "tags": Counter(), "fast": 0, "bad": 0,
                                     "wonReached": 0, "wonKept": 0})
        M["games"] += 1
        first85 = None
        b = chess.Board()
        seen_end = set()
        for i, p in enumerate(g["plies"]):
            mine = (i % 2 == 0) == me_white
            if mine:
                lab = p.get("lab")
                if lab in ("mistake", "blunder"):
                    M["mist" if lab == "mistake" else "blun"] += 1
                    M["bad"] += 1
                    if p.get("t") is not None:
                        bad_t.append(p["t"])
                        if p["t"] < 5:
                            M["fast"] += 1
                    for t in p.get("why", []):
                        tag_n[t] += 1
                        M["tags"][t] += 1
                        if gi >= n - 30:
                            tag_last[t] += 1
                        elif gi >= n - 60:
                            tag_prev[t] += 1
                elif p.get("t") is not None:
                    other_t.append(p["t"])
                w = my_win(p["e"], me_white)
                if first85 is None and w is not None and w >= 85:
                    first85 = i
            if p["ph"] == "endgame":
                for les in ending_lessons(b):
                    if les not in seen_end:
                        seen_end.add(les)
                        endings[les].append({"gid": gid_of(g["url"]), "ply": i, "result": g["result"]})
            b.push_san(p["san"])
        if first85 is not None:
            reached += 1
            M["wonReached"] += 1
            if g["result"] == "win":
                kept += 1
                M["wonKept"] += 1
            else:
                thrown.append({"gid": gid_of(g["url"]), "ply": first85, "opp": g.get("opp", ""), "end": g["end"],
                               "result": g["result"]})
    tags = {t: {"n": c, "per10": round(c * 10 / n, 1), "last30": tag_last[t], "prev30": tag_prev[t], "group": TAG_GROUP.get(t)}
            for t, c in tag_n.most_common()}
    mo = []
    for k in sorted(months):
        M = months[k]
        mo.append({"m": k, "games": M["games"], "mist": M["mist"], "blun": M["blun"], "tags": dict(M["tags"]),
                   "fast": round(M["fast"] / M["bad"], 3) if M["bad"] else None,
                   "wonReached": M["wonReached"], "wonKept": M["wonKept"]})
    return {"games": n, "from": games[0]["end"] if n else 0, "to": games[-1]["end"] if n else 0, "tags": tags, "months": mo,
            "clock": {"fastShare": round(sum(t < 5 for t in bad_t) / len(bad_t), 3) if bad_t else 0,
                      "medianBad": round(statistics.median(bad_t), 1) if bad_t else 0,
                      "medianOther": round(statistics.median(other_t), 1) if other_t else 0},
            "won": {"reached": reached, "kept": kept, "thrown": sorted(thrown, key=lambda x: -x["end"])},
            "endings": {k: v for k, v in endings.items()}}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--analysis", default=str(tc.DATA_DIR / "analysis.json"))
    ap.add_argument("--out", default=str(tc.DATA_DIR / "mine2.json"))
    ap.add_argument("--report", default=str(tc.REPORTS_DIR / "mine2.report.txt"))
    ap.add_argument("--max-minutes", type=float, default=45)
    ap.add_argument("--workers", type=int, default=4, help="engine processes, one thread each (keep <= 4)")
    ap.add_argument("--no-engine", action="store_true", help="use only what is in the cache")
    args = ap.parse_args()
    args.workers = min(args.workers, 4)
    build(args)


if __name__ == "__main__":
    main()
