"""Dev fixtures for the Train 2 UI (T6). Writes into train2/ui/fixtures/ only, never data/.

  python train2/ui/fixtures/make_fixtures.py [--no-engine]

  puzzles2.sample.json  300 puzzles from data/puzzles.json in the puzzles2 format (BLUEPRINT 4)
  mine2.sample.json     own-game cards / judges / play-outs / stats built quickly from the old data files
                        (drills, punish, technique, check, convert, endgames, analysis). Threat cards use a short,
                        time-capped Stockfish search (0.3 s per position) unless --no-engine.
  train2.dev.json       the T1 fixture compiled with --force --no-engine, plus two small synthetic dev courses
                        ("think" with JUDGE + MINE steps, "tactics" with a SET step) so every step type can be clicked.
This is test data for the UI only: the real files come from T2/T3/T5.
"""
import json, re, random, subprocess, sys, statistics, collections
from pathlib import Path
import chess, chess.engine

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
random.seed(7)

GROUPS = [
    ('hanging', 'Hanging pieces', 'Take what is left undefended.', ['hangingPiece'], ['hung piece', 'missed capture']),
    ('fork', 'Forks', 'One piece attacks two.', ['fork'], ['fork']),
    ('pin', 'Pins', 'A piece cannot move without exposing a bigger one.', ['pin'], []),
    ('skewer', 'Skewers', 'Attack the big piece, win the one behind it.', ['skewer'], []),
    ('discovered', 'Discovered attacks', 'Move one piece to unmask another.', ['discoveredAttack', 'doubleCheck'], []),
    ('removal', 'Remove the defender', 'Take or chase the piece that guards.', ['capturingDefender'], ['lost material']),
    ('deflection', 'Deflection and decoy', 'Lure a piece away from its job.', ['deflection', 'attraction'], []),
    ('trapped', 'Trapped pieces', 'A piece with no safe square.', ['trappedPiece'], []),
    ('intermezzo', 'In-between moves', 'A surprise move before the expected one.', ['intermezzo'], []),
    ('mate1', 'Mate in 1', 'Find the checkmate.', ['mateIn1'], ['missed mate']),
    ('mate2', 'Mate in 2', 'Two moves to checkmate.', ['mateIn2'], ['missed mate']),
    ('backrank', 'Back-rank mates', 'The king trapped behind its own pawns.', ['backRankMate'], ['allowed mate']),
    ('defend', 'Defend!', 'Find the only move that holds.', ['defensiveMove'], ['allowed mate', 'walked into check']),
    ('promotion', 'Promotion', 'Push the pawn home.', ['promotion', 'advancedPawn'], []),
    ('pawnEndgame', 'Pawn endgames', 'Kings and pawns only.', ['pawnEndgame'], []),
    ('rookEndgame', 'Rook endgames', 'The most common ending.', ['rookEndgame'], []),
]
GIDX = {g[0]: i for i, g in enumerate(GROUPS)}
TAG_GROUP = {'hung piece': 'hanging', 'missed capture': 'hanging', 'fork': 'fork', 'lost material': 'removal',
             'missed mate': 'mate1', 'allowed mate': 'backrank', 'walked into check': 'defend', 'threw away win': None}

def load(name, d=None):
    try: return json.loads((DATA / name).read_text(encoding='utf-8'))
    except Exception: return d

def uci_of(board, san):
    try: return board.parse_san(san).uci()
    except Exception: return None

def first_san(line):
    toks = [re.sub(r'^\d+\.+', '', t) for t in (line or '').split()]
    toks = [t for t in toks if t]
    return toks[0] if toks else ''

def gid_of(url): return (url or '').rstrip('/').split('/')[-1]

# ------------------------------------------------------------------ puzzles
def make_puzzles(n=300):
    src = load('puzzles.json', [])
    by = collections.defaultdict(list)
    for p in src:
        gs = [i for i, g in enumerate(GROUPS) if any(t in p['themes'] for t in g[3])]
        if not gs: continue
        if len(p['moves']) not in (2, 4, 6): continue
        by[gs[0]].append((p, gs))
    rows, seen = [], set()
    per = n // len(GROUPS) + 1
    for gi in range(len(GROUPS)):
        pool = by.get(gi, [])
        random.shuffle(pool)
        for p, gs in sorted(pool[:per], key=lambda x: x[0]['rating']):
            if p['id'] in seen: continue
            seen.add(p['id'])
            b = chess.Board(p['fen'])
            b.push_uci(p['moves'][0])
            san = b.san(chess.Move.from_uci(p['moves'][1]))
            why = f"The key is {san}." + (' It leads to checkmate.' if 'mate' in p['themes'] else '')
            rows.append([p['id'], p['fen'], ' '.join(p['moves']), p['rating'], gs, why, 0])
    # top up to n from any group
    rest = [p for p in src if p['id'] not in seen and len(p['moves']) in (2, 4)]
    random.shuffle(rest)
    for p in rest:
        if len(rows) >= n: break
        gs = [i for i, g in enumerate(GROUPS) if any(t in p['themes'] for t in g[3])]
        if not gs: continue
        b = chess.Board(p['fen']); b.push_uci(p['moves'][0])
        rows.append([p['id'], p['fen'], ' '.join(p['moves']), p['rating'], gs, f"The key is {b.san(chess.Move.from_uci(p['moves'][1]))}.", 0])
    rows = rows[:n]
    return {'v': 1, 'built': 0, 'sample': True,
            'groups': [{'id': g[0], 'name': g[1], 'ds': g[2], 'tags': g[3], 'why': g[4]} for g in GROUPS], 'rows': rows}

