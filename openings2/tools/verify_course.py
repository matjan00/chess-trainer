"""Verifier for openings2 courses (BLUEPRINT section 1).

Usage:
  python verify_course.py <courseId | path/to/course.txt> [--line LINEID] [--coverage] [--no-engine]
                          [--depth 22] [--final-depth 24] [--out report.txt] [--cache path/evals.json]
Exit code 1 if any FAIL.  Report default: openings2/reports/<course>.verify.txt (always printed too).
"""
import argparse, re, sys, time
from pathlib import Path
import chess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (COURSES_DIR, REPORTS_DIR, Evals, STD_DEPTH, FINAL_DEPTH, clamp, material, pos_key,
                    stat_for, stats_children, yg, explorer, game_index, san_pv, fmt_cp)
import course_format as cf
from course_format import finding, variations, strip_variations

GLOSSARY_OK = {"fork", "pin", "skewer", "outpost", "bishop pair", "open file", "pawn break", "tempo", "fianchetto",
               "minority attack", "isolated pawn", "transposition", "development", "initiative"}
JARGON = ["zwischenzug", "zugzwang", "prophylaxis", "prophylactic", "desperado", "battery", "x-ray", "overloaded", "overloading",
          "deflection", "decoy", "discovered attack", "discovered check", "half-open", "semi-open", "backward pawn", "hanging pawns",
          "passed pawn", "pawn majority", "weak square", "en prise", "luft", "tabiya", "hypermodern", "pawn chain", "space advantage",
          "exchange sacrifice", "compensation", "isolani", "doubled pawns", "pawn storm", "back rank", "zwischenzug", "interference",
          "counterplay", "color complex", "colour complex", "good bishop", "bad bishop", "weak pawn"]
EXPLAINERS = ("(", "—", ":", " means ", " i.e.", "that is", " so ", " which ", " = ")
SAN_RE = re.compile(r"(?<![A-Za-z])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?|[a-h]x[a-h][1-8][+#]?|O-O(?:-O)?[+#]?|\d+\.{1,3}\s*[a-h][1-8][+#]?)(?![A-Za-z0-9])")
NUM_EVAL = re.compile(r"(?<![\w.])[+\-−]\d+\.\d+")
ALT_WORDS = ("stronger", "better", "more accurate", "best", "sharper", "even better")


class Result:
    def __init__(self):
        self.findings = []; self.summary = []; self.info = []

    @property
    def fails(self):
        return [f for f in self.findings if f["sev"] == "FAIL"]

    def add(self, *a, **k):
        self.findings.append(finding(*a, **k))


