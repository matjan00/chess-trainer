/* ============================================================================================
   G2 core: the new Games tab (list with "Next to review", key-moments review, whole-game viewer).
   Spec: games2/PLAN.md (G1-G8, all recommended answers approved). Plain script, no imports; everything lives
   inside the G2 object, so it can be pasted into the app's module script (placeholder G2_JS) next to O2 and T2.
   Integration steps for app.html: games2/INTEGRATION.md.

   G2.init({ root, data: { games }, hooks }) once, after progress/sync and T2/O2 are set up.
   hooks (required: Chessground, record, progress; the rest optional, each part hides without it):
     Chessground, record(kind, id, value), progress, store {get,set}, sfx {play}, engine {go(fen,{movetime})},
     prepGame(g)        -> fills g._fens / g._mv / g._best (the app's helper; a small built-in copy is used if missing)
     standWords(cp, mate), openingName(slug), fmtDate(unixSeconds), evalText(e)   (the app's wording helpers)
     mine()             -> mine2.json-shaped { cards:[{id,type:'fix',url,moveNo,ok,sol,played,why}] } (T2.mine)
     practise(cardId, back)  opens one Train card ('mine/<id>'), calls back() when it is finished (T2.startOne)
     practised(cardId)  -> true when that Train card has been answered at least once
     bookDev(g)         -> { id, title, ply, san, courseSans } where you left an opening course in this game, or null
     openCourse(id)     opens that Openings course (on its "Your games" part)
     onChange()         after G2 records progress (Today refresh)
   Games: the app's GAMES (analysis.json + the app's derived fields acc, nb, nm, family, myWin, cpl, acpl, acplOpp, acplPh).
   Progress kind written: gr (game reviewed: id = chess.com game id, value {d: 1|0}). Declared in G2.KINDS.
   API: show('list'|'play'), open(gameOrUrl, {mode:'review'|'game', ply, explore}), refresh(), filter({color,result,opening}),
        facts(g), headline(g), nextToReview(), gameOfWeek(), isReviewed(g), KINDS, GLOSSARY, cg (the board, for redraws).
   ============================================================================================ */