# ------------------------------------------------------------------ own games
def game_index(an):
    return {gid_of(g['url']): g for g in an}

def ply_info(G, item_id):
    gid, _, ply = item_id.rpartition('-')
    g = G.get(gid)
    if not g: return None, None
    p = int(ply)
    for k in (p - 1, p, p - 2):
        if 0 <= k < len(g['plies']) and g['plies'][k].get('why') is not None:
            return g, g['plies'][k]
    return g, (g['plies'][p - 1] if 0 < p <= len(g['plies']) else None)

def base_card(G, x, typ):
    g, pl = ply_info(G, x['id'])
    b = chess.Board(x['fen'])
    side = 'white' if b.turn else 'black'
    ok = [u for u in (uci_of(b, s) for s in x.get('ok') or []) if u]
    if not ok: return None
    tags = (pl or {}).get('why') or []
    grp = next((TAG_GROUP.get(t) for t in tags if TAG_GROUP.get(t)), None)
    last = ''.join(x['last']) if isinstance(x.get('last'), list) else x.get('last')
    played = x.get('played')
    refute = x.get('refute') or ''
    why = f"The best move was {b.san(chess.Move.from_uci(ok[0]))}."
    if played and typ == 'fix': why += f" You played {played}" + (f"; then {first_san(refute)} punishes it." if refute else '.')
    return {'id': f'{typ}/{x["id"]}', 'type': typ, 'fen': x['fen'], 'side': side, 'last': last, 'sol': [ok[0]], 'ok': ok[:2],
            'played': played, 'refute': refute, 'why': why, 'tags': tags, 'group': grp, 'ph': x.get('ph'),
            'moveNo': x.get('moveNo'), 'url': x.get('url'), 'opp': (g or {}).get('opp', ''), 'end': (g or {}).get('end', 0)}