class Verifier:
    def __init__(self, course, ev, depth=STD_DEPTH, final_depth=FINAL_DEPTH, only_line=None, coverage=False, verbose=True):
        self.c, self.ev, self.depth, self.fdepth = course, ev, depth, final_depth
        self.only, self.coverage, self.verbose = only_line, coverage, verbose
        self.r = Result(); self.r.findings += list(course.errors)
        self.floor = -20 if course.side == "white" else -55
        self.line_final = {}          # line id -> dict of final-position data

    # ------------------------------------------------------------ helpers
    def lines_in_scope(self):
        return [l for l in self.c.lines + self.c.traps if (self.only is None or l.id == self.only)]

    def add(self, fid, sev, msg, line=None, ply=None, san=None):
        self.r.add(fid, sev, msg, line, ply, san)

    def log(self, msg):
        if self.verbose:
            print(msg, file=sys.stderr, flush=True)

    # ------------------------------------------------------------ driver
    def run(self):
        c = self.c
        self.check_structure()
        self.check_text()
        self.check_models()
        self.evaluate_nodes()
        self.check_our_moves()
        self.check_opponent_moves()
        self.check_final_positions()
        self.check_variations()
        if self.coverage:
            self.check_coverage()
        self.budget()
        self.make_summary()
        if self.only:
            self.r.findings = [f for f in self.r.findings if f["line"] in (None, self.only)]
        return self.r

    # ------------------------------------------------------------ structure: Q8 Q9 Q10 and '=>'
    def check_structure(self):
        c = self.c
        for l in self.lines_in_scope():
            if l.broken or not l.moves:
                continue
            n = len(l.moves)
            if l.section == "line" and not l.to:
                lo, hi = (16, 28) if l.kind in ("main", "side") else (6, 20)
                if not lo <= n <= hi:
                    self.add("Q8", "FAIL", f"{n} plies; {l.kind} lines need {lo}-{hi} (or end with '=> lineid')", l.id, n, l.moves[-1].san)
            if l.to:
                t = c.line(l.to)
                if t is None:
                    self.add("Q8", "FAIL", f"'=> {l.to}': no such line", l.id)
                elif t.moves:
                    b = chess.Board(); keys = {pos_key(b)}
                    for m in t.moves:
                        b.push(chess.Move.from_uci(m.uci)); keys.add(pos_key(b))
                    b2 = chess.Board()
                    for m in l.moves: b2.push(chess.Move.from_uci(m.uci))
                    if pos_key(b2) not in keys:
                        self.add("Q8", "FAIL", f"final position does not occur in line {l.to} ('=>' target)", l.id, n, l.moves[-1].san)
            if l.section == "line":
                new = sum(1 for nd in l.path if nd.owner == l.id and nd.mine)
                if new < 2: self.add("Q9", "FAIL", f"only {new} new card(s); need at least 2", l.id)
                elif new < 3: self.add("Q9", "WARN", f"only {new} new cards; aim for 3+", l.id)
        # Q10: one move per position (our moves), transpositions included
        by_pos = {}
        for (key, san), nd in self.c.nodes.items():
            if nd.mine:
                by_pos.setdefault(key, []).append(nd)
        for key, nds in by_pos.items():
            if len(nds) > 1:
                first = nds[0]
                for nd in nds[1:]:
                    self.add("Q10", "FAIL", f"two course moves in one position: {first.san} (line {first.owner}) and {nd.san} (line {nd.owner})",
                             nd.owner, nd.ply, nd.san)
        # Q2 count
        sysn = [nd for nd in self.c.nodes.values() if nd.sys and nd.mine]
        if len(sysn) > 8:
            self.add("Q2", "FAIL", f"{len(sysn)} '!sys' moves in this course; max 8")

    # ------------------------------------------------------------ text: Q17 Q18 Q19 (replay) Q20
    def check_text(self):
        for l in self.lines_in_scope():
            if l.broken: continue
            if not l.intro:
                self.add("Q17", "FAIL", "line has no intro ('> ...')", l.id)
            if l.moves and not l.to and l.section == "line" and not l.moves[-1].plan:
                self.add("Q17", "FAIL", "line has no final plan note ({P: ...} on the last move)", l.id, l.moves[-1].ply, l.moves[-1].san)
            if l.kind == "main" and l.section == "line" and l.plan_count < 2:
                self.add("Q17", "FAIL", f"main line has {l.plan_count} plan note(s); need at least 2", l.id)
            commented = shaped = 0
            for m in l.moves:
                node = self.c.nodes[(m.key_before, m.san)]
                if m.mine and node.owner == l.id:
                    if not node.c:
                        self.add("Q17", "FAIL", "new move of ours without a comment", l.id, m.ply, m.san)
                if m.mine and m.c:
                    commented += 1; shaped += 1 if m.shapes else 0
                if m.sys and node.owner == l.id:
                    low = m.c.lower()
                    if not (any(w in low for w in ALT_WORDS) and (SAN_RE.search(m.c) or re.search(r"\b[a-h][1-8]\b", m.c))):
                        self.add("Q2", "FAIL", "'!sys' needs a comment that names the stronger alternative in words", l.id, m.ply, m.san)
                for kind, text in m.comment_texts():
                    self.text_rules(l, m, kind, text)
            if commented and shaped * 2 < commented:
                self.add("Q20", "WARN", f"only {shaped} of {commented} commented moves of ours carry an arrow/circle", l.id)

    def text_rules(self, l, m, kind, text):
        w = (l.id, m.ply, m.san)
        limit = 650 if (kind == "plan" or (kind == "c" and m.key)) else 320
        if len(text) > limit:
            self.add("Q18", "FAIL", f"{kind} text is {len(text)} characters; limit {limit}", *w)
        plain = strip_variations(text)
        if NUM_EVAL.search(plain):
            self.add("Q18", "FAIL", f"numeric evaluation in text ('{NUM_EVAL.search(plain).group(0)}')", *w)
        low = text.lower()
        for bad in ("the engine says", "obviously"):
            if bad in low:
                self.add("Q18", "FAIL", f"banned phrase '{bad}'", *w)
        if "simply winning" in low and "((" not in text:
            self.add("Q18", "FAIL", "'simply winning' without a variation ((...))", *w)
        for sent in re.split(r"(?<=[.!?])\s+", plain):
            sl = sent.lower()
            for term in JARGON:
                if re.search(r"\b" + re.escape(term) + r"\b", sl) and not any(e in sl for e in EXPLAINERS):
                    self.add("Q18", "FAIL", f"jargon '{term}' is not explained in its sentence", *w)
                    break
        if kind in ("c", "x") and SAN_RE.search(plain):
            self.add("Q19", "WARN", f"move '{SAN_RE.search(plain).group(0)}' named outside (( )); write variations as ((...))", *w)

    # ------------------------------------------------------------ models
    def check_models(self):
        c = self.c
        ex = explorer().get("courses", {})
        keys = set()
        for l in c.lines:
            b = chess.Board(); keys.add(pos_key(b))
            for m in l.moves:
                b.push(chess.Move.from_uci(m.uci)); keys.add(pos_key(b))
        for g in c.models:
            gid = g["id"]; src = g["source"]
            moves = None
            mm = re.match(r"^explorer\.json:([A-Za-z0-9_-]+)$", src)
            lm = re.match(r"^lichess-masters:([A-Za-z0-9]{8})$", src)
            if mm:
                found = next((x for x in ex.get(mm.group(1), {}).get("models", []) if x.get("id") == gid), None)
                if found is None:
                    self.add("M1", "FAIL", f"model {gid}: source '{src}' does not exist in data/explorer.json (made-up source)")
                    continue
                for fld, ours in (("white", g["white"]), ("black", g["black"])):
                    if ours.strip().lower() != str(found.get(fld, "")).strip().lower():
                        self.add("M1", "FAIL", f"model {gid}: {fld} '{ours}' differs from explorer.json '{found.get(fld)}'")
                if str(found.get("year")) != g["year"] or str(found.get("result")) != g["result"]:
                    self.add("M1", "FAIL", f"model {gid}: year/result differ from explorer.json ({found.get('year')}, {found.get('result')})")
                moves = found.get("moves", [])
            elif lm:
                moves = None    # moves are filled by the GitHub job (T8)
            else:
                self.add("M1", "FAIL", f"model {gid}: source '{src}' is not allowed (only explorer.json:<courseId> or lichess-masters:<gameId>)")
                continue
            if moves is not None:
                b = chess.Board(); hits = []
                try:
                    for i, s in enumerate(moves, 1):
                        b.push_san(s)
                        if pos_key(b) in keys: hits.append(i)
                except ValueError:
                    self.add("M1", "FAIL", f"model {gid}: explorer.json moves are not legal")
                    continue
                g["moves"], g["hits"] = moves, hits
                if not hits or max(hits) < 8:
                    self.add("M1", "FAIL", f"model {gid} passes through no course position at ply >= 8 (hits: {hits[-3:] or 'none'})")
                for p in g["notes"]:
                    if p > len(moves): self.add("M1", "FAIL", f"model {gid}: note for ply {p} but the game has {len(moves)} plies")
        # models are reported as course-level findings (line None)

    # ------------------------------------------------------------ engine evaluation of every move
    def evaluate_nodes(self):
        nodes, seen = [], set()
        for l in self.lines_in_scope():
            for nd in l.path:
                if nd.id not in seen:
                    seen.add(nd.id); nodes.append(nd)
        t0 = time.time(); total = len(nodes)
        for i, nd in enumerate(nodes, 1):
            if getattr(nd, "info", None): continue
            b = chess.Board(nd.fen_before); mv = chess.Move.from_uci(nd.uci)
            res = self.ev.played(b, mv, self.depth, 3)
            if res is None:
                nd.info = None; continue
            cp, pv, in_top, top = res
            best = clamp(top[0]["cp"]); played = clamp(cp)
            mover_white = b.turn == chess.WHITE
            nd.info = {"best": best, "played": played, "loss": max(0, best - played), "in_top3": in_top, "top": top, "pv": pv,
                       "ev_white": played if mover_white else -played, "board": b,
                       "best_san": b.san(chess.Move.from_uci(top[0]["m"])) if top[0]["m"] else None}
            if self.verbose and (i % 25 == 0 or i == total):
                self.log(f"  evaluated {i}/{total} positions ({time.time()-t0:.0f}s, {self.ev.searches} searches)")

    # ------------------------------------------------------------ Q1-Q4 and Q13
    def check_our_moves(self):
        seen = set()
        for l in self.lines_in_scope():
            for nd in l.path:
                if nd.id in seen or not getattr(nd, "info", None): continue
                seen.add(nd.id)
                i = nd.info; w = (nd.owner, nd.ply, nd.san)
                if nd.mine:
                    best, played, loss = i["best"], i["played"], i["loss"]
                    if best >= 300:   # Q4
                        if loss > 120 or played < 250:
                            self.add("Q4", "FAIL", f"winning position (best {fmt_cp(best)}): move loses {loss} cp and leaves {fmt_cp(played)}; may lose up to 120 and must stay >= +2.50 (engine: {i['best_san']})", *w)
                    else:
                        if nd.sys:
                            if loss > 60:
                                self.add("Q2", "FAIL", f"!sys move loses {loss} cp (max 60; engine: {i['best_san']})", *w)
                        elif loss > 35:
                            self.add("Q1", "FAIL", f"loses {loss} cp (limit 35; engine: {i['best_san']})", *w)
                        elif loss > 25:
                            self.add("Q1", "WARN", f"loses {loss} cp (26-35 is borderline; engine: {i['best_san']})", *w)
                        if played < self.floor:
                            self.add("Q3", "FAIL", f"position after our move is {fmt_cp(played)} for us; floor is {fmt_cp(self.floor)}", *w)
                # Q13 sanity: mover >= 2 points down after the 6-ply PV
                if i["loss"] > 35:
                    b = i["board"].copy(); mat0 = material(b); sign = 1 if b.turn == chess.WHITE else -1
                    try:
                        for u in i["pv"][:6]: b.push(chess.Move.from_uci(u))
                    except Exception:
                        continue
                    if (material(b) - mat0) * sign <= -2:
                        self.add("Q13", "WARN", f"mover is {-(material(b)-mat0)*sign} points down after the 6-ply principal variation and the move loses {i['loss']} cp", *w)

    # ------------------------------------------------------------ Q5 / Q6
    def check_opponent_moves(self):
        c = self.c
        opp_children = {}
        for (key, san), nd in c.nodes.items():
            if not nd.mine and nd.lines:
                opp_children.setdefault(key, set()).add(san)
        for l in self.lines_in_scope():
            if l.broken or (l.section == "trap" and l.kind == "avoid"): continue
            opp = [(idx, nd) for idx, nd in enumerate(l.path) if not nd.mine]
            if not opp: continue
            if l.section == "trap":
                flagged = [idx for idx, nd in opp if nd.nag in ("?", "?!")]
                branch = flagged[0] if flagged else None
            else:
                multi = [idx for idx, nd in opp if len(opp_children.get(nd.key, ())) >= 2]
                owned = [idx for idx, nd in opp if nd.owner == l.id]
                branch = multi[-1] if multi else (owned[0] if owned else None)
            # Q5 v2 (lead review, 2026-11-13): a flagged opponent move is a node of the tree, so any number of lines may
            # pass through it.  What is checked per line: every non-sound move is flagged and explained, qualifies by
            # frequency, mistakes only in punish lines / traps, and after a mistake the opponent defends soundly.
            n_inacc = n_mist = 0
            for idx, nd in opp:
                if not getattr(nd, "info", None): continue
                i = nd.info; w = (l.id, nd.ply, nd.san)
                loss = i["loss"]
                st = stat_for(nd.key, nd.san)
                share = st["share"] if st and st["valid"] else None
                ygn = yg(nd.key, nd.san, c.side)
                top3 = i["in_top3"]
                sh = share or 0
                if not top3 and not sh and not ygn:
                    self.add("Q6", "WARN", f"not in the engine top 3 and no statistics (engine: {i['best_san']}); justify or replace", *w)
                shtxt = "no stats" if share is None else f"share {share*100:.0f}%"
                early = nd.ply <= 6
                if loss <= 35: cls = "sound"
                elif loss <= 90 and (sh >= .15 or ygn >= 2 or (early and (sh >= .03 or ygn >= 1 or "defence" in l.tags))): cls = "common-ok"
                elif loss > 90 and (sh >= .08 or ygn >= 1 or "classic" in l.tags): cls = "mistake"
                else: cls = "bad"
                desc = f"loses {loss} cp ({cls}; {shtxt}, your games {ygn}; engine: {i['best_san']})"
                if cls == "sound":
                    if nd.nag: self.add("Q5", "WARN", f"flagged '{nd.nag}' but the move is sound ({desc})", *w)
                    if branch is not None and idx > branch and not (top3 or sh >= .10):
                        self.add("Q5", "FAIL", f"after the branch point the opponent move must be engine top 3 or share >= 10%: {desc}", *w)
                    continue
                if n_mist and not (cls == "mistake" and l.kind == "punish" and nd.nag == "?" and sh >= .25 and n_mist == 1):
                    self.add("Q5", "FAIL", f"opponent plays a weak move after the punished mistake; show the best defence ({desc})", *w)
                    continue
                if cls == "common-ok":
                    n_inacc += 1
                    if nd.nag != "?!": self.add("Q5", "FAIL", f"common-ok move must be written with '?!' and explained: {desc}", *w)
                    if not nd.c: self.add("Q5", "FAIL", "common-ok move needs a comment saying why it is inaccurate and what we gain", *w)
                    if n_inacc > 2: self.add("Q5", "FAIL", f"more than two '?!' opponent moves in one line: {desc}", *w)
                elif cls == "mistake":
                    n_mist += 1
                    if l.kind != "punish": self.add("Q5", "FAIL", f"mistake in a {l.kind} line (only punish lines / traps): {desc}", *w)
                    elif nd.nag != "?": self.add("Q5", "FAIL", f"mistake must be written with '?': {desc}", *w)
                    elif not nd.c: self.add("Q5", "FAIL", "mistake needs a comment", *w)
                else:
                    self.add("Q5", "FAIL", f"opponent move not allowed anywhere: {desc}", *w)


    # ------------------------------------------------------------ Q11 Q12
    def check_final_positions(self):
        c = self.c
        for l in self.lines_in_scope():
            if l.broken or not l.moves: continue
            b = chess.Board()
            for m in l.moves: b.push(chess.Move.from_uci(m.uci))
            w = (l.id, len(l.moves), l.moves[-1].san)
            f24 = self.ev.single(b, self.fdepth); f14 = self.ev.single(b, 14)
            if f24 is None: continue
            our24 = clamp(-f24[0]) if c.me != b.turn else clamp(f24[0])
            our14 = clamp(-f14[0]) if c.me != b.turn else clamp(f14[0])
            data = {"ev_our": our24, "pv": f24[1], "board": b}
            self.line_final[l.id] = data
            if l.section == "trap" and l.kind == "avoid":
                continue
            # Q11
            if l.kind in ("main", "side") and l.section == "line":
                lo_fail, lo_warn = (-15, 0) if c.side == "white" else (-50, -35)
                if our24 < lo_fail: self.add("Q11", "FAIL", f"final position is {fmt_cp(our24)} for us at depth {self.fdepth}; minimum {fmt_cp(lo_fail)}", *w)
                elif our24 < lo_warn: self.add("Q11", "WARN", f"final position is {fmt_cp(our24)} for us; below {fmt_cp(lo_warn)}", *w)
            elif l.kind == "punish" or l.section == "trap":
                floor = 60 if c.side == "white" else 20
                if our24 < floor: self.add("Q11", "FAIL", f"punish line ends {fmt_cp(our24)}; must be at least {fmt_cp(floor)}", *w)
                bidx = next((i for i, nd in enumerate(l.path) if not nd.mine and nd.nag in ("?", "?!")), None)
                if bidx is not None and getattr(l.path[bidx], "info", None):
                    before = self.eval_before_our_pov(l.path[bidx])
                    if our24 - before < 50:
                        self.add("Q11", "FAIL", f"punish line gains only {our24-before} cp over the position before the mistake ({fmt_cp(before)} -> {fmt_cp(our24)}); need 50", *w)
            # Q12
            if l.kind == "punish" and our24 >= 300:
                continue
            if b.is_check():
                self.add("Q12", "FAIL", "line ends with the side to move in check (not a quiet end)", *w)
            mat0 = material(b); bb = b.copy()
            for k, u in enumerate(f24[1][:4], 1):
                try: bb.push(chess.Move.from_uci(u))
                except Exception: break
                if k in (1, 4) and material(bb) != mat0:
                    self.add("Q12", "FAIL", f"not quiet: material changes within the principal variation ({' '.join(san_pv(b, f24[1], 4))}); the line ends mid-exchange or leaves a piece hanging", *w)
                    break
            # in clearly decided positions the number moves a lot without the position being unquiet
            tol = 50 if min(our14, our24) < 150 else 10**6      # both depths say we are clearly better: not a quietness issue
            if abs(our24 - our14) > tol:
                self.add("Q12", "FAIL", f"not quiet: eval at depth 14 ({fmt_cp(our14)}) and {self.fdepth} ({fmt_cp(our24)}) differ by more than {tol} cp", *w)

    def eval_before_our_pov(self, nd):
        top = nd.info["top"][0]["cp"]       # best for the mover (opponent) before the mistake
        return -clamp(top)

    # ------------------------------------------------------------ Q19 variations (engine part)
    def check_variations(self):
        for l in self.lines_in_scope():
            if l.broken: continue
            for m in l.moves:
                node = self.c.nodes[(m.key_before, m.san)]
                for kind, text in m.comment_texts():
                    for var in variations(text):
                        self.check_variation(l, m, node, var)

    def check_variation(self, l, m, node, var):
        w = (l.id, m.ply, m.san)
        toks = cf.tokenize(var)
        first = re.match(r"^\s*(\d+)\s*(\.\.\.|…|\.)", var)
        if not first:
            self.add("Q19", "FAIL", f"variation '(({var[:40]}))' must start with a move number like 7. or 7...", *w); return
        n, dots = int(first.group(1)), first.group(2)
        ply0 = 2 * (n - 1) + (0 if dots == "." else 1)
        if ply0 > len(l.moves):
            self.add("Q19", "FAIL", f"variation '(({var[:40]}))' starts at ply {ply0+1}, but the line is only {len(l.moves)} plies long", *w); return
        b = chess.Board()
        for mm in l.moves[:ply0]: b.push(chess.Move.from_uci(mm.uci))
        if (b.turn == chess.WHITE) != (dots == "."):
            self.add("Q19", "FAIL", f"variation '(({var[:40]}))': move number/side does not match the position", *w); return
        start = b.copy(); last_turn = None
        for kind, val in toks:
            if kind != "m": continue
            san, _ = cf.split_nag(val)
            try:
                mv = b.parse_san(san)
            except ValueError:
                self.add("Q19", "FAIL", f"variation '(({var[:50]}))': '{san}' is not legal here", *w); return
            last_turn = b.turn; b.push(mv)
        if last_turn is None: return
        if m.nag in ("?", "?!"): return      # introduced by a ?-marked move: shows what goes wrong
        s = self.ev.single(start, 18); e = self.ev.single(b, 18)
        if s is None or e is None: return
        claim = last_turn
        s_cl = clamp(s[0]) if start.turn == claim else -clamp(s[0])
        e_cl = clamp(e[0]) if b.turn == claim else -clamp(e[0])
        if s_cl - e_cl > 80:
            self.add("Q19", "FAIL", f"variation '(({var[:50]}))' does not hold: the side it favours ends {s_cl-e_cl} cp worse than best play from its start", *w)

    # ------------------------------------------------------------ Q14 / Q15
    def check_coverage(self):
        c = self.c
        skips = {(s["key"], s["san"]) for s in c.skips if s["key"]}
        pos = {}      # key -> (line id, opp ply)
        for l in c.lines:
            b = chess.Board()
            for m in l.moves:
                if m.mine and not l.broken:
                    pass
                b.push(chess.Move.from_uci(m.uci))
                if m.mine:
                    pos.setdefault(pos_key(b), (l.id, m.ply + 1))
                else:
                    pos.setdefault(m.key_before, (l.id, m.ply))
        for key, (lid, ply) in pos.items():
            if self.only and lid != self.only: continue
            if ply > 16: continue
            ch = stats_children(key)
            if not ch: continue
            for san, share, cnt in ch:
                if (key, san) in c.nodes or (key, san) in skips: continue
                if share >= .10:
                    self.add("Q14", "FAIL", f"opponent reply {san} ({share*100:.0f}%) is neither in the course nor listed under skip:", lid, ply, san)
                elif share >= .05:
                    self.add("Q14", "WARN", f"opponent reply {san} ({share*100:.0f}%) not covered", lid, ply, san)
        idx = game_index()
        for key, (lid, ply) in pos.items():
            if self.only and lid != self.only: continue
            seen = {}
            for g, is_me, san in idx.get(key, []):
                if is_me or g["color"] != c.side: continue
                seen.setdefault(san, set()).add(g["url"])
            for san, urls in seen.items():
                if len(urls) >= 2 and (key, san) not in c.nodes and (key, san) not in skips:
                    self.add("Q15", "FAIL", f"you met {san} here in {len(urls)} games; it is neither covered nor listed under skip:", lid, ply, san)

    # ------------------------------------------------------------ Q16 + summary table
    def budget(self):
        c = self.c
        per = {}
        for l in c.lines:
            per.setdefault(l.ch, {}).setdefault(l.kind, 0); per[l.ch][l.kind] += 1
        cards = sum(1 for nd in c.nodes.values() if nd.mine and any(True for _ in nd.lines))
        txt = "; ".join(f"{ch}: " + ", ".join(f"{k} {n}" for k, n in d.items()) for ch, d in per.items())
        self.add("Q16", "INFO", f"{len(c.lines)} lines, {len(c.traps)} traps, {cards} cards (target 220-320). {txt}")

    @staticmethod
    def reach(c, l):
        p, known = 1.0, False
        for nd in l.path:
            if nd.mine: continue
            st = stat_for(nd.key, nd.san)
            if st is None: continue
            if st["found"]: p *= st["n"] / st["total"] if st["total"] else 0.02; known = True
            else: p *= 0.02
        return p if known else None

    def make_summary(self):
        rows = []
        for l in self.lines_in_scope():
            infos = [nd.info for nd in l.path if getattr(nd, "info", None)]
            ours = [nd.info["loss"] for nd in l.path if nd.mine and getattr(nd, "info", None)]
            opps = [nd.info["loss"] for nd in l.path if not nd.mine and getattr(nd, "info", None)]
            fin = self.line_final.get(l.id)
            r = self.reach(self.c, l)
            rows.append({"id": l.id, "kind": l.kind, "plies": len(l.moves),
                         "new": sum(1 for nd in l.path if nd.owner == l.id and nd.mine) if l.section == "line" else 0,
                         "final": fin["ev_our"] if fin else None, "wo": max(ours) if ours else None, "wp": max(opps) if opps else None,
                         "reach": r})
        self.r.summary = rows