const G2 = (() => {
  'use strict';
  const KINDS = ['gr'];
  const QUICK = 4;            // seconds: a mistake made faster than this is a "quick move"
  const H = {
    Chessground: null, record: null, progress: null, games: [], engine: null, onChange: null,
    store: { get(k, d) { try { const v = localStorage.getItem('ct.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch {} } },
    sfx: { play() {} }, prepGame: null,
    standWords(cp, mate) {
      if (mate !== undefined && mate !== null) return mate > 0 ? 'winning easily — mate is coming' : 'getting mated';
      const a = Math.abs(cp), w = a < 50 ? 'about equal' : a < 150 ? 'slightly better' : a < 300 ? 'clearly better' : a < 600 ? 'winning' : 'winning easily';
      return cp >= 0 || a < 50 ? w : { 'slightly better': 'slightly worse', 'clearly better': 'clearly worse', winning: 'losing', 'winning easily': 'losing badly' }[w];
    },
    openingName: s => (s || 'Unknown').replace(/-/g, ' ').replace(/\s+\d.*$/, '').replace(/\.{3}.*/, '').trim(),
    fmtDate: t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }),
    evalText: e => !e ? '' : e.m !== undefined ? (e.m === 0 ? '#' : (e.m > 0 ? '+M' : '-M') + Math.abs(e.m)) : (e.cp > 0 ? '+' : '') + (e.cp / 100).toFixed(1),
    mine: () => null, practise: null, practised: () => false, bookDev: () => null, openCourse: null,
  };
  let ROOT = null, GAMES = [], cg = null, curShapes = [], lastW = 0;
  const S = {
    screen: 'list', g: null, mode: 'review', ply: 0, flipped: false,
    rv: null,                  // review: { list:[moment], idx, phase:'ask'|'shown', guess, gen }
    ex: null, gen: 0,          // explore (Try your own move): { chess, line, base, gen }
    more: false, nums: false,
    f: { color: 'all', result: 'all', opening: 'all', sort: 'new', threw: false, todo: false, quick: false },
  };

  /* ---------------------------------------------------------------- small helpers */
  const $ = (s, r = ROOT) => r.querySelector(s);
  const $$ = (s, r = ROOT) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const gid = g => String(g.url || '').split('?')[0].split('/').filter(Boolean).pop() || String(g.end || '');
  const isMine = (g, i) => (i % 2 === 0) === (g.color === 'white');
  const moveNo = i => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'}`;          // ply index (0-based) -> "15." / "15..."
  const fullNo = i => Math.floor(i / 2) + 1;
  const isBad = p => p.lab === 'blunder' || p.lab === 'mistake';
  const secs = t => `${Math.max(1, Math.round(t))} s`;
  const ago = t => { const d = Math.floor((Date.now() / 1000 - t) / 86400); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? `${d} days ago` : H.fmtDate(t); };
  const resWord = r => r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : 'Draw';
  const evalAt = (g, k) => (k < g.plies.length ? g.plies[k].e : g.final);
  // the position after k plies, from your side: {cp} or {mate} (positive = good for you)
  function myEval(g, k) {
    const e = evalAt(g, k), s = g.color === 'white' ? 1 : -1;
    if (!e) return { cp: 0 };
    if (e.m !== undefined) return e.m === 0 ? { mate: isMine(g, k) ? -1 : 1 } : { mate: s * e.m };
    return { cp: s * e.cp };
  }
  function stand(g, k) {
    const e = myEval(g, k), w = H.standWords(e.cp ?? 0, e.mate);
    return w === 'about equal' ? 'it is about equal' : `you are ${w}`;
  }
  const myWin = g => g.myWin || [];
  const boardVisible = () => { const b = ROOT && $('#g2-board'); return !!b && b.offsetWidth > 0; };
  function toDests(chess) {
    const d = new Map();
    for (const m of chess.moves({ verbose: true })) { if (!d.has(m.from)) d.set(m.from, []); d.get(m.from).push(m.to); }
    return d;
  }
  function prep(g) {
    if (H.prepGame) return H.prepGame(g);
    if (g._fens) return;
    const c = new Chess();
    g._fens = [c.fen()]; g._mv = []; g._best = [];
    for (const p of g.plies) {
      let best = null;
      if (p.best) { const t = new Chess(c.fen()); const bm = t.move(p.best, { sloppy: true }); if (bm) best = [bm.from, bm.to]; }
      g._best.push(best);
      const m = c.move(p.san, { sloppy: true });
      g._mv.push(m ? [m.from, m.to] : null);
      g._fens.push(c.fen());
    }
  }
  const isReviewed = g => !!H.progress?.gr?.[gid(g)]?.d;
  function setReviewed(g, on) {
    if (isReviewed(g) === on) return;
    H.record('gr', gid(g), { d: on ? 1 : 0 });
    H.onChange?.();
  }

  /* ---------------------------------------------------------------- facts about one game (cached) */
  // key moments: up to 3 of your own biggest drops (>= 15% winning chance, 6+ moves apart), always including the move
  // where a winning position (85%+) first slipped below 60%; plus at most one good moment (you punished their blunder)
  function facts(g) {
    if (g._g2) return g._g2;
    const N = g.plies.length, W = myWin(g);
    const mine = [...Array(N).keys()].filter(i => isMine(g, i));
    const bad = mine.filter(i => isBad(g.plies[i]));
    const fast = bad.filter(i => g.plies[i].t != null && g.plies[i].t < QUICK);
    const ts = mine.map(i => g.plies[i].t).filter(t => t != null).sort((a, b) => a - b);
    const usual = ts.length ? ts[ts.length >> 1] : null;
    const peak = W.length ? Math.max(...W) : 50;
    const winAt = W.findIndex(x => x >= 85);
    let threw = -1;
    if (winAt >= 0) {
      const k = W.findIndex((x, j) => j > winAt && x < 60);
      if (k > 0) {   // the move that did most of the damage on the way down
        for (const i of mine) if (i >= winAt && i < k && g.plies[i].loss >= 5 && (threw < 0 || g.plies[i].loss > g.plies[threw].loss)) threw = i;
      }
    }
    const picked = threw >= 0 ? [threw] : [];
    for (const i of mine.filter(i => g.plies[i].loss >= 15).sort((a, b) => g.plies[b].loss - g.plies[a].loss)) {
      if (picked.length >= 3) break;
      if (picked.every(j => Math.abs(j - i) >= 12)) picked.push(i);
    }
    picked.sort((a, b) => a - b);
    let great = -1;
    for (let i = 1; i < N; i++) {
      const prev = g.plies[i - 1], p = g.plies[i];
      if (isMine(g, i) && prev.lab === 'blunder' && prev.loss >= 20 && p.loss < 2 && !picked.includes(i) && (great < 0 || prev.loss > g.plies[great - 1].loss)) great = i;
    }
    const swing = mine.reduce((m, i) => Math.max(m, g.plies[i].loss || 0), 0);
    const moments = picked.map(i => ({ i, kind: i === threw ? 'threw' : 'slip' }));
    if (great >= 0) moments.push({ i: great, kind: 'great' });
    return (g._g2 = { moments, threw, winAt, great, swing, bad, fast, usual, peak,
      threwWin: peak >= 85 && g.result !== 'win', openingSlip: bad.some(i => g.plies[i].ph === 'opening') });
  }
  const keyCount = f => f.moments.filter(m => m.kind !== 'great').length;
  function headline(g, f) {
    const key = f.moments.filter(m => m.kind !== 'great');
    if (f.threw >= 0) {
      const a = fullNo(Math.max(0, f.winAt - 1)), b = fullNo(f.threw);
      return g.result === 'win' ? `You were winning at move ${a} and let it slip on move ${b}, but still won.`
        : g.result === 'draw' ? `You were winning at move ${a}, then let it slip on move ${b} and drew.`
        : `You were winning at move ${a}, then lost it on move ${b}.`;
    }
    if (key.length) {
      const top = key.reduce((a, m) => g.plies[m.i].loss > g.plies[a.i].loss ? m : a);
      return g.result === 'win' ? `You won. Your biggest slip came on move ${fullNo(top.i)}.` : `The game turned on move ${fullNo(top.i)}.`;
    }
    return g.result === 'win' ? 'A clean win: no big swings from you.' : 'No big slips from you in this game.';
  }
  function timeLine(f) {
    const b = f.bad.length, q = f.fast.length;
    if (!q) return '';
    if (b === 1) return 'Your one mistake came in under 4 seconds.';
    return q === b ? `All ${b} of your mistakes came in under 4 seconds.` : `${q} of your ${b} mistakes came in under 4 seconds.`;
  }
  // the Train card ("fix" card in mine2.json) for your move at ply index i of this game, if one was built
  const plyOfMoveNo = s => { const n = parseInt(s, 10); return /\.\.\./.test(s) ? (n - 1) * 2 + 1 : (n - 1) * 2; };
  function fixCards(g) {
    const cards = (H.mine?.()?.cards || []).filter(c => c.type === 'fix' && c.url === g.url);
    return cards.map(c => ({ c, i: plyOfMoveNo(String(c.moveNo || '')) })).sort((a, b) => a.i - b.i);
  }
  const cardAt = (g, i) => fixCards(g).find(x => x.i === i)?.c || null;
  const cardDone = c => !!c && !!H.practised?.('mine/' + c.id);

  // plain English for a labelled move (G2): what went wrong, then how you stood before and after
  const TAG = {
    'missed mate': 'There was a checkmate here, and it was missed.',
    'allowed mate': 'This lets the opponent start a mating attack.',
    'hung piece': 'This left a piece undefended, so it can be taken.',
    'fork': 'This walks into a fork: one enemy piece attacks two at once.',
    'missed capture': 'There was a capture here that wins material, and it was missed.',
    'lost material': 'This loses material: the trade does not work out.',
    'walked into check': 'This allows a strong check.',
    'threw away win': 'Before this move the game was won; after it the win is gone.',
  };
  function whatWrong(p) {
    const s = Object.keys(TAG).filter(t => (p.why || []).includes(t)).slice(0, 2).map(t => TAG[t]).join(' ');
    if (s) return s;
    const c = p.cpl ?? (p.loss || 0) * 10;
    return c >= 300 ? 'This gave away a lot: more than a piece.' : c >= 150 ? 'This gave away more than a pawn.' : c >= 60 ? 'This gave away about a pawn.' : 'A small slip, but it cost real winning chances.';
  }
  const beforeAfter = (g, i) => `Before: ${stand(g, i)}. After: ${stand(g, i + 1)}.`;

  /* ---------------------------------------------------------------- list (G5) */
  const fam = g => g.family || H.openingName(g.opening);
  function passes(g, f, x) {
    return (x.color === 'all' || g.color === x.color) && (x.result === 'all' || g.result === x.result) && (x.opening === 'all' || fam(g) === x.opening)
      && (!x.threw || f.threwWin) && (!x.todo || !isReviewed(g)) && (!x.quick || f.fast.length > 0);
  }
  function nextToReview() {
    for (let k = GAMES.length - 1; k >= 0; k--) { const g = GAMES[k], f = facts(g); if (!isReviewed(g) && f.swing >= 20 && keyCount(f)) return g; }
    return null;
  }
  // the most expensive game of the last 7 days: the biggest fall from a winning position that was not won (G7)
  function gameOfWeek() {
    const since = Date.now() / 1000 - 7 * 86400;
    let best = null, drop = 0;
    for (const g of GAMES) {
      if ((g.end || 0) < since) continue;
      const f = facts(g); if (!f.threwWin) continue;
      const W = myWin(g), d = f.peak - W[W.length - 1];
      if (d > drop) { drop = d; best = g; }
    }
    return best;
  }
  function tagsOf(g, f) {
    const t = [];
    if (f.threwWin) t.push(['warn', 'Threw away a win']);
    if (f.fast.length) t.push(['', 'Quick moves']);
    if (f.openingSlip) t.push(['', 'Opening mistake']);
    const k = keyCount(f); if (k) t.push(['', plural(k, 'key moment')]);
    if (isReviewed(g)) t.push(['ok', 'Reviewed ✓']);
    return t.map(([c, s]) => `<span class="g2-tag ${c}">${s}</span>`).join('');
  }
  function rowHtml(g) {
    const f = facts(g);
    return `<button class="g2-row" data-url="${esc(g.url)}">
      <span class="g2-r1"><span class="pill ${g.result}">${resWord(g.result)}</span><span class="dot ${g.color}" title="You played ${g.color}"></span><span class="g2-opp">${esc(g.opp)} <span class="muted num">(${g.oppRating})</span></span><span class="g2-date muted num">${H.fmtDate(g.end)}</span></span>
      <span class="g2-r2 muted"><span class="g2-open">${esc(H.openingName(g.opening))}</span>${g.acc != null ? `<span class="num">Accuracy ${Math.round(g.acc)}</span>` : ''}</span>
      ${tagsOf(g, f) ? `<span class="g2-tags">${tagsOf(g, f)}</span>` : ''}</button>`;
  }
  function renderList() {
    const box = $('#g2-list'), x = S.f;
    let list = GAMES.filter(g => passes(g, facts(g), x)).slice().reverse();
    if (x.sort === 'swing') list.sort((a, b) => facts(b).swing - facts(a).swing);
    const all = GAMES.map(g => [g, facts(g)]);
    const n = { threw: all.filter(([, f]) => f.threwWin).length, todo: all.filter(([g]) => !isReviewed(g)).length, quick: all.filter(([, f]) => f.fast.length).length };
    const nx = nextToReview(), wk = gameOfWeek();
    const fams = [...new Set(GAMES.map(fam))].sort();
    const seg = (k, opts) => `<div class="seg" role="group" data-f="${k}">${opts.map(([v, t]) => `<button data-v="${v}" aria-pressed="${x[k] === v}">${t}</button>`).join('')}</div>`;
    const chip = (k, t) => `<button class="g2-chip" data-chip="${k}" aria-pressed="${!!x[k]}">${t} <span class="muted num">${n[k]}</span></button>`;
    const nxCard = nx ? (() => { const f = facts(nx), k = keyCount(f);
      return `<div class="card rec g2-next"><div><span class="eyebrow">Next to review${nx === wk ? ' · your most expensive game this week' : ''}</span><h3>${resWord(nx.result)} vs ${esc(nx.opp)} · ${esc(H.openingName(nx.opening))}</h3><p>${esc(headline(nx, f))} ${plural(k, 'key moment')}, about ${Math.max(1, Math.round(k * 2 / 3))} min · ${ago(nx.end)}</p></div><button class="btn primary" data-open="${esc(nx.url)}">Review it</button></div>`; })()
      : `<div class="card rec g2-next done"><div><span class="eyebrow">Next to review</span><h3>All caught up</h3><p>Every game with a big swing has been reviewed. New games arrive with the next update.</p></div></div>`;
    const wkCard = wk && wk !== nx ? `<div class="card g2-week"><div><span class="eyebrow">Your most expensive game this week</span><h3>${resWord(wk.result)} vs ${esc(wk.opp)} · ${esc(H.openingName(wk.opening))}</h3><p class="small muted">${esc(headline(wk, facts(wk)))}</p></div><button class="btn" data-open="${esc(wk.url)}">${isReviewed(wk) ? 'Look again' : 'Review it'}</button></div>` : '';
    const shown = S.more ? list : list.slice(0, 40);
    box.innerHTML = `<h2>Games</h2>
      ${nxCard}${wkCard}
      <div class="g2-filters">
        ${seg('result', [['all', 'All'], ['win', 'Won'], ['loss', 'Lost'], ['draw', 'Drawn']])}
        ${seg('color', [['all', 'Both'], ['white', 'White'], ['black', 'Black']])}
        <select data-f="opening" aria-label="Opening"><option value="all">All openings</option>${fams.map(o => `<option${o === x.opening ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
        <select data-f="sort" aria-label="Order"><option value="new"${x.sort === 'new' ? ' selected' : ''}>Newest first</option><option value="swing"${x.sort === 'swing' ? ' selected' : ''}>Biggest swing first</option></select>
      </div>
      <div class="g2-chips">${chip('threw', 'Threw away a win')}${chip('todo', 'Not reviewed yet')}${chip('quick', 'Quick-move mistakes')}</div>
      <div class="small muted g2-count">${plural(list.length, 'game')}</div>
      <div class="g2-rows">${shown.map(rowHtml).join('') || '<p class="empty">No games match these filters.</p>'}</div>
      ${list.length > shown.length ? `<button class="btn g2-more" data-act="more">Show all ${list.length}</button>` : ''}`;
  }
  function saveFilters() { H.store.set('g2f', S.f); }

  /* ---------------------------------------------------------------- the game screen: header, graph, board */
  function renderHead() {
    const g = S.g, f = facts(g), book = H.bookDev?.(g) || null, rev = isReviewed(g);
    const tl = timeLine(f);
    const [base, inc] = String(g.tc).split('+');
    $('#g2-head').innerHTML = `<div class="eyebrow">${H.fmtDate(g.end)} · ${+base / 60} min${inc ? ` + ${inc} s` : ''} · you played ${g.color}</div>
      <h3><span class="pill ${g.result}">${g.result === 'win' ? 'You won' : g.result === 'loss' ? 'You lost' : 'Draw'}</span> vs ${esc(g.opp)} <span class="muted num">(${g.oppRating})</span></h3>
      <p class="g2-sum">${esc(headline(g, f))}${tl ? ` ${esc(tl)}` : ''}</p>`;
    // the opening note, the reviewed tick and the links sit under the panel, so the board stays high up on a phone
    $('#g2-extra').innerHTML = `${book ? `<div class="g2-book"><span><b>Opening:</b> you left your ${esc(book.title)} course at <b>${esc(`${Math.ceil(book.ply / 2)}${book.ply % 2 ? '.' : '...'}${book.san}`)}</b>. The course plays <b>${esc((book.courseSans || []).join(' or '))}</b>.</span>${H.openCourse ? `<button class="btn" data-act="course" data-id="${esc(book.id)}">Fix the line</button>` : ''}</div>` : ''}
      <div class="g2-hfoot small"><span class="muted">${esc(H.openingName(g.opening))}${g.acc != null ? ` · accuracy ${Math.round(g.acc)}` : ''}</span><button class="g2-tick" data-act="tick" aria-pressed="${rev}">${rev ? 'Reviewed ✓' : 'Mark as reviewed'}</button><a href="${esc(g.url)}" target="_blank" rel="noopener">Open on chess.com ↗</a></div>`;
  }
  // G3: your winning chance over the game, the key moments 1 2 3, a green band while you were winning, hollow dots for
  // the opponent's blunders, and a strip of your thinking time (red = a mistake made in under 4 seconds)
  function renderGraph() {
    const g = S.g, f = facts(g), N = Math.max(1, g.plies.length), W = myWin(g);
    const x = k => (k / N * 100).toFixed(2), y = w => (100 - w).toFixed(2);
    let band = '', start = -1;
    for (let k = 0; k <= W.length; k++) {
      const on = k < W.length && W[k] >= 85;
      if (on && start < 0) start = k;
      if (!on && start >= 0) { band += `<rect x="${x(start)}" y="0" width="${(Math.max(.6, (k - 1 - start) / N * 100)).toFixed(2)}" height="100" class="g2-band"/>`; start = -1; }
    }
    const pts = W.map((w, k) => `${x(k)},${y(w)}`).join(' ');
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${band}<polygon points="0,100 ${pts} ${x(W.length - 1)},100" class="g2-area"/><line x1="0" x2="100" y1="50" y2="50" class="g2-mid"/><polyline points="${pts}" class="g2-ln"/></svg>`;
    const key = f.moments.filter(m => m.kind !== 'great');
    let marks = '';
    g.plies.forEach((p, i) => { if (!isMine(g, i) && p.lab === 'blunder') marks += `<span class="g2-opp-dot" style="left:${x(i + 1)}%;top:${y(W[i + 1] ?? 50)}%" title="Your opponent blundered on move ${fullNo(i)}"></span>`; });
    f.moments.forEach((m, j) => {
      const lbl = m.kind === 'great' ? '★' : String(key.indexOf(m) + 1);
      marks += `<button class="g2-mk ${m.kind}" data-m="${j}" style="left:${x(m.i + 1)}%;top:${y(W[m.i + 1] ?? 50)}%" aria-label="${m.kind === 'great' ? 'Good moment' : 'Key moment ' + lbl}, move ${fullNo(m.i)}">${lbl}</button>`;
    });
    const mineT = g.plies.map((p, i) => ({ p, i })).filter(({ p, i }) => isMine(g, i) && p.t != null);
    const strip = mineT.length ? `<div class="g2-time" aria-hidden="true">${mineT.map(({ p, i }) => `<i style="left:${x(i + .5)}%;width:${Math.max(.5, 100 / N * 1.4).toFixed(2)}%;height:${Math.max(6, Math.min(p.t, 30) / 30 * 100).toFixed(0)}%"${isBad(p) && p.t < QUICK ? ' class="q"' : ''}></i>`).join('')}</div>` : '';
    $('#g2-graph').innerHTML = `<div class="g2-gwrap"><div class="g2-graph" role="img" aria-label="Your winning chance over the game">${svg}${marks}<span class="g2-cur" id="g2-cur"></span></div>${strip}
      <div class="g2-gkey small muted"><span>Line: your winning chance${band ? ' · <i class="g2-k-band"></i>you were winning' : ''}</span><span><i class="g2-k-mk"></i>key moments</span>${marks.includes('g2-opp-dot') ? '<span><i class="g2-k-opp"></i>their blunders</span>' : ''}${strip ? `<span><i class="g2-k-q"></i>quick mistakes (thinking time below)</span>` : ''}</div></div>`;
    moveCursor();
  }
  function moveCursor() {
    const c = ROOT && $('#g2-cur'); if (!c || !S.g) return;
    const k = S.mode === 'review' && S.rv && S.rv.idx < S.rv.list.length ? S.rv.list[S.rv.idx].i : S.ply;
    c.style.left = (k / Math.max(1, S.g.plies.length) * 100) + '%';
    $$('.g2-mk').forEach(b => b.classList.toggle('on', S.mode === 'review' && S.rv && +b.dataset.m === S.rv.idx));
  }
  function setBoard(opts, shapes = []) {
    const base = { coordinates: true, animation: { duration: 180 }, premovable: { enabled: false }, drawable: { enabled: false, autoShapes: [] } };
    // not viewOnly: chessground only attaches its mouse handling at creation; moves stay off unless a mode turns them on
    if (!cg) cg = H.Chessground($('#g2-board'), { ...base, movable: { color: undefined, free: false }, draggable: { enabled: true } });
    const orient = S.flipped ? (S.g.color === 'white' ? 'black' : 'white') : S.g.color;
    cg.set({ orientation: orient, ...opts });
    curShapes = shapes;
    const w = $('#g2-board').offsetWidth;
    // shown again after being hidden (its size may have been measured as 0 meanwhile): measure again before drawing arrows
    if (w && (w !== lastW || !(cg.state.dom.bounds?.().width > 0))) cg.redrawAll();
    lastW = w;
    cg.set({ drawable: { autoShapes: boardVisible() ? shapes : [] } });   // a hidden board cannot draw arrows (NaN sizes): refresh() adds them later
    $('#g2-evalbar').classList.toggle('flip', orient === 'black');
    syncBar();
  }
  const lock = { movable: { color: undefined, dests: new Map() } };
  function syncBar() {
    const bar = $('#g2-evalbar'), b = $('#g2-board');
    if (b.offsetHeight) bar.style.height = b.offsetHeight + 'px';
  }
  function players(k) {
    const g = S.g, orient = cg?.state.orientation || g.color;
    const clkAt = color => { for (let i = k - 1; i >= 0; i--) if ((i % 2 === 0) === (color === 'white') && g.plies[i].clk != null) return g.plies[i].clk; return +String(g.tc).split('+')[0]; };
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const name = c => c === g.color ? `You <span class="muted num">(${g.myRating})</span>` : `${esc(g.opp)} <span class="muted num">(${g.oppRating})</span>`;
    const top = orient === 'white' ? 'black' : 'white';
    $('#g2-ptop').innerHTML = `<span><span class="dot ${top}"></span> ${name(top)}</span><span class="clk">${fmt(clkAt(top))}</span>`;
    $('#g2-pbot').innerHTML = `<span><span class="dot ${orient}"></span> ${name(orient)}</span><span class="clk">${fmt(clkAt(orient))}</span>`;
  }

  /* ---------------------------------------------------------------- review: the key moments flow (G1, G4, G6) */
  function startReview() {
    const f = facts(S.g);
    S.mode = 'review';
    S.rv ||= { list: f.moments, idx: 0, phase: 'ask', guess: null, gen: 0 };
    renderPlay();
  }
  function renderReview() {
    const g = S.g, rv = S.rv, n = rv.list.length;
    $('#g2-evalbar').hidden = true;
    if (rv.idx >= n) return renderDone();
    const m = rv.list[rv.idx], i = m.i, p = g.plies[i], f = facts(g);
    const key = rv.list.filter(x => x.kind !== 'great'), kno = key.indexOf(m) + 1;
    const eyebrow = m.kind === 'great' ? 'Bonus · a good moment' : `Key moment ${kno} of ${key.length}${m.kind === 'threw' ? ' · where the win slipped' : ''}`;
    const dots = rv.list.map((x, j) => `<i class="${j < rv.idx ? 'done' : j === rv.idx ? 'on' : ''}${x.kind === 'great' ? ' star' : ''}"></i>`).join('');
    players(i);
    const card = cardAt(g, i);
    const fen = g._fens[i], last = i > 0 ? g._mv[i - 1] : undefined, chess = new Chess(fen);
    const panel = $('#g2-panel'), acts = $('#g2-actions');
    if (rv.phase === 'ask') {
      const me = g.color;
      setBoard({ fen, lastMove: last, check: chess.in_check(), turnColor: me, movable: { free: false, color: me, dests: toDests(chess), showDests: true, events: { after: onGuess } } });
      const lead = m.kind === 'great' ? `Move ${fullNo(i)}. Your opponent just played ${esc(g.plies[i - 1].san)}, a blunder.` : `Move ${fullNo(i)}. ${cap(stand(g, i))}.`;
      panel.innerHTML = `<div class="card g2-moment"><div class="g2-mtop"><span class="eyebrow">${eyebrow}</span><span class="g2-dots" aria-hidden="true">${dots}</span></div>
        <h3>${lead}</h3><p>What would you play? Make your move on the board.</p><p class="small muted">Take your time. A wrong guess is not counted anywhere.</p></div>`;
      acts.innerHTML = `<button class="btn primary" data-act="showme" data-key="s">Show me<kbd>S</kbd></button>`;
      $('#g2-tools').innerHTML = '';
      return moveCursor();
    }
    // the answer: your guess, the game move and the best move, in words, with arrows
    const best = g._best[i], mv = g._mv[i];
    const uci = a => a ? a[0] + a[1] : '';
    const okList = (card?.ok?.length ? card.ok : [uci(best)]).map(u => u.slice(0, 4));
    const gs = rv.guess, right = gs && okList.includes(gs.uci), same = gs && gs.uci === uci(mv);
    const shapes = [];
    if (best) shapes.push({ orig: best[0], dest: best[1], brush: 'green' });
    if (mv && m.kind !== 'great' && uci(mv) !== uci(best)) shapes.push({ orig: mv[0], dest: mv[1], brush: 'red' });
    if (gs && !right && !same) shapes.push({ orig: gs.uci.slice(0, 2), dest: gs.uci.slice(2, 4), brush: 'blue' });
    setBoard({ fen, lastMove: last, check: chess.in_check(), ...lock }, shapes);
    let verdict;
    if (m.kind === 'great') verdict = right ? `<div class="g2-verdict good">Yes! ${esc(gs.san)} wins material, and you found it in the game too.</div>` : `<div class="g2-verdict">${gs ? `Not this time. ${esc(gs.san)} is blue. ` : ''}In the game you found <b>${esc(p.san)}</b> (green).</div>`;
    else if (right) verdict = `<div class="g2-verdict good">Yes! ${esc(gs.san)} is the best move.</div>`;
    else if (same) verdict = `<div class="g2-verdict bad">That is what you played in the game.</div>`;
    else verdict = `<div class="g2-verdict">${gs ? `Your move ${esc(gs.san)} is blue. ` : ''}Here is what the engine wanted.</div>`;
    const t = p.t != null ? ` after ${secs(p.t)}${f.usual != null ? ` (your usual: ${secs(f.usual)})` : ''}` : '';
    const body = m.kind === 'great'
      ? `<p>${esc(cap(stand(g, i)))} before your move; after <b>${esc(p.san)}</b> ${stand(g, i + 1)}. When the opponent blunders, look for the capture or threat it allows.</p>`
      : `<p>In the game you played <b>${esc(p.san)}</b>${t}. ${card?.why ? esc(card.why) : esc(whatWrong(p))}</p>
         <p>${esc(beforeAfter(g, i))} Best was <b>${esc(p.best)}</b> (green)${uci(mv) !== uci(best) ? ', your game move is red' : ''}.</p>
         ${p.pv ? `<div class="g2-line"><span class="eyebrow">The best line</span>${esc(p.pv)}</div>` : ''}
         ${p.refute ? `<div class="g2-line"><span class="eyebrow">What happens after <b class="g2-san">${esc(p.san)}</b></span>${esc(p.refute)}</div>` : ''}`;
    const done = cardDone(card);
    panel.innerHTML = `<div class="card g2-moment"><div class="g2-mtop"><span class="eyebrow">${eyebrow}</span><span class="g2-dots" aria-hidden="true">${dots}</span></div>
      ${verdict}${gs && !right && !same ? '<p class="small muted" id="g2-guess-eval"></p>' : ''}${body}
      ${card ? `<p class="small muted">${done ? 'Practised ✓ This position is in your Train reviews.' : 'This position is a Train card: practise it and it comes back in your reviews.'}</p>` : ''}</div>`;
    const lastOne = rv.idx === n - 1;
    acts.innerHTML = `${card && H.practise ? `<button class="btn" data-act="practise" data-id="${esc(card.id)}">${done ? 'Practise again' : 'Practise this'}</button>` : ''}<button class="btn primary" data-act="nextm" data-key="n">${lastOne ? 'Finish' : 'Next moment'}<kbd>N</kbd></button>`;
    $('#g2-tools').innerHTML = `<button class="btn" data-act="tryown">Try your own move</button>`;
    moveCursor();
    if (gs && !right && !same && H.engine) guessEval(gs);
  }
  async function guessEval(gs) {
    const rv = S.rv, gen = ++rv.gen;
    const r = await H.engine.go(gs.fenAfter, { movetime: 700 }).catch(() => null);
    const out = ROOT && $('#g2-guess-eval');
    if (!r || !out || rv !== S.rv || gen !== rv.gen) return;
    const mate = r.score.mate !== undefined ? -r.score.mate : undefined, cp = -(r.score.cp || 0);   // the score is for the opponent (to move)
    const w = H.standWords(cp, mate);
    out.textContent = `After your move ${gs.san}: ${w === 'about equal' ? 'it would be about equal' : `you would be ${w}`}.`;
  }
  function onGuess(orig, dest) {
    const rv = S.rv; if (!rv || rv.phase !== 'ask') return;
    const m = rv.list[rv.idx], c = new Chess(S.g._fens[m.i]);
    const mv = c.move({ from: orig, to: dest, promotion: 'q' });
    if (!mv) return renderReview();
    H.sfx.play(mv.captured ? 'capture' : 'move');
    rv.guess = { uci: orig + dest, san: mv.san, fenAfter: c.fen() };
    rv.phase = 'shown';
    const best = S.g._best[m.i], card = cardAt(S.g, m.i), ok = (card?.ok?.length ? card.ok : best ? [best[0] + best[1]] : []).map(u => u.slice(0, 4));
    H.sfx.play(ok.includes(orig + dest) ? 'right' : 'wrong');
    setTimeout(() => { if (S.rv === rv && S.mode === 'review') renderReview(); }, 250);   // let the piece land first
  }
  function renderDone() {
    const g = S.g, rv = S.rv, f = facts(g), fx = fixCards(g);
    setReviewed(g, true);
    renderHeadTick();
    const N = g.plies.length;
    setBoard({ fen: g._fens[N], lastMove: N ? g._mv[N - 1] : undefined, check: new Chess(g._fens[N]).in_check(), ...lock });
    players(N);
    const rows = rv.list.map((m, j) => {
      const p = g.plies[m.i], c = cardAt(g, m.i);
      return `<li><button class="g2-mrow" data-m="${j}"><span class="g2-mno">${m.kind === 'great' ? '★' : j + 1}</span><span><b>Move ${fullNo(m.i)}</b> ${m.kind === 'great' ? `you found ${esc(p.san)}` : `${esc(p.san)} · best was ${esc(p.best)}`}</span></button>${c ? (cardDone(c) ? '<span class="g2-ok">Practised ✓</span>' : H.practise ? `<button class="btn" data-act="practise" data-id="${esc(c.id)}">Practise</button>` : '') : ''}</li>`;
    }).join('');
    const nx = nextToReview();
    $('#g2-panel').innerHTML = `<div class="card g2-moment g2-done"><span class="eyebrow">Review done ✓</span>
      <h3>${rv.list.length ? `${plural(keyCount(f), 'key moment')} looked at` : 'Nothing big to look at'}</h3>
      <p class="small muted">${rv.list.length ? 'Tap a moment to see it again.' : 'You made no big slips in this game. The whole game is one tap away.'}</p>
      ${rows ? `<ol class="g2-mlist">${rows}</ol>` : ''}
      ${fx.length && H.practise ? `<p class="small muted">${plural(fx.length, 'Train card')} from this game, ${fx.filter(x => cardDone(x.c)).length} practised.</p>` : ''}</div>`;
    const todo = fx.filter(x => !cardDone(x.c));
    $('#g2-actions').innerHTML = `${todo.length && H.practise ? `<button class="btn" data-act="practiseall">Practise all ${todo.length} now</button>` : ''}${nx && nx !== g ? `<button class="btn primary" data-act="nextgame" data-url="${esc(nx.url)}">Next game to review</button>` : `<button class="btn primary" data-act="mode" data-mode="game">Whole game</button>`}`;
    $('#g2-tools').innerHTML = nx && nx !== g ? `<button class="btn" data-act="mode" data-mode="game">Whole game</button>` : '';
    moveCursor();
  }
  function renderHeadTick() {
    const b = ROOT && $('[data-act="tick"]'); if (!b || !S.g) return;
    const on = isReviewed(S.g); b.setAttribute('aria-pressed', on); b.textContent = on ? 'Reviewed ✓' : 'Mark as reviewed';
  }
  function practise(id, then) {
    if (!H.practise) return;
    const g = S.g;
    H.practise('mine/' + id, () => { if (S.g === g) { renderPlay(); } then?.(); });
  }
  function practiseAll() {
    const g = S.g, ids = fixCards(g).filter(x => !cardDone(x.c)).map(x => x.c.id);
    const step = k => { if (k >= ids.length || S.g !== g) return; practise(ids[k], () => step(k + 1)); };
    step(0);
  }

  /* ---------------------------------------------------------------- whole game (G2 comments, G3 graph, report) */
  function renderGame() {
    const g = S.g;
    $('#g2-evalbar').hidden = false;
    $('#g2-actions').innerHTML = `<button class="btn narrow" data-act="go" data-k="0" aria-label="First move">⏮</button><button class="btn narrow" data-act="step" data-d="-1" aria-label="Previous move">◀</button><button class="btn primary" data-act="nextmistake" data-key="m">Next mistake<kbd>M</kbd></button><button class="btn narrow" data-act="step" data-d="1" aria-label="Next move">▶</button><button class="btn narrow" data-act="go" data-k="${g.plies.length}" aria-label="Last move">⏭</button>`;
    $('#g2-tools').innerHTML = `<button class="btn" data-act="flip">Flip board</button><button class="btn" data-act="explore">${S.ex ? 'Back to the game' : 'Try your own move'}</button>`;
    $('#g2-panel').innerHTML = `<div class="comment g2-comment" id="g2-comment" aria-live="polite"></div><div class="movelist g2-moves" id="g2-moves"></div>
      <details class="card g2-report"${S.repOpen ? ' open' : ''}><summary><b>More about this game</b> <span class="muted small">you vs your opponent</span></summary><div id="g2-report"></div></details>
      <p class="small muted g2-keys">Arrows: green = the engine's best move, red = the move played when it was a mistake. Keys: ← → to step, M for your next mistake.</p>`;
    renderMoves(); renderReport();
    if (S.ex) exploreBoard(); else goto(S.ply);
  }
  function renderMoves() {
    const g = S.g; let h = '';
    for (let i = 0; i < g.plies.length; i += 2) {
      h += `<div class="no">${i / 2 + 1}.</div>`;
      for (const j of [i, i + 1]) {
        if (j >= g.plies.length) { h += '<span></span>'; continue; }
        const p = g.plies[j], sym = { blunder: '??', mistake: '?', inaccuracy: '?!' }[p.lab] || '';
        h += `<button data-k="${j + 1}" class="${isMine(g, j) ? 'mine' : ''}">${esc(p.san)}${sym ? `<span class="lb ${p.lab}">${sym}</span>` : ''}</button>`;
      }
    }
    $('#g2-moves').innerHTML = h;
  }
  // the old report, shortened and collapsed: both sides' accuracy and ACPL, move quality, ACPL by phase, time
  function renderReport() {
    const g = S.g, side = mine => g.plies.filter((p, i) => isMine(g, i) === mine);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, f0 = v => v == null ? '–' : v.toFixed(0);
    const acc = l => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * l) - 3.1669));
    const accOf = arr => { const a = arr.map(p => acc(p.loss || 0)); if (!a.length) return null; return (avg(a) + a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0)) / 2; };
    const cat = p => p.lab ? p.lab : p.best === p.san ? 'best' : 'good';
    const me = side(true), op = side(false), count = (arr, c) => arr.filter(p => cat(p) === c).length;
    const cats = [['best', 'Best move'], ['good', 'Good move'], ['inaccuracy', 'Inaccuracy'], ['mistake', 'Mistake'], ['blunder', 'Blunder']];
    const phases = ['opening', 'middlegame', 'endgame'].filter(ph => g.plies.some(p => p.ph === ph));
    const ph = (arr, k) => f0(avg(arr.filter(p => p.ph === k && p.cpl != null).map(p => p.cpl)));
    const tm = arr => arr.filter(p => p.t != null), slow = tm(me).reduce((a, b) => (!a || b.t > a.t ? b : a), null);
    $('#g2-report').innerHTML = `<div class="g2-four">
        <div><span class="eyebrow">Your accuracy</span><b class="num">${f0(accOf(me))}</b></div><div><span class="eyebrow">Their accuracy</span><b class="num">${f0(accOf(op))}</b></div>
        <div><span class="eyebrow">Your <button class="gl" data-term="acpl">ACPL</button></span><b class="num">${f0(g.acpl)}</b></div><div><span class="eyebrow">Their ACPL</span><b class="num">${f0(g.acplOpp)}</b></div></div>
      <table class="g2-table"><thead><tr><th>Move quality</th><th class="r">You</th><th class="r">${esc(g.opp)}</th></tr></thead><tbody>${cats.map(([c, nm]) => `<tr><td><span class="g2-q q-${c}"></span>${nm}</td><td class="r">${count(me, c)}</td><td class="r">${count(op, c)}</td></tr>`).join('')}</tbody></table>
      ${me.some(p => p.cpl != null) ? `<table class="g2-table"><thead><tr><th>ACPL by phase</th><th class="r">You</th><th class="r">${esc(g.opp)}</th></tr></thead><tbody>${phases.map(k => `<tr><td>${cap(k)}</td><td class="r">${ph(me, k)}</td><td class="r">${ph(op, k)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${tm(me).length ? `<p class="small" style="margin:8px 0 0">You used ${f0(avg(tm(me).map(p => p.t)))} s per move on average (opponent ${f0(avg(tm(op).map(p => p.t)))} s).${slow ? ` Longest think: ${f0(slow.t)} s on ${moveNo(g.plies.indexOf(slow))}${esc(slow.san)}.` : ''}</p>` : ''}`;
  }
  function goto(k) {
    const g = S.g; if (!g) return;
    if (S.ex) endExplore();
    S.ply = Math.max(0, Math.min(g.plies.length, k));
    const ply = S.ply, shapes = [];
    if (ply > 0) {
      const p = g.plies[ply - 1];
      if (p.lab && g._best[ply - 1] && p.best !== p.san) {
        shapes.push({ orig: g._best[ply - 1][0], dest: g._best[ply - 1][1], brush: 'green' });
        if (p.lab !== 'inaccuracy' && g._mv[ply - 1]) shapes.push({ orig: g._mv[ply - 1][0], dest: g._mv[ply - 1][1], brush: 'red' });
      }
    }
    setBoard({ fen: g._fens[ply], lastMove: ply > 0 ? g._mv[ply - 1] || undefined : undefined, check: new Chess(g._fens[ply]).in_check(), ...lock }, shapes);
    const W = myWin(g), w = W[ply] ?? 50;
    $('#g2-evalbar span').style.height = (g.color === 'white' ? w : 100 - w) + '%';
    players(ply);
    $$('#g2-moves button').forEach(b => b.classList.toggle('cur', +b.dataset.k === ply));
    const cb = $(`#g2-moves button[data-k="${ply}"]`), ml = $('#g2-moves');
    if (cb && ml) { const t = cb.offsetTop - ml.offsetTop; if (t < ml.scrollTop || t > ml.scrollTop + ml.clientHeight - 30) ml.scrollTop = t - 100; }
    if (!cb && ml && ply === 0) ml.scrollTop = 0;
    moveCursor();
    renderComment();
  }
  function renderComment() {
    const g = S.g, box = $('#g2-comment'), ply = S.ply; if (!box) return;
    if (ply === 0) { box.className = 'comment g2-comment'; box.innerHTML = `<div class="head">Starting position</div><div class="small muted">Step through with ▶, or jump to your next mistake. Tap the graph to jump anywhere.</div>`; return; }
    const i = ply - 1, p = g.plies[i], mine = isMine(g, i), mv = `${moveNo(i)} ${esc(p.san)}`;
    const nums = `<div class="g2-nums small muted"${S.nums ? '' : ' hidden'}>${p.lab ? `Winning chance −${(p.loss || 0).toFixed(0)}% · lost ${(p.cpl || 0).toFixed(0)} cp · ` : ''}<button class="gl" data-term="eval">eval</button> ${esc(H.evalText(evalAt(g, ply)))}${p.t != null ? ` · ${mine ? 'you' : 'they'} spent ${secs(p.t)}` : ''}${p.clk != null ? `, ${Math.floor(p.clk / 60)}:${String(Math.floor(p.clk % 60)).padStart(2, '0')} left` : ''}</div>`;
    const tog = `<button class="linkbtn g2-ntog" data-act="nums">${S.nums ? 'Hide numbers' : 'Numbers'}</button>`;
    if (!p.lab) {
      box.className = 'comment ok g2-comment';
      box.innerHTML = `<div class="head">${mv} <span class="muted small" style="font-weight:400">· ${mine ? 'You' : esc(g.opp)}</span></div><div class="small">${p.best === p.san ? 'The engine\'s top choice.' : 'A good move.'} ${cap(stand(g, ply))}.</div>${nums}${tog}`;
      return;
    }
    const word = { blunder: 'Blunder', mistake: 'Mistake', inaccuracy: 'Inaccuracy' }[p.lab];
    const card = mine ? cardAt(g, i) : null;
    box.className = 'comment g2-comment ' + p.lab;
    box.innerHTML = `<div class="head">${mv} · ${word}${mine ? '' : ' by your opponent'}</div>
      <div>${esc(card?.why || whatWrong(p))} ${esc(beforeAfter(g, i))}</div>
      <div style="margin-top:4px">Better was <strong>${esc(p.best)}</strong>.${mine && p.t != null && p.t < QUICK && isBad(p) ? ` <span class="small" style="color:var(--mistake)">You played it in ${secs(p.t)}.</span>` : ''}</div>
      ${p.pv ? `<div class="line">Best line: ${esc(p.pv)}</div>` : ''}${p.refute ? `<div class="line">After ${esc(p.san)}: ${esc(p.refute)}</div>` : ''}
      ${nums}<span class="g2-cfoot">${tog}${card && H.practise ? `<button class="linkbtn" data-act="practise" data-id="${esc(card.id)}">${cardDone(card) ? 'Practise again' : 'Practise this'}</button>` : ''}</span>`;
  }
  function nextMistake() {
    const g = S.g, hit = i => isMine(g, i) && isBad(g.plies[i]);
    for (let i = S.ply; i < g.plies.length; i++) if (hit(i)) return goto(i + 1);
    for (let i = 0; i < S.ply; i++) if (hit(i)) return goto(i + 1);
  }

  /* explore: play your own moves from any point and ask Stockfish (the old "Try your own move") */
  function exploreText(html) {
    const ex = S.ex, box = $('#g2-comment'); if (!box) return;
    let no = Math.floor(ex.base / 2) + 1, white = ex.base % 2 === 0;
    const line = ex.line.map((san, i) => { const t = (white ? `${no}.` : i === 0 ? `${no}...` : '') + san; if (!white) no++; white = !white; return t; }).join(' ');
    box.className = 'comment g2-comment';
    box.innerHTML = `<div class="head">Your own analysis from move ${moveNo(ex.base)}</div>${line ? `<div class="line">${esc(line)}</div>` : ''}<div class="small" style="margin-top:4px">${html}</div>`;
  }
  function exploreBoard({ keep = false, ...extra } = {}) {
    const c = S.ex.chess, turn = c.turn() === 'w' ? 'white' : 'black';
    setBoard({ fen: c.fen(), turnColor: turn, check: c.in_check(), movable: { free: false, color: turn, dests: toDests(c), showDests: true, events: { after: onExploreMove } }, ...extra });
    if (!S.ex.line.length && !keep) exploreText('Make any move on the board, for either side. Stockfish says what it thinks and shows its best reply with a blue arrow.');
  }
  function startExplore() {
    if (!S.g) return;
    S.ex = { chess: new Chess(S.g._fens[S.ply]), line: [], base: S.ply, gen: ++S.gen };
    const b = $('[data-act="explore"]'); if (b) b.textContent = 'Back to the game';
    exploreBoard();
  }
  function endExplore() {
    S.ex = null; S.gen++;
    const b = $('[data-act="explore"]'); if (b) b.textContent = 'Try your own move';
  }
  async function onExploreMove(orig, dest) {
    const ex = S.ex; if (!ex) return;
    const mv = ex.chess.move({ from: orig, to: dest, promotion: 'q' });
    if (!mv) return exploreBoard({ keep: true });
    H.sfx.play(mv.captured ? 'capture' : 'move');
    ex.line.push(mv.san);
    const gen = ex.gen = ++S.gen;
    exploreBoard({ lastMove: [orig, dest], keep: true });
    if (ex.chess.in_checkmate()) return exploreText('Checkmate.');
    if (ex.chess.in_draw() || ex.chess.in_stalemate()) return exploreText('That is a draw.');
    if (!H.engine) return exploreText('Keep playing moves, or go back to the game. (The engine is not available here.)');
    exploreText('Stockfish is thinking…');
    const r = await H.engine.go(ex.chess.fen(), { movetime: 1000, skill: 20 }).catch(() => null);
    if (S.ex !== ex || gen !== ex.gen) return;
    if (!r) return exploreText('The engine could not start. Try reloading the page.');
    const wtm = ex.chess.turn() === 'w', s = r.score;
    const e = s.mate !== undefined ? { m: wtm ? s.mate : -s.mate } : { cp: wtm ? s.cp : -s.cp };
    const best = new Chess(ex.chess.fen()).move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] || 'q' });
    curShapes = best ? [{ orig: best.from, dest: best.to, brush: 'blue' }] : [];
    if (boardVisible()) cg.set({ drawable: { autoShapes: curShapes } });
    const sg = S.g.color === 'white' ? 1 : -1, my = e.m !== undefined ? { mate: sg * e.m } : { cp: sg * e.cp };
    const w = H.standWords(my.cp ?? 0, my.mate);
    $('#g2-evalbar span').style.height = (e.m !== undefined ? (e.m > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, e.cp)))) - 1)) + '%';
    exploreText(`${w === 'about equal' ? 'It is about equal' : `You are ${w}`} <span class="muted">(<button class="gl" data-term="eval">eval</button> ${esc(H.evalText(e))})</span>.${best ? ` Best reply: <strong>${esc(best.san)}</strong> (blue arrow).` : ''} Keep playing moves, or go back to the game.`);
  }

  /* ---------------------------------------------------------------- screens */
  function renderPlay() {
    $$('#g2-modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S.mode));
    $('#g2-play').classList.toggle('g2-is-game', S.mode === 'game');
    renderHead(); renderGraph();
    if (S.mode === 'review') renderReview(); else renderGame();
  }
  function show(which) {
    S.screen = which === 'play' && S.g ? 'play' : 'list';
    if (S.screen === 'list') { S.ex = null; S.gen++; try { cg?.set({ drawable: { autoShapes: [] } }); } catch {} }
    $('#g2-list').hidden = S.screen !== 'list'; $('#g2-play').hidden = S.screen !== 'play';
    if (S.screen === 'list') renderList();
  }
  function open(x, { mode, ply, explore } = {}) {
    const g = typeof x === 'string' ? GAMES.find(q => q.url === x) : x;
    if (!g) return false;
    if (S.g !== g) { S.rv = null; S.flipped = false; S.ply = 0; }
    S.g = g; S.ex = null; S.gen++;
    prep(g);
    S.mode = mode || (ply != null || explore ? 'game' : 'review');
    if (ply != null) S.ply = Math.max(0, Math.min(g.plies.length, ply));
    show('play');
    if (S.mode === 'review') startReview(); else renderPlay();
    if (explore) startExplore();
    window.scrollTo?.({ top: 0 });
    return true;
  }
  // after the tab was hidden (arrows need a visible board) or progress was merged by sync
  function refresh() {
    if (!ROOT) return;
    if (S.screen === 'list') return renderList();
    if (cg && boardVisible()) { cg.redrawAll(); cg.set({ drawable: { autoShapes: curShapes } }); syncBar(); }
    renderHeadTick();
  }
  function filter(x = {}) {
    S.f = { ...S.f, color: 'all', result: 'all', opening: 'all', threw: false, todo: false, quick: false, ...x };
    S.more = false; saveFilters(); show('list');
  }

  /* ---------------------------------------------------------------- events */
  function onClick(e) {
    const t = e.target;
    const row = t.closest('[data-url].g2-row, [data-open]');
    if (row) return open(row.dataset.url || row.dataset.open);
    const sb = t.closest('.seg[data-f] button');
    if (sb) { S.f[sb.parentElement.dataset.f] = sb.dataset.v; S.more = false; saveFilters(); return renderList(); }
    const ch = t.closest('[data-chip]');
    if (ch) { S.f[ch.dataset.chip] = !S.f[ch.dataset.chip]; S.more = false; saveFilters(); return renderList(); }
    const mk = t.closest('.g2-mk, .g2-mrow');
    if (mk && S.g) { S.mode = 'review'; S.rv ||= { list: facts(S.g).moments, idx: 0, phase: 'ask', gen: 0 }; S.rv.idx = +mk.dataset.m; S.rv.phase = 'ask'; S.rv.guess = null; S.ex = null; return renderPlay(); }
    const gr = t.closest('.g2-graph');
    if (gr && S.g) {
      const r = gr.getBoundingClientRect(), k = Math.round((e.clientX - r.left) / r.width * S.g.plies.length);
      S.mode = 'game'; S.ply = Math.max(0, Math.min(S.g.plies.length, k)); S.ex = null; return renderPlay();
    }
    const mvb = t.closest('#g2-moves button[data-k]');
    if (mvb) return goto(+mvb.dataset.k);
    const b = t.closest('[data-act]'); if (!b) return;
    const g = S.g, rv = S.rv;
    switch (b.dataset.act) {
      case 'more': S.more = true; return renderList();
      case 'back': return show('list');
      case 'mode': S.mode = b.dataset.mode; S.ex = null; if (S.mode === 'review') return startReview(); return renderPlay();
      case 'showme': if (rv) { rv.phase = 'shown'; rv.guess = null; renderReview(); } return;
      case 'nextm': if (rv) { rv.idx++; rv.phase = 'ask'; rv.guess = null; renderReview(); window.scrollTo?.({ top: 0, behavior: 'smooth' }); } return;
      case 'tryown': if (rv && rv.idx < rv.list.length) { S.mode = 'game'; S.ply = rv.list[rv.idx].i; renderPlay(); startExplore(); } return;
      case 'practise': return practise(b.dataset.id);
      case 'practiseall': return practiseAll();
      case 'nextgame': return open(b.dataset.url);
      case 'tick': setReviewed(g, !isReviewed(g)); return renderHeadTick();
      case 'course': return H.openCourse?.(b.dataset.id);
      case 'go': return goto(+b.dataset.k);
      case 'step': return goto(S.ply + +b.dataset.d);
      case 'nextmistake': return nextMistake();
      case 'flip': S.flipped = !S.flipped; return S.ex ? exploreBoard({ keep: true }) : goto(S.ply);
      case 'explore': if (S.ex) { endExplore(); goto(S.ply); } else startExplore(); return;
      case 'nums': S.nums = !S.nums; H.store.set('g2nums', S.nums); return renderComment();
    }
  }
  function onChange(e) {
    const s = e.target.closest('select[data-f]'); if (!s) return;
    S.f[s.dataset.f] = s.value; S.more = false; saveFilters(); renderList();
  }
  function onKey(e) {
    if (!ROOT || ROOT.offsetParent === null || S.screen !== 'play' || S.mode !== 'game') return;
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft') { goto(S.ply - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { goto(S.ply + 1); e.preventDefault(); }
  }

  /* ================================================================ init + API */
  function init({ root, data = {}, hooks = {} }) {
    ROOT = root;
    Object.assign(H, Object.fromEntries(Object.entries(hooks).filter(([, v]) => v != null)));
    if (!H.Chessground || !H.record || !H.progress) throw new Error('G2.init needs hooks.Chessground, hooks.record and hooks.progress');
    for (const k of KINDS) H.progress[k] ||= {};
    GAMES = (data.games || H.games || []).filter(g => g && Array.isArray(g.plies) && g.plies.length);
    S.f = { ...S.f, ...H.store.get('g2f', {}) };
    S.nums = !!H.store.get('g2nums', false);
    if (!ROOT.dataset.g2) {
      ROOT.dataset.g2 = '1';
      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('change', onChange);
      ROOT.addEventListener('toggle', e => { if (e.target.matches?.('details.g2-report')) S.repOpen = e.target.open; }, true);
      document.addEventListener('keydown', onKey);
      addEventListener('resize', () => { if (cg && boardVisible()) { cg.redrawAll(); syncBar(); } });
    }
    show('list');
    return api;
  }
  const GLOSSARY = [
    ['keymoment', 'Key moment', 'One of the 2–3 moves that decided a game: your biggest drops in winning chance (15% or more, at least 6 moves apart), always including the move where a winning position slipped away. A review asks you to find the better move first, then shows it.'],
  ];
  const api = {
    init, show, open, refresh, filter, facts, headline: g => headline(g, facts(g)), nextToReview, gameOfWeek, isReviewed, KINDS, GLOSSARY,
    get cg() { return cg; }, get screen() { return S.screen; }, get game() { return S.g; },
    test: { state: () => ({ screen: S.screen, mode: S.mode, ply: S.ply, rv: S.rv && { idx: S.rv.idx, phase: S.rv.phase, n: S.rv.list.length }, ex: !!S.ex }), headline, whatWrong },
    get hooks() { return H; },
  };
  return api;
})();