def make_mine(no_engine):
    an = load('analysis.json', [])
    G = game_index(an)
    cards = []
    for x in load('drills.json', [])[:80]:
        c = base_card(G, x, 'fix')
        if c: cards.append(c)
    for x in load('punish.json', [])[:40]:
        c = base_card(G, x, 'pun')
        if c: c['missed'] = bool(x.get('missed')); c['why'] = f"Your opponent just blundered with {x.get('opp')}; punish it with {chess.Board(x['fen']).san(chess.Move.from_uci(c['sol'][0]))}."; cards.append(c)
    for x in load('technique.json', [])[:30]:
        c = base_card(G, x, 'tq')
        if c: c['kind'] = x.get('kind'); cards.append(c)
    # threat cards: null-move search (time-capped, 0.3 s)
    if not no_engine:
        sys.path.insert(0, str(ROOT))
        from engine_path import find_engine
        eng = chess.engine.SimpleEngine.popen_uci(str(find_engine(ROOT)))
        W = lambda cp: 50 + 50 * (2 / (1 + 2.718281828 ** (-0.00368208 * max(-1000, min(1000, cp)))) - 1)
        def wp(score, pov):
            s = score.pov(pov)
            if s.is_mate(): return 100.0 if s.mate() > 0 else 0.0
            return W(s.score())
        n = 0
        for x in load('drills.json', [])[80:260]:
            if n >= 12: break
            b = chess.Board(x['fen'])
            if b.is_check(): continue
            me = b.turn
            cur = eng.analyse(b, chess.engine.Limit(time=0.3))
            opp_now = 100 - wp(cur['score'], me)
            nb = b.copy(); nb.push(chess.Move.null()); nb = chess.Board(nb.fen())
            if nb.is_check() or not any(nb.legal_moves): continue
            r = eng.analyse(nb, chess.engine.Limit(time=0.3), multipv=2)
            if len(r) < 2: continue
            w1, w2 = wp(r[0]['score'], not me), wp(r[1]['score'], not me)
            if w1 - opp_now >= 15 and w1 - w2 >= 8:
                c = base_card(G, x, 'thr')
                if not c: continue
                c['threat'] = r[0]['pv'][0].uci()
                c['why'] = f"The threat was {nb.san(r[0]['pv'][0])}. " + c['why']
                cards.append(c); n += 1
        eng.quit()
    # judgements (Safe or blunder? = his moves; Punish it or not? decoys = quiet opponent moves)
    judges = []
    for x in load('check.json', [])[:160]:
        b = chess.Board(x['fen'])
        mv = uci_of(b, x['san'])
        if not mv: continue
        g, _ = ply_info(G, x['id'])
        judges.append({'id': f'chk/{x["id"]}', 'who': 'me', 'fen': x['fen'], 'mv': mv, 'san': x['san'],
                       'verdict': 'safe' if x['safe'] else 'blunder', 'refute': x.get('refute') or '',
                       'why': ('Nothing was hanging after it.' if x['safe'] else f"After {x['san']} your opponent has {first_san(x.get('refute')) or 'a strong reply'}."),
                       'url': x['url'], 'end': (g or {}).get('end', 0)})
    nd = 0
    for g in an[-40:]:
        b = chess.Board()
        mine_white = g['color'] == 'white'
        for i, p in enumerate(g['plies']):
            try: m = b.parse_san(p['san'])
            except Exception: break
            prev = b.fen()
            b.push(m)
            opp_moved = (i % 2 == 0) != mine_white
            if opp_moved and 12 < i < 60 and (p.get('loss') or 0) < 2 and not b.is_check() and nd < 40 and random.random() < 0.08:
                judges.append({'id': f'chk/{gid_of(g["url"])}-{i + 1}o', 'who': 'opp', 'fen': prev, 'mv': m.uci(), 'san': p['san'],
                               'verdict': 'safe', 'refute': '', 'why': 'A normal move: nothing hangs and there is no tactic to punish.',
                               'url': g['url'], 'end': g['end']})
                nd += 1
    plays = []
    for x in load('convert.json', [])[:12]:
        g, _ = ply_info(G, x['id'])
        plays.append({'id': f'cv/{x["id"]}', 'fen': x['fen'], 'side': 'white' if chess.Board(x['fen']).turn else 'black', 'goal': 'win',
                      'result': x.get('result'), 'url': x['url'], 'opp': (g or {}).get('opp', ''), 'end': (g or {}).get('end', 0), 'moveNo': x.get('moveNo')})
    for x in load('endgames.json', [])[:12]:
        g, _ = ply_info(G, x['id'])
        plays.append({'id': f'eo/{x["id"]}', 'fen': x['fen'], 'side': 'white' if chess.Board(x['fen']).turn else 'black', 'goal': x.get('goal', 'win'),
                      'result': x.get('result'), 'url': x['url'], 'opp': (g or {}).get('opp', ''), 'end': (g or {}).get('end', 0), 'moveNo': x.get('moveNo')})
    # stats (rough, for the UI only)
    an_sorted = sorted(an, key=lambda g: g['end'])
    tags = collections.Counter(); last30 = collections.Counter(); prev30 = collections.Counter()
    bad_t, other_t = [], []
    for gi, g in enumerate(an_sorted):
        mine_white = g['color'] == 'white'
        for i, p in enumerate(g['plies']):
            if (i % 2 == 0) != mine_white: continue
            if p.get('lab') in ('mistake', 'blunder'):
                bad_t.append(p.get('t') or 0)
                for t in p.get('why') or []:
                    tags[t] += 1
                    if gi >= len(an_sorted) - 30: last30[t] += 1
                    elif gi >= len(an_sorted) - 60: prev30[t] += 1
            elif p.get('t') is not None: other_t.append(p['t'])
    ng = len(an_sorted) or 1
    stats = {'games': len(an_sorted), 'from': an_sorted[0]['end'] if an else 0, 'to': an_sorted[-1]['end'] if an else 0,
             'tags': {t: {'n': n, 'per10': round(n * 10 / ng, 1), 'last30': last30[t], 'prev30': prev30[t], 'group': TAG_GROUP.get(t)} for t, n in tags.items()},
             'months': [], 'clock': {'fastShare': round(sum(1 for t in bad_t if t < 5) / max(1, len(bad_t)), 2),
                                     'medianBad': round(statistics.median(bad_t), 1) if bad_t else 0,
                                     'medianOther': round(statistics.median(other_t), 1) if other_t else 0},
             'won': {'reached': 0, 'kept': 0, 'thrown': []}, 'endings': {'kpk': [{'gid': gid_of(an_sorted[-1]['url']), 'ply': 60, 'result': 'draw'}] if an else []}}
    return {'v': 1, 'built': 0, 'sample': True, 'cards': cards, 'judges': judges, 'plays': plays, 'stats': stats}