# ------------------------------------------------------------------ report
def format_report(course, res):
    order = {l.id: i for i, l in enumerate(course.lines + course.traps)}
    sevrank = {"FAIL": 0, "WARN": 1, "INFO": 2}
    fs = sorted(res.findings, key=lambda f: (sevrank[f["sev"]], order.get(f["line"], -1), f["ply"] or 0, f["id"]))
    out = []
    seen = set()
    for f in fs:
        loc = f"{course.id}/{f['line']}" if f["line"] else course.id
        if f["ply"]: loc += f" ply {f['ply']}"
        if f["san"]: loc += f" {f['san']}"
        line = f"{f['id']} {f['sev']} {loc}: {f['msg']}"
        if line in seen: continue
        seen.add(line); out.append(line)
    out.append("")
    out.append(f"{'line':<22}{'kind':<8}{'plies':>5}{'new':>5}{'final':>8}{'worst ours':>12}{'worst opp':>11}{'reach':>8}")
    for r in res.summary:
        reach_txt = ("%.1f%%" % (r["reach"] * 100)) if r["reach"] is not None else "-"
        out.append(f"{r['id']:<22}{r['kind']:<8}{r['plies']:>5}{r['new']:>5}{fmt_cp(r['final']):>8}"
                   f"{(str(r['wo'])+' cp') if r['wo'] is not None else 'n/a':>12}{(str(r['wp'])+' cp') if r['wp'] is not None else 'n/a':>11}"
                   f"{reach_txt:>8}")
    nf = len(res.fails); nw = sum(1 for f in res.findings if f["sev"] == "WARN")
    out.append(""); out.append(f"{nf} FAIL, {nw} WARN")
    return "\n".join(out)