# ------------------------------------------------------------------ dev course data
def make_train(puz, mine):
    py = Path(sys.executable)
    out = OUT / 'train2.dev.json'
    subprocess.run([str(py), str(ROOT / 'train2/tools/compile_train2.py'), str(ROOT / 'train2/tools/tests/fixture.txt'),
                    '--force', '--no-engine', '--out', str(out)], check=True, cwd=ROOT, capture_output=True)
    d = json.loads(out.read_text(encoding='utf-8'))
    fx = d['courses'][0]
    # synthetic "tactics": the fixture's fork lesson + a 20-puzzle SET of fork puzzles
    forks = [r[0] for r in sorted(puz['rows'], key=lambda r: r[3]) if GIDX['fork'] in r[4]][:20]
    fork = json.loads(json.dumps(fx['lessons']['fork']))
    fork['ch'] = 'forks'
    fork['steps'].append({'t': 'set', 'id': 'fork-set', 'theme': 'fork', 'ids': forks})
    tactics = {'id': 'tactics', 'title': 'Tactics ABC (dev)', 'sub': 'Dev copy of the fixture fork lesson with a practice set.',
               'why': 'Synthetic dev course: shows how a SET step looks.', 'draft': True,
               'chapters': [{'id': 'forks', 'title': 'Forks', 'intro': 'One piece attacks two.', 'theme': 'fork', 'lessons': ['fork']}],
               'lessons': {'fork': fork}, 'cards': {k: v for k, v in fx['cards'].items() if k.startswith('fork-')}, 'judges': {}, 'plays': {}}
    # synthetic "think": judges + a MINE block
    js = [j for j in mine['judges'] if j['who'] == 'me'][:4]
    judges = {f'think-j{i + 1}': {'fen': j['fen'], 'mv': j['mv'], 'san': j['san'], 'verdict': j['verdict'],
                                  'refute': j['refute'].split(' ') if j['refute'] else [], 'why': j['why'], 'src': 'game:' + j['id'][4:]} for i, j in enumerate(js)}
    think = {'id': 'think', 'title': 'Think first (dev)', 'sub': 'Safe or blunder? Punish it or not? What is the threat?',
             'why': 'Synthetic dev course built from the old blunder-check data.', 'draft': True,
             'chapters': [{'id': 'safe', 'title': 'Is it safe?', 'intro': 'Before you move, check what it leaves hanging.', 'theme': 'hanging', 'lessons': ['blundercheck']}],
             'lessons': {'blundercheck': {'id': 'blundercheck', 'ch': 'safe', 'title': 'The blunder check', 'goal': 'Check every move for loose pieces and checks.',
                         'rule': 'Before you move, ask: what does my opponent attack after this move?',
                         'intro': 'Most of your blunders happen in under five seconds. One question before each move stops them.',
                         'steps': [{'t': 'ex', 'id': 'bc-a', 'fen': js[0]['fen'] if js else fx['lessons']['fork']['steps'][0]['fen'], 'side': 'white' if (js and ' w ' in js[0]['fen']) else 'black', 'setting': 'A position from your games.', 'moves': [], 'keyText': 'Look at every capture and check your opponent gets.'}]
                                  + [{'t': 'judge', 'id': k} for k in judges] + [{'t': 'mine', 'type': 'pun', 'filter': {'type': 'pun'}, 'n': 3}]}},
             'cards': {}, 'judges': judges, 'plays': {}}
    d['courses'] = [tactics, think, fx]
    return d

if __name__ == '__main__':
    no_engine = '--no-engine' in sys.argv
    puz = make_puzzles()
    (OUT / 'puzzles2.sample.json').write_text(json.dumps(puz, separators=(',', ':')), encoding='utf-8')
    mine = make_mine(no_engine)
    (OUT / 'mine2.sample.json').write_text(json.dumps(mine, separators=(',', ':')), encoding='utf-8')
    tr = make_train(puz, mine)
    (OUT / 'train2.dev.json').write_text(json.dumps(tr, separators=(',', ':')), encoding='utf-8')
    cnt = collections.Counter(c['type'] for c in mine['cards'])
    print(f"puzzles {len(puz['rows'])} · mine cards {dict(cnt)} judges {len(mine['judges'])} plays {len(mine['plays'])} · courses {[c['id'] for c in tr['courses']]}")