def resolve(arg):
    p = Path(arg)
    if p.suffix == ".txt" or p.exists():
        return p
    return COURSES_DIR / f"{arg}.txt"


def verify(course, ev=None, **kw):
    own = ev is None
    ev = ev or Evals(engine=not kw.pop("no_engine", False))
    try:
        v = Verifier(course, ev, **kw)
        return v.run()
    finally:
        if own: ev.close()
        else: ev.save()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("course"); ap.add_argument("--line"); ap.add_argument("--coverage", action="store_true")
    ap.add_argument("--no-engine", action="store_true", help="only use cached evaluations")
    ap.add_argument("--depth", type=int, default=STD_DEPTH); ap.add_argument("--final-depth", type=int, default=FINAL_DEPTH)
    ap.add_argument("--out"); ap.add_argument("--cache"); ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    path = resolve(a.course)
    course = cf.parse_course(path)
    t0 = time.time()
    ev = Evals(path=a.cache, engine=not a.no_engine) if a.cache else Evals(engine=not a.no_engine)
    try:
        res = Verifier(course, ev, depth=a.depth, final_depth=a.final_depth, only_line=a.line, coverage=a.coverage, verbose=not a.quiet).run()
    finally:
        ev.close()
    rep = format_report(course, res)
    print(rep)
    out = Path(a.out) if a.out else REPORTS_DIR / f"{course.id}.verify.txt"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(rep + "\n", encoding="utf-8")
    print(f"[{time.time()-t0:.1f}s, {ev.searches} new searches, {ev.hits} cache hits; report: {out}]", file=sys.stderr)
    return 1 if res.fails else 0


if __name__ == "__main__":
    sys.exit(main())
