/* ============================================================================================
   O2 core: the Chessable-style Openings tab (home, course page, trainer, spaced repetition, move tree)
   Spec: openings2/BLUEPRINT.md sections 3-5. Plain script, no imports; everything lives inside the
   O2 object, so it can be pasted into the app's module script (placeholder O2_JS) without name clashes.

   INTEGRATION (for T7)
   1. Markup: inline ui/o2.html inside #view-openings (placeholder O2_HTML); CSS: ui/o2.css (placeholder O2_CSS).
   2. Data: fetch('courses2.json') -> pass as `data`. Add O2.KINDS (o2c o2l o2g o2t o2m o2d) to the app's KINDS.
   3. Call once, after progress/sync are set up:
        O2.init({
          root: document.getElementById('o2'),     // the element from o2.html
          data: COURSES2,                           // compiled data/courses2.json ({v:2, courses:[...]})
          hooks: {
            Chessground,                            // board factory: Chessground(el, config) -> api (required)
            record,                                 // record(kind, id, value): stamps t + syncs (required)
            progress,                               // the app's live progress object; O2 reads progress.o2c etc. (required)
            store,                                  // {get(k, d), set(k, v)} with the 'ct.' prefix (UI prefs; optional)
            sfx,                                    // sfx.play('move'|'capture'|'right'|'wrong'|'done'), sfx.on (optional)
            confetti,                               // () => void (optional)
            statsAt,                                // fen -> {n, m:[[san, count, score]]} | null (Lichess 1200-1600; optional)
            games: GAMES,                           // analysis.json games, used for "your games" counts in the tree (optional)
            engine,                                 // engine.go(fen,{movetime}) -> {score:{cp|mate}} for the eval bar (optional)
            statsHere: ctx => {},                   // T6: opens the "Stats here" drawer; ctx = {c, fen, node} (optional)
            onChange: () => {},                     // called after O2 records progress (e.g. refresh the Today tab; optional)
          }
        });
   4. Entry points: O2.show('home') / O2.show('course', id) when the tab opens; O2.startDaily() for the Today task;
      O2.dueSummary() -> {n, mins, byCourse:{id:n}} for Today/home badges; O2.refresh() after sync merged new progress
      (call it from onProgressChanged); O2.GLOSSARY: [id, title, text] rows to append to the app's GLOSSARY
      (comments link these words with <button class="gl" data-term=id>, handled by the app's glossary listener).
   5. Extension points for o2stats.js (T6): O2.addSection({id, label, render(course, el)}) adds a course-page tab;
      O2.addHomeBlock(el => {}) fills #o2-home-extra; O2.playScript({...}) runs a trap / fix-it / model drill in the
      trainer; O2.srs (get, answer, isDue, ...) and O2.posKey, O2.courses() for read access.
   Clock: O2.now() honours ?o2now=<ms> or localStorage ct.o2now (time travel for tests; the clock keeps ticking from it).
   ============================================================================================ */
const O2 = (() => {
  'use strict';
  const DAY = 86400000;
  const KINDS = ['o2c', 'o2l', 'o2g', 'o2t', 'o2m', 'o2d'];
  const IV = [0, 1, 3, 7, 14, 30, 90, 180];          // days until the next review, by level (L1 = next day; user decision 2026-11-12)
  const MAXLV = 7, MATURE = 4, CAP = 60;
  const LEVEL_NAME = ['New', 'Learning', 'Bronze', 'Silver', 'Gold'];
  const H = {                                         // hooks; replaced in init()
    Chessground: null, record: null, progress: null,
    store: { get(k, d) { try { const v = localStorage.getItem('ct.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch {} } },
    sfx: { on: false, play() {} }, confetti() {}, statsAt: null, games: null, engine: null, statsHere: null, onChange: null,
  };
  let COURSES = [], ROOT = null, DRAFT = false;
  const sections = [], homeBlocks = [];

  /* ---------------------------------------------------------------- small helpers */
  const $ = (s, r = ROOT) => r.querySelector(s);
  const $$ = (s, r = ROOT) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/[+#!?]/g, '');
  const posKey = fen => fen.split(' ').slice(0, 3).join(' ') + ' -';
  const plyLabel = ply => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'}`;
  const moveLabel = (ply, san) => plyLabel(ply) + san;
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const pct = x => `${Math.round(x * 100)}%`;
  const BRUSH = { g: 'green', r: 'red', b: 'blue', y: 'yellow' };
  const parseShape = s => { const m = /^(?:([rgby]):)?([a-h][1-8])(?:-([a-h][1-8]))?$/.exec(s || ''); return m ? (m[3] ? { orig: m[2], dest: m[3], brush: BRUSH[m[1] || 'g'] } : { orig: m[2], brush: BRUSH[m[1] || 'g'] }) : null; };
  const shapes = arr => (arr || []).map(x => typeof x === 'string' ? parseShape(x) : x).filter(Boolean);
  const toDests = chess => { const d = new Map(); for (const m of chess.moves({ verbose: true })) { if (!d.has(m.from)) d.set(m.from, []); d.get(m.from).push(m.to); } return d; };
  const dedupe = list => { const seen = new Set(); return list.filter(s => { const k = s.orig + (s.dest || ''); if (seen.has(k)) return false; seen.add(k); return true; }); };

  /* ---------------------------------------------------------------- clock (time travel: ?o2now=<ms> or ct.o2now) */
  let ovRaw = null, ovT0 = 0;
  function now() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('o2now'); } catch {}
    if (v == null) { try { v = localStorage.getItem('ct.o2now'); } catch {} }
    if (v == null || v === '' || v === 'null' || isNaN(+v)) { ovRaw = null; return Date.now(); }
    if (v !== ovRaw) { ovRaw = v; ovT0 = Date.now(); }
    return +v + (Date.now() - ovT0);
  }
  const endOfDay = (t = now()) => { const d = new Date(t); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const dayKey = (t = now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function whenText(t) {
    const e = endOfDay();
    if (t <= e) return 'today';
    if (t <= e + DAY) return 'tomorrow';
    const d = Math.ceil((t - e) / DAY);
    if (d < 7) return `in ${d + 0} days`;
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function agoText(t) {
    const d = Math.floor((endOfDay() - t) / DAY);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  }

  /* ---------------------------------------------------------------- glossary (allowed jargon, BLUEPRINT Q18) */
  const GLOSSARY = [
    ['fork', 'Fork', 'One piece attacks two enemy pieces at the same time, so your opponent can save only one of them.', /\bforks?\b/i],
    ['pin', 'Pin', 'A piece cannot move without exposing a more valuable piece (or the king) behind it.', /\bpin(?:s|ned)?\b/i],
    ['skewer', 'Skewer', 'Like a pin the other way round: a valuable piece is attacked, moves away, and the piece behind it is lost.', /\bskewers?\b/i],
    ['outpost', 'Outpost', 'A square in or near the enemy camp where your piece (usually a knight) cannot be chased away by a pawn.', /\boutposts?\b/i],
    ['bishoppair', 'Bishop pair', 'Having both bishops while your opponent has traded one. In open positions the two bishops together are very strong.', /\bbishop pair\b/i],
    ['openfile', 'Open file', 'A column with no pawns on it. Rooks love open files: they can go all the way into the enemy camp.', /\bopen files?\b/i],
    ['pawnbreak', 'Pawn break', 'A pawn move that attacks the opponent\'s pawn chain to open lines for your pieces, for example ...c5 against a pawn on d4.', /\bpawn breaks?\b/i],
    ['tempo', 'Tempo', 'One move of time. "Winning a tempo" means developing while your opponent wastes a move, for example by attacking a piece that must move away.', /\btempo(?:s|i)?\b/i],
    ['fianchetto', 'Fianchetto', 'Developing a bishop on the long diagonal from g2/b2 (or g7/b7) after moving the knight\'s pawn one square.', /\bfianchetto(?:ed)?\b/i],
    ['minority', 'Minority attack', 'Pushing two pawns (often b- and a-pawn) against three to create a weak pawn in the opponent\'s camp.', /\bminority attack\b/i],
    ['isolated', 'Isolated pawn', 'A pawn with no friendly pawns on the files next to it. Only pieces can defend it, so it is often a target.', /\bisolated pawns?\b/i],
    ['transposition', 'Transposition', 'Reaching the same position by a different move order. The course knows the position, whatever order the moves came in.', /\btranspos(?:ition|es|e)\b/i],
    ['development', 'Development', 'Bringing your knights and bishops off the back rank and castling, so your pieces take part in the game.', /\b(?:development|develops?)\b/i],
    ['pawnchain', 'Pawn chain', 'Pawns standing diagonally next to each other, each one protecting the next (for example d4-e5 or c6-d5-e6). You attack a chain at its base, the pawn at the back.', /\bpawn chains?\b/i],
    ['pawnstorm', 'Pawn storm', 'Pushing several pawns towards the enemy king to open lines for an attack. Usually done when the kings have castled on opposite sides.', /\bpawn storms?\b/i],
    ['clamp', 'Clamp', 'Pawns or pieces that stop the opponent\'s key pawn moves, so their pieces stay cramped and they cannot free their position.', /\bclamp(?:s|ed)?\b/i],
    ['gambit', 'Gambit', 'Giving up a pawn (sometimes more) early in the game to get faster development or an attack in return.', /\bgambits?\b/i],
    ['hole', 'Hole', 'A square that no pawn can protect any more. An enemy piece placed there can never be chased away by a pawn.', /\bholes?\b/i],
    ['blockade', 'Blockade', 'Putting a piece (ideally a knight) right in front of an enemy pawn so it cannot move forward.', /\bblockad(?:e|es|ed|ing)\b/i],
    ['theory', 'Theory', 'The moves that strong players and books have already worked out for an opening. "A lot of theory" means many moves to memorise.', /\btheory\b/i],
    ['french', 'French Defence', 'The opening 1.e4 e6 2.d4 d5. Black\'s pawn on e6 locks in the light-squared bishop; the usual fights are about White\'s pawn on e5 and Black\'s ...c5.', /\bFrench Defen[cs]e\b/],
    ['initiative', 'Initiative', 'Being the one who makes threats, so your opponent has to react instead of following their own plan.', /\binitiative\b/i],
  ];
  function rich(text) {
    let s = esc(text || '');
    const used = new Set();
    for (const [id, , , re] of GLOSSARY) {
      if (used.has(id)) continue;
      s = s.replace(re, m => { used.add(id); return `<button class="gl" data-term="${id}">${m}</button>`; });
    }
    return s.replace(/\(\((.+?)\)\)/g, (_, v) => `<span class="o2-var">${v}</span>`);
  }

  /* ---------------------------------------------------------------- data preparation */
  function prep(c) {
    c.lineById = new Map(c.lines.map(l => [l.id, l]));
    c.cardById = new Map(c.cards.map(k => [k.id, k]));
    c.order = c.chapters.flatMap(ch => ch.lines).filter(id => c.lineById.has(id));
    c.orderIdx = new Map(c.order.map((id, i) => [id, i]));
    c.chOf = new Map(); c.chapters.forEach(ch => ch.lines.forEach(id => c.chOf.set(id, ch)));
    c.seq = {}; c.children = new Map(); c.linesOf = new Map();
    for (const l of c.lines) {
      const chess = new Chess(), seq = [];
      for (const id of l.nodes) {
        const n = c.nodes[id];
        if (!n) { console.warn('O2: missing node', c.id, l.id, id); break; }
        const fen = chess.fen(), mv = chess.move(n.san, { sloppy: true });
        if (!mv) { console.warn('O2: illegal move in data', c.id, l.id, n.san); break; }
        seq.push({ id, n, fen, from: mv.from, to: mv.to, san: mv.san, ply: n.ply || seq.length + 1, after: chess.fen() });
        const k = posKey(fen);
        if (!c.children.has(k)) c.children.set(k, []);
        if (!c.children.get(k).includes(id)) c.children.get(k).push(id);
        if (!c.linesOf.has(id)) c.linesOf.set(id, []);
        if (!c.linesOf.get(id).includes(l.id)) c.linesOf.get(id).push(l.id);
      }
      c.seq[l.id] = seq;
      l.endFen = chess.fen();
      l.mine = seq.filter(s => s.n.mine && c.cardById.has(s.id));
    }
    // cards keep the primary line given by the compiler, but fall back to any line that contains them
    for (const k of c.cards) if (!c.seq[k.line]?.some(s => s.id === k.id)) k.line = (c.linesOf.get(k.id) || [])[0] || k.line;
  }

  /* ---------------------------------------------------------------- SRS (BLUEPRINT section 4) */
  const ckey = (c, id) => `${c.id}/${id}`;
  const srsGet = (c, id) => H.progress.o2c[ckey(c, id)] || null;
  const isDue = s => !!s && s.due <= endOfDay();
  const isDifficult = s => !!s && ((s.w || 0) >= 2 || ((s.n || 0) >= 3 && (s.w || 0) / s.n >= 0.34));
  function put(kind, id, v) { const { t, ...rest } = v; H.record(kind, id, rest); }
  function dayAdd(d) {
    const k = dayKey(), cur = H.progress.o2d[k] || {};
    const v = { rev: cur.rev || 0, new: cur.new || 0, wrong: cur.wrong || 0, ms: cur.ms || 0 };
    for (const [x, n] of Object.entries(d)) v[x] = (v[x] || 0) + n;
    put('o2d', k, v);
  }
  let lastAct = Date.now();
  const spent = () => { const t = Date.now(), d = Math.min(120000, t - lastAct); lastAct = t; return d; };
  /** result: 'ok' (first try), 'hint' (correct with the hint), 'wrong' (wrong move or "Show"); practice: 'pwrong' */
  function srsAnswer(c, id, result) {
    const t = now(), s = srsGet(c, id) || { lv: 0, n: 0, w: 0, s: 0 };
    let { lv = 0, n = 0, w = 0, s: st = 0, due } = s;
    if (result === 'pwrong') { put('o2c', ckey(c, id), { ...s, due: t }); dayAdd({ wrong: 1, ms: spent() }); return; }
    n++;
    if (result === 'ok') { lv = Math.min(MAXLV, Math.max(1, lv + 1)); st++; due = t + IV[lv] * DAY; }
    else if (result === 'hint') { lv = Math.max(1, lv); st++; due = t + IV[lv] * DAY; }
    else { lv = 1; w++; st = 0; due = t + DAY; }
    put('o2c', ckey(c, id), { lv, due, n, w, s: st });
    dayAdd({ rev: 1, wrong: result === 'wrong' ? 1 : 0, ms: spent() });
  }
  function srsLearn(c, ids) {
    const t = now();
    for (const id of ids) put('o2c', ckey(c, id), { lv: 1, due: t + IV[1] * DAY, n: 0, w: 0, s: 0 });
    dayAdd({ new: ids.length, ms: spent() });
  }
  const lineLearned = (c, l) => !!H.progress.o2l[ckey(c, l.id)];
  function lineInfo(c, l) {
    const sts = l.mine.map(s => srsGet(c, s.id));
    const learned = lineLearned(c, l);
    const due = sts.filter(isDue).length, fresh = sts.filter(s => !s).length;
    const minLv = sts.length ? Math.min(...sts.map(s => s?.lv || 0)) : 0;
    const state = !learned ? 'new' : due ? 'due' : minLv >= MATURE ? 'known' : 'learning';
    const badge = !learned ? 0 : minLv >= 5 ? 4 : minLv >= 4 ? 3 : minLv >= 3 ? 2 : 1;
    return { learned, due, fresh, minLv, state, badge, cards: sts.length };
  }
  function courseInfo(c) {
    let fresh = 0, learning = 0, mature = 0, due = 0, last = 0;
    for (const k of c.cards) {
      const s = srsGet(c, k.id);
      if (!s) fresh++; else if ((s.lv || 0) >= MATURE) mature++; else learning++;
      if (isDue(s)) due++;
      if (s?.t > last) last = s.t;
    }
    const learnedLines = c.order.filter(id => lineLearned(c, c.lineById.get(id))).length;
    for (const id of c.order) { const t = H.progress.o2l[ckey(c, id)]?.t || 0; if (t > last) last = t; }
    return { total: c.cards.length, fresh, learning, mature, due, last, learnedLines, lines: c.order.length };
  }
  const nextLine = c => c.order.map(id => c.lineById.get(id)).find(l => !lineLearned(c, l)) || null;
  function dueCards(cs = COURSES) {
    const out = [];
    for (const c of cs) for (const k of c.cards) { const s = srsGet(c, k.id); if (isDue(s)) out.push({ c, id: k.id, due: s.due }); }
    return out.sort((a, b) => a.due - b.due);
  }
  function dueSummary() {
    const d = dueCards(), byCourse = {};
    d.forEach(x => byCourse[x.c.id] = (byCourse[x.c.id] || 0) + 1);
    return { n: d.length, mins: Math.max(1, Math.round(Math.min(d.length, CAP) * 8 / 60)), byCourse };
  }
  function nextDueAfterToday(cs) {
    let best = Infinity; const e = endOfDay();
    for (const c of cs) for (const k of c.cards) { const s = srsGet(c, k.id); if (s && s.due > e && s.due < best) best = s.due; }
    return best === Infinity ? null : best;
  }
  function streak() {
    const days = H.progress.o2d; let n = 0; const d = new Date(now());
    if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
    while (days[dayKey(d.getTime())]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------------------------------------------------------------- your games index (tree) */
  let gIdx = null;
  function gamesIndex() {
    if (gIdx || !H.games) return gIdx;
    gIdx = new Map();
    for (const g of H.games) {
      const b = new Chess();
      for (const p of (g.plies || []).slice(0, 30)) {
        const k = posKey(b.fen()), mv = b.move(p.san, { sloppy: true });
        if (!mv) break;
        if (!gIdx.has(k)) gIdx.set(k, {});
        gIdx.get(k)[mv.san] = (gIdx.get(k)[mv.san] || 0) + 1;
      }
    }
    return gIdx;
  }

  /* ---------------------------------------------------------------- toasts, menus */
  let toastTimer = 0;
  function toast(html, ms = 2600) {
    const t = $('#o2-toast'); t.innerHTML = html; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }
  const play = k => { try { H.sfx?.play?.(k); } catch {} };
  const changed = () => { try { H.onChange?.(); } catch (e) { console.warn(e); } };

  /* ================================================================ screens */
  let screen = 'home', curCourse = null;
  function show(which, id) {
    if (which === 'course' && id) curCourse = COURSES.find(c => c.id === id) || curCourse;
    if (which !== 'player') { stopPlayer(); P.shapes = []; try { cg?.set({ drawable: { autoShapes: [] } }); } catch {} }   // a hidden board must not redraw arrows (NaN sizes)
    screen = which;
    for (const w of ['home', 'course', 'player']) $('#o2-' + w).hidden = w !== which;
    if (which === 'home') renderHome();
    if (which === 'course') renderCourse(curCourse);
    window.scrollTo({ top: 0 });
  }
  function refresh() { if (screen === 'home') renderHome(); else if (screen === 'course') renderCourse(curCourse, true); }

  /* ---- mini boards (thrown away on every re-render) */
  let minis = [];
  function clearMinis() { minis.forEach(m => { try { m.destroy(); } catch {} }); minis = []; }
  function drawMinis(scope) {
    for (const node of $$('[data-mini]', scope)) {
      const [fen, orient, sh] = [node.dataset.mini, node.dataset.orient || 'white', node.dataset.shapes];
      try { minis.push(H.Chessground(node, { fen, orientation: orient, viewOnly: true, coordinates: false, drawable: { enabled: false, autoShapes: sh ? shapes(sh.split(' ')) : [] } })); } catch (e) { console.warn(e); }
    }
  }
  function ring(frac, label) {
    const r = 22, C = 2 * Math.PI * r;
    return `<svg class="o2-ring" viewBox="0 0 56 56" role="img" aria-label="${esc(label)}"><circle cx="28" cy="28" r="${r}" class="bg"/>${frac > 0 ? '' : '<!--'}<circle cx="28" cy="28" r="${r}" class="fg" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/>${frac > 0 ? '' : '-->'}<text x="28" y="32" text-anchor="middle">${Math.round(frac * 100)}%</text></svg>`;
  }
  const stateBar = i => `<div class="o2-statebar" title="${i.mature} mature, ${i.learning} learning, ${i.fresh} new"><i class="m" style="flex:${i.mature}"></i><i class="l" style="flex:${i.learning}"></i><i class="n" style="flex:${i.fresh}"></i></div>`;

  /* ---- A. home */
  function renderHome() {
    clearMinis();
    const sum = dueSummary(), box = $('#o2-home');
    if (!COURSES.length) { box.innerHTML = '<div class="card empty"><h3>No opening courses yet</h3><p class="muted">They arrive with the next update.</p></div>'; return; }
    const anyLearned = COURSES.some(c => c.order.some(id => lineLearned(c, c.lineById.get(id))));
    let banner;
    if (sum.n) {
      banner = `<div class="card o2-banner"><div><span class="eyebrow">Daily review · all courses</span><h3>${plural(sum.n, 'move')} to review · about ${sum.mins} min</h3>
        <p>${Object.entries(sum.byCourse).map(([id, n]) => `${esc(COURSES.find(c => c.id === id)?.title)}: ${n}`).join(' · ')}${sum.n > CAP ? ` · first ${CAP} now, then "keep going"` : ''}</p></div>
        <button class="btn primary" data-act="daily">Start review</button></div>`;
    } else {
      const c = COURSES.find(nextLine), l = c && nextLine(c), nd = nextDueAfterToday(COURSES);
      banner = `<div class="card o2-banner"><div><span class="eyebrow">${anyLearned ? 'Nothing to review today' : 'Start here'}</span>
        <h3>${l ? `${anyLearned ? 'Learn a new line' : `Start with ${esc(c.title)}`}: ${esc(l.title)}` : 'All lines learned'}</h3>
        <p>${nd ? `Next review: ${whenText(nd)}.` : anyLearned ? '' : 'Learn a line by playing it on the board, then it comes back for short reviews.'}</p></div>
        ${l ? `<button class="btn primary" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(l.id)}">${anyLearned ? 'Learn a new line' : 'Start'}</button>` : ''}</div>`;
    }
    const st = streak();
    box.innerHTML = `${DRAFT ? '<div class="o2-ribbon">Draft course data: lines are still being checked</div>' : ''}
      <div class="o2-hhead"><div><h2>Openings</h2><p class="muted">Learn each line once on the board, then keep it fresh with a few moves a day.</p></div>
      ${st ? `<div class="o2-streak"><b>${st}</b>-day streak</div>` : ''}</div>
      ${banner}
      <div class="o2-cgrid">${COURSES.map(c => {
        const i = courseInfo(c), nl = nextLine(c);
        return `<button class="card o2-ccard" data-act="course" data-c="${esc(c.id)}">
          <div class="o2-crow"><div><span class="side-chip ${c.side}">${c.side === 'white' ? 'White' : 'Black'}</span>${c.draft ? ' <span class="o2-kind draft">Draft</span>' : ''}<h3>${esc(c.title)}</h3><span class="small muted">${esc(c.sub || '')}</span></div>${ring(i.total ? i.mature / i.total : 0, `${i.mature} of ${i.total} moves mature`)}</div>
          ${stateBar(i)}
          <div class="o2-meta"><span><b>${i.due}</b> due</span><span><b>${i.learnedLines}</b>/${i.lines} lines</span><span>${i.last ? `Studied ${agoText(i.last)}` : 'Not started'}</span></div>
          <div class="small">${nl ? `Next: <b>${esc(nl.title)}</b>` : 'All lines learned'}</div></button>`;
      }).join('')}</div>
      <div id="o2-home-extra"></div>`;
    const extra = $('#o2-home-extra');
    homeBlocks.forEach(fn => { try { fn(extra); } catch (e) { console.warn(e); } });
  }

  /* ---- B. course page */
  const TABS = [['learn', 'Learn'], ['review', 'Review'], ['ideas', 'Ideas']];
  function renderCourse(c, keepScroll) {
    if (!c) return show('home');
    clearMinis();
    const tabs = [...TABS, ...sections.map(s => [s.id, s.label])];
    let tab = H.store.get('o2tab.' + c.id, 'learn');
    if (!tabs.some(t => t[0] === tab)) tab = 'learn';
    const i = courseInfo(c), nl = nextLine(c);
    const y = window.scrollY;
    $('#o2-course').innerHTML = `
      <div class="backrow"><button class="btn" data-act="home">← All openings</button></div>
      ${c.draft ? '<div class="o2-ribbon">Draft: this course has not passed all checks yet</div>' : ''}
      <div class="o2-chead">
        <div class="o2-ctitle"><span class="side-chip ${c.side}">${c.side === 'white' ? 'You play White' : 'You play Black'}</span><h2>${esc(c.title)}</h2>
          <p class="muted">${esc(c.why || c.sub || '')}</p></div>
        <div class="o2-cstats">${ring(i.total ? i.mature / i.total : 0, 'mature moves')}
          <div><div><b>${i.learnedLines}</b>/${i.lines} lines learned</div><div><b>${i.mature}</b> mature · <b>${i.learning}</b> learning · <b>${i.fresh}</b> new</div>${stateBar(i)}</div></div>
      </div>
      <div class="o2-cact">
        ${i.due ? `<button class="btn primary" data-act="review" data-c="${esc(c.id)}">Review ${plural(i.due, 'move')}</button>` : ''}
        ${nl ? `<button class="btn ${i.due ? '' : 'primary'}" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(nl.id)}">Learn next: ${esc(nl.title)}</button>` : ''}
        <button class="btn" data-act="tree" data-c="${esc(c.id)}">Move tree</button>
      </div>
      <div class="oc-tabs" role="tablist" aria-label="Parts of this course">${tabs.map(([id, lab]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${esc(lab)}</button>`).join('')}</div>
      <div id="o2-tab" role="tabpanel"></div>`;
    const panel = $('#o2-tab');
    if (tab === 'learn') panel.innerHTML = tabLearn(c);
    else if (tab === 'review') panel.innerHTML = tabReview(c);
    else if (tab === 'ideas') panel.innerHTML = tabIdeas(c);
    else { const s = sections.find(s => s.id === tab); try { s.render(c, panel); } catch (e) { console.warn(e); panel.textContent = 'This part could not be shown.'; } }
    drawMinis(panel);
    if (keepScroll) window.scrollTo({ top: y });
  }
  const KIND = { main: 'Main', side: 'Side', punish: 'Punish' };
  const STATE = { new: 'New', learning: 'Learning', due: 'Due', known: 'Known' };
  function reachText(r) {
    if (r == null) return '';
    if (r >= 0.5) return 'You will meet this in most games';
    const n = Math.max(2, Math.round(1 / r));
    return n > 500 ? 'Rare at your level' : `You'll meet this in about 1 game in ${n}`;
  }
  function tabLearn(c) {
    const desk = matchMedia('(min-width: 900px)').matches;
    const nl = nextLine(c);
    return c.chapters.map(ch => {
      const ls = ch.lines.map(id => c.lineById.get(id)).filter(Boolean);
      const done = ls.filter(l => lineLearned(c, l)).length;
      const open = H.store.get(`o2ch.${c.id}.${ch.id}`, true);
      return `<details class="o2-chap" data-ch="${esc(ch.id)}"${open ? ' open' : ''}><summary><span class="t">${esc(ch.title)}</span><span class="small muted">${done}/${ls.length} learned</span>
        <span class="o2-chbar"><i style="width:${ls.length ? done / ls.length * 100 : 0}%"></i></span></summary>
        ${ch.intro ? `<p class="small muted o2-chintro">${rich(ch.intro)}</p>` : ''}
        <div class="o2-lines">${ls.map(l => {
          const i = lineInfo(c, l), r = reachText(l.reach);
          return `<div class="o2-line lv${i.badge}${nl === l ? ' next' : ''}">
            ${desk ? `<div class="o2-mini" data-mini="${esc(l.endFen)}" data-orient="${c.side}"></div>` : ''}
            <div class="o2-lmain"><div class="o2-lt"><span class="medal-dot" title="${LEVEL_NAME[i.badge]}">${i.badge ? (i.badge >= 2 ? '★' : '·') : ''}</span><span class="t">${esc(l.title)}</span></div>
              <div class="o2-lmeta"><span class="o2-kind ${l.kind}">${KIND[l.kind] || esc(l.kind)}</span><span class="status ${i.state}">${STATE[i.state]}${i.state === 'due' ? ` · ${i.due}` : ''}</span><span class="small muted">${plural(i.cards, 'move')}</span>${r ? `<span class="small muted">${r}</span>` : ''}</div></div>
            <div class="o2-lbtn">${!i.learned ? `<button class="btn primary" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Learn</button>`
              : i.due ? `<button class="btn primary" data-act="review-line" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Review</button>`
              : `<button class="btn" data-act="practise-line" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Practise</button>`}
              <button class="btn" data-act="study" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Study</button></div></div>`;
        }).join('') || '<p class="muted small">No lines in this chapter yet.</p>'}</div></details>`;
    }).join('') || '<p class="muted">This course has no lines yet.</p>';
  }
  function tabReview(c) {
    const i = courseInfo(c);
    const diff = c.cards.map(k => ({ k, s: srsGet(c, k.id) })).filter(x => isDifficult(x.s)).sort((a, b) => (b.s.w / b.s.n) - (a.s.w / a.s.n));
    const e = endOfDay(), fc = Array.from({ length: 7 }, () => 0);
    for (const k of c.cards) { const s = srsGet(c, k.id); if (!s) continue; const d = s.due <= e ? 0 : Math.ceil((s.due - e) / DAY); if (d < 7) fc[d]++; }
    const mx = Math.max(1, ...fc);
    const lv = Array.from({ length: MAXLV + 1 }, () => 0); c.cards.forEach(k => lv[srsGet(c, k.id)?.lv || 0]++);
    const mxl = Math.max(1, ...lv);
    const dname = d => d === 0 ? 'Today' : d === 1 ? 'Tmrw' : new Date(now() + d * DAY).toLocaleDateString('en-GB', { weekday: 'short' });
    return `<div class="o2-grid2">
      <div class="card"><span class="eyebrow">Due now</span><h3 class="o2-big">${plural(i.due, 'move')}</h3>
        <p class="small muted">${i.due ? `About ${Math.max(1, Math.round(Math.min(i.due, CAP) * 8 / 60))} min. Moves are asked inside their line, so you see how the position arose.` : (() => { const nd = nextDueAfterToday([c]); return nd ? `Next review ${whenText(nd)}.` : 'Learn a line first; its moves come back the next day.'; })()}</p>
        <div class="controls">${i.due ? `<button class="btn primary" data-act="review" data-c="${esc(c.id)}">Start review</button>` : ''}
        <label class="o2-check"><input type="checkbox" data-act="fromstart"${H.store.get('o2fromstart', false) ? ' checked' : ''}> Play every line from move 1</label></div></div>
      <div class="card"><span class="eyebrow">Next 7 days</span><div class="o2-fc">${fc.map((n, d) => `<div><span class="n">${n || ''}</span><i style="height:${n / mx * 100}%"></i><span class="d">${dname(d)}</span></div>`).join('')}</div></div>
      <div class="card"><span class="eyebrow">Difficult moves</span>
        ${diff.length ? `<p class="small muted">Moves you got wrong more than once. Drilling them does not change their schedule, but a miss makes them due now.</p>
          <div class="o2-diff">${diff.slice(0, 40).map(({ k, s }) => `<button class="o2-drow" data-act="study" data-c="${esc(c.id)}" data-l="${esc(k.line)}" data-id="${esc(k.id)}"><b>${esc(moveLabel(k.ply, k.san))}</b><span class="small muted">${esc(c.lineById.get(k.line)?.title || '')}</span><span class="small">${s.w} wrong of ${s.n}</span></button>`).join('')}</div>
          <div class="controls" style="margin-top:10px"><button class="btn primary" data-act="drill" data-c="${esc(c.id)}">Drill these ${diff.length}</button></div>`
          : '<p class="small muted">No difficult moves yet. A move lands here when you miss it twice.</p>'}</div>
      <div class="card"><span class="eyebrow">Moves by level</span><div class="o2-lv">${lv.map((n, j) => `<div><span>${j ? 'L' + j : 'New'}</span><i style="width:${n / mxl * 100}%"></i><b>${n}</b></div>`).join('')}</div>
        <p class="small muted">A move climbs one level for every right answer: back after 1, 3, 7, 14, 30, 90 and 180 days. Level 4 and up is "mature". A miss sends it back to level 1.</p></div>
    </div>`;
  }
  function tabIdeas(c) {
    const ideas = c.ideas || [], st = c.structures || [];
    if (!ideas.length && !st.length) return '<p class="muted">No ideas for this course yet.</p>';
    const card = (t, text, fen, sh, eyebrow) => `<div class="card o2-idea">${fen ? `<div class="o2-ideab" data-mini="${esc(fen)}" data-orient="${c.side}" data-shapes="${esc((sh || []).join(' '))}"></div>` : ''}
      <div><span class="eyebrow">${eyebrow}</span><h3>${esc(t)}</h3><p>${rich(text)}</p></div></div>`;
    return `<div class="o2-ideas">${ideas.map(x => card(x.t, x.text, x.fen, x.shapes, 'Idea')).join('')}${st.map(x => card(x.t, x.text, x.fen, x.shapes, 'Pawn structure')).join('')}</div>`;
  }

  /* ================================================================ C. trainer */
  let cg = null;
  const CANCEL = Symbol('cancel');
  const P = { gen: 0, c: null, mode: '', chess: null, hist: [], startFen: null, startPly: 0, view: null, expect: null, shapes: [], cont: null, flipped: false, back: null, ctxNode: null, ctxLine: null };
  function stopPlayer() { P.gen++; P.expect = null; P.cont = null; closeMenu(); }
  function begin(c, mode, back) {
    stopPlayer();
    const g = P.gen;
    Object.assign(P, { c, mode, back, hist: [], view: null, shapes: [], startPly: 0, ctxNode: null, ctxLine: null });
    for (const w of ['home', 'course']) $('#o2-' + w).hidden = true;
    $('#o2-player').hidden = false; screen = 'player';
    $('#o2-panel').innerHTML = ''; $('#o2-notes').innerHTML = ''; $('#o2-notes-wrap').hidden = true;
    $('#o2-draft').hidden = !c?.draft;
    window.scrollTo({ top: 0 });
    lastAct = Date.now();
    return () => { if (g !== P.gen) throw CANCEL; };
  }
  async function run(fn) { try { await fn(); } catch (e) { if (e !== CANCEL) { console.error(e); fb(`<b>Something went wrong.</b> <span class="muted">${esc(e.message || e)}</span>`, 'wrong'); } } }
  function head(label, title, done, total) {
    $('#o2-mode').textContent = label; $('#o2-title').textContent = title;
    $('#o2-bar').style.width = total ? Math.min(100, done / total * 100) + '%' : '0';
  }
  function fb(html, cls = '') { const f = $('#o2-fb'); f.className = 'card o2-fb ' + cls; f.innerHTML = html; }
  function resetBoard(fen = null, ply = 0) {
    P.chess = fen ? new Chess(fen) : new Chess(); P.startFen = P.chess.fen(); P.startPly = ply; P.hist = []; P.view = null; P.shapes = [];
    renderChips(); draw();
  }
  function orientation() { const o = P.c?.side || 'white'; return P.flipped ? (o === 'white' ? 'black' : 'white') : o; }
  function draw() {
    if (!P.chess) return;
    const el = $('#o2board');
    if (P.view != null) {
      const h = P.hist[P.view - 1], fen = h ? h.fen : P.startFen, tmp = new Chess(fen);
      const opts = { fen, orientation: orientation(), turnColor: tmp.turn() === 'w' ? 'white' : 'black', check: tmp.in_check(), lastMove: h ? [h.from, h.to] : undefined,
        movable: { color: undefined, dests: new Map() }, drawable: { autoShapes: h?.shapes || [] } };
      if (!cg) cg = H.Chessground(el, opts); else cg.set(opts);
    } else {
      const turn = P.chess.turn() === 'w' ? 'white' : 'black', h = P.hist[P.hist.length - 1];
      const can = !!P.expect || P.mode === 'tree';
      const opts = { fen: P.chess.fen(), orientation: orientation(), turnColor: turn, check: P.chess.in_check(), lastMove: h ? [h.from, h.to] : undefined,
        coordinates: true, animation: { duration: 220 },
        movable: { free: false, color: can ? turn : undefined, dests: can ? toDests(P.chess) : new Map(), showDests: true, events: { after: onUserMove } },
        premovable: { enabled: false }, drawable: { autoShapes: P.shapes } };
      if (!cg) cg = H.Chessground(el, opts); else cg.set(opts);
    }
    evalShow();
    $$('#o2-chips button').forEach(b => b.classList.toggle('cur', +b.dataset.i === (P.view ?? P.hist.length)));
    const back = $('#o2-viewback'); if (back) back.hidden = P.view == null;
  }
  function renderChips() {
    const box = $('#o2-chips');
    box.innerHTML = `<button class="o2-chip start" data-i="0" aria-label="Start position">⌂</button>` + P.hist.map((h, i) => {
      const ply = P.startPly + i + 1;
      return `<button class="o2-chip${h.mine ? ' mine' : ''}" data-i="${i + 1}">${ply % 2 || i === 0 ? `<span class="no">${plyLabel(ply)}</span>` : ''}${esc(h.san)}</button>`;
    }).join('') + `<button class="o2-chip back" id="o2-viewback" hidden>Back to the game ▶</button>`;
    box.scrollLeft = box.scrollWidth;
    draw();
  }
  function pushMove(mv, extra = {}) {
    P.hist.push({ san: mv.san, from: mv.from, to: mv.to, fen: P.chess.fen(), ...extra });
    play(mv.captured ? 'capture' : 'move');
  }
  function playStep(s, extra = {}) {
    const mv = P.chess.move(s.san, { sloppy: true });
    if (!mv) throw new Error('illegal move in course data: ' + s.san);
    pushMove(mv, { mine: !!s.n?.mine, shapes: extra.shapes || [], node: s.id });
    P.view = null; renderChips();
  }
  function silentTo(seq, upto) {        // set up seq[0..upto-1] without animation or sound
    P.chess = new Chess(); P.startFen = P.chess.fen(); P.startPly = 0; P.hist = []; P.view = null; P.shapes = [];
    for (let i = 0; i < upto; i++) { const mv = P.chess.move(seq[i].san, { sloppy: true }); P.hist.push({ san: mv.san, from: mv.from, to: mv.to, fen: P.chess.fen(), mine: !!seq[i].n.mine, node: seq[i].id, shapes: [] }); }
    if (cg) cg.set({ animation: { enabled: false } });
    renderChips();
    if (cg) cg.set({ animation: { enabled: true, duration: 220 } });
  }
  function flash() { const b = $('#o2-shell'); b.classList.remove('o2-flash'); void b.offsetWidth; b.classList.add('o2-flash'); }
  function ask(s, opts = {}) {
    return new Promise(resolve => {
      P.expect = { s, alts: s.n?.alts || [], wrongs: 0, hinted: false, shown: false, resolve, ...opts };
      P.view = null; actions('ask'); draw();
    });
  }
  function onUserMove(orig, dest) {
    if (P.view != null) return draw();
    const t = new Chess(P.chess.fen()), mv = t.move({ from: orig, to: dest, promotion: 'q' });
    if (!mv) return draw();
    if (P.mode === 'tree') return treeMove(mv.san);
    const e = P.expect;
    if (!e) return draw();
    if (norm(mv.san) === norm(e.s.san)) {
      P.expect = null;
      P.chess.move(mv.san);
      pushMove(mv, { mine: true, shapes: [], node: e.s.id });
      P.shapes = []; renderChips();
      e.resolve({ wrongs: e.wrongs, hinted: e.hinted, shown: e.shown });
      return;
    }
    const alt = e.alts.find(a => norm(a.san) === norm(mv.san));
    if (alt) {
      toast(`<b>${esc(mv.san)} is a good move too</b> — the course plays something else here. Try again.${alt.note ? `<br><span class="small">${esc(alt.note)}</span>` : ''}`, 3800);
      setTimeout(draw, 260);
      return;
    }
    e.wrongs++; play('wrong'); flash();
    setTimeout(draw, 260);
    e.onWrong?.(mv.san, e);
  }
  function cont(label = 'Continue') {
    return new Promise(resolve => { P.cont = resolve; actions('cont', label); });
  }
  function doCont() { const r = P.cont; if (r) { P.cont = null; r(); } }
  function moveShapes(s) { return s?.from ? [{ orig: s.from, dest: s.to, brush: 'blue' }] : []; }
  function xShapes(s) {
    return (s.n.x || []).map(x => { const m = new Chess(s.fen).move(x.san, { sloppy: true }); return m ? { orig: m.from, dest: m.to, brush: 'red' } : null; }).filter(Boolean);
  }
  function xNotes(s) {
    return (s.n.x || []).map(x => `<div class="o2-x"><span class="eyebrow">Don't play <span class="o2-san">${esc(plyLabel(s.ply))}${esc(x.san)}</span></span><p>${rich(x.why)}</p></div>`).join('');
  }
  function commentHtml(s, { eyebrow = '', prefix = '' } = {}) {
    const n = s.n;
    return `${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<div class="o2-mv">${prefix}<b>${esc(moveLabel(s.ply, s.san))}</b>${n.key ? ' <span class="o2-key">Key move</span>' : ''}${n.nag && n.nag !== 'sys' && !n.mine ? ` <span class="o2-nag">${esc(n.nag)}</span>` : ''}</div>
      ${n.c ? `<p>${rich(n.c)}</p>` : ''}${n.nag === 'sys' ? '<p class="small muted">A system move: you play it for consistency with the rest of the course.</p>' : ''}`;
  }
  function planHtml(s) { return `<span class="eyebrow">Plan</span><div class="o2-mv"><b>After ${esc(moveLabel(s.ply, s.san))}</b></div><p>${rich(s.n.plan.text)}</p>`; }
  function addNote(s, collapsed = false) {
    const n = s.n;
    if (!n.c && !n.plan) return;
    $('#o2-notes-wrap').hidden = false;
    const d = document.createElement('div');
    d.className = 'o2-note' + (collapsed ? ' collapsed' : '') + (n.mine ? ' mine' : '');
    d.dataset.ply = P.hist.length;
    d.innerHTML = `<b>${esc(moveLabel(s.ply, s.san))}</b> <span>${rich(n.c || '')}</span>${n.plan ? `<div class="o2-pl"><span class="eyebrow">Plan</span> ${rich(n.plan.text)}</div>` : ''}`;
    $('#o2-notes').prepend(d);
  }
  /* action bar: mode-specific buttons + Flip + More */
  function actions(kind, label) {
    const b = [];
    if (kind === 'ask') b.push(['hint', 'Hint', 'H'], ['showmv', 'Show', 'S']);
    if (kind === 'cont') b.push(['cont', label || 'Continue', 'Space', true]);
    if (kind === 'study') b.push(['prev', '◀ Back', '←'], ['next', 'Next ▶', '→', true]);
    if (kind === 'tree') b.push(['tback', '◀ Back', '←']);
    if (kind !== 'none') b.push(['flip', 'Flip', 'F', false, 'narrow'], ['more', 'More', '', false, 'narrow']);
    $('#o2-actions').innerHTML = b.map(([id, lab, key, pri, cls]) => `<button class="btn${pri ? ' primary' : ''}${cls ? ' ' + cls : ''}" data-pa="${id}">${esc(lab)}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('');
  }
  function hint(full) {
    const e = P.expect; if (!e) return;
    if (full) {
      e.shown = true;
      P.shapes = [...moveShapes(e.s), ...shapes(e.s.n.shapes)];
      fb(commentHtml(e.s, { eyebrow: 'The course move', prefix: '' }) + '<p class="small muted">Play it on the board to go on. It counts as a miss.</p>', 'wrong');
    } else {
      e.hinted = true;
      P.shapes = [{ orig: e.s.from, brush: 'yellow' }];
      toast('The circled piece moves.');
    }
    P.view = null; draw();
  }

  /* ---- eval bar (course data first, engine if the app provides one) */
  let evalOn = false, evalGen = 0;
  function evalShow() {
    const bar = $('#o2-evalbar');
    bar.hidden = !evalOn; if (!evalOn || !P.chess) return;
    const h = P.view != null ? P.hist[P.view - 1] : P.hist[P.hist.length - 1];
    const node = h?.node && P.c?.nodes[h.node];
    const fen = h ? h.fen : P.startFen;
    const set = cp => { const w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1); bar.querySelector('span').style.height = w + '%'; bar.title = `About ${(cp / 100).toFixed(1)} pawns for ${cp >= 0 ? 'White' : 'Black'}`; };
    bar.classList.toggle('flip', orientation() === 'black');
    if (node && node.ev != null) return set(node.ev);
    if (!h) return set(20);
    if (!H.engine) return;
    const g = ++evalGen;
    H.engine.go(fen, { movetime: 600, polite: true }).then(r => {
      if (g !== evalGen) return;
      const side = fen.split(' ')[1] === 'w' ? 1 : -1, sc = r.score || {};
      set(sc.mate != null ? side * Math.sign(sc.mate) * 1500 : side * (sc.cp || 0));
    }).catch(() => {});
  }

  /* ---- More menu */
  function openMenu() {
    const m = $('#o2-menu');
    if (!m.hidden) return closeMenu();
    const items = [];
    if (H.statsHere && P.c) items.push(['stats', 'Stats for this position']);
    items.push(['eval', `Eval bar: ${evalOn ? 'on' : 'off'}`]);
    if (P.c && P.mode !== 'tree') items.push(['totree', 'Open in move tree']);
    if (P.mode === 'review') items.push(['fromstart', `Play every line from move 1: ${H.store.get('o2fromstart', false) ? 'on' : 'off'}`]);
    if (H.sfx && 'on' in H.sfx) items.push(['sound', `Sound: ${H.sfx.on ? 'on' : 'off'}`]);
    items.push(['report', 'Report a problem (copies line + position)']);
    m.innerHTML = items.map(([id, t]) => `<button role="menuitem" data-menu="${id}">${esc(t)}</button>`).join('');
    m.hidden = false;
    m.querySelector('button')?.focus();
  }
  function closeMenu() { const m = ROOT && $('#o2-menu'); if (m) m.hidden = true; }
  function curFen() { const h = P.view != null ? P.hist[P.view - 1] : P.hist[P.hist.length - 1]; return h ? h.fen : (P.startFen || new Chess().fen()); }
  function menuAction(id) {
    closeMenu();
    if (id === 'stats') H.statsHere?.({ c: P.c, fen: curFen(), node: P.hist[P.hist.length - 1]?.node ? P.c.nodes[P.hist[P.hist.length - 1].node] : null });
    if (id === 'eval') { evalOn = !evalOn; H.store.set('o2eval', evalOn); evalShow(); }
    if (id === 'fromstart') { H.store.set('o2fromstart', !H.store.get('o2fromstart', false)); toast('Applies from the next line.'); }
    if (id === 'sound') { H.sfx.on = !H.sfx.on; H.store.set('sound', H.sfx.on); }
    if (id === 'totree') {
      const c = P.c, upto = P.view ?? P.hist.length, path = [];
      const b = new Chess();
      for (const h of P.hist.slice(0, upto)) { const kids = c.children.get(posKey(b.fen())) || []; const nid = kids.find(k => norm(c.nodes[k].san) === norm(h.san)); if (!nid) break; path.push(nid); b.move(h.san, { sloppy: true }); }
      openTree(c, path);
    }
    if (id === 'report') {
      const txt = `Openings problem · course ${P.c?.id || '-'} · line ${P.ctxLine || '-'} · mode ${P.mode} · FEN ${curFen()}`;
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Copied. Paste it to Claude with what looks wrong.'), () => toast(esc(txt), 8000));
    }
  }

  /* ---- learn mode (per line): walk through, then from memory */
  function startLearn(c, l) {
    run(async () => {
      const chk = begin(c, 'learn', () => show('course', c.id));
      P.ctxLine = l.id;
      const seq = c.seq[l.id], idx = c.orderIdx.get(l.id) ?? 0;
      let fresh = new Set(l.mine.filter(s => !srsGet(c, s.id)).map(s => s.id));
      const relearn = !fresh.size;
      if (relearn) fresh = new Set(l.mine.map(s => s.id));
      const label = `Learn · Line ${idx + 1} of ${c.order.length}`;
      head(label, l.title, 0, fresh.size * 2);
      resetBoard();
      fb(`<span class="eyebrow">Step 1 of 2 · walk through</span><p>${rich(l.intro || '')}</p><p class="small muted">${relearn ? 'You know these moves already: this is a refresher and does not change your reviews.' : `${plural(fresh.size, 'new move')} to learn. Follow the blue arrow and read why each move is played.`}</p>`);
      await cont('Start'); chk();
      let k = 0;
      for (const s of seq) {
        if (!s.n.mine) {
          await wait(550); chk();
          playStep(s, { shapes: shapes(s.n.shapes) });
          if (s.n.c) { fb(commentHtml(s, { eyebrow: 'Opponent' })); P.shapes = shapes(s.n.shapes); draw(); addNote(s); }
          continue;
        }
        if (!fresh.has(s.id)) {            // known from another line: auto-played, note collapsed
          await wait(400); chk();
          playStep(s); addNote(s, true);
          fb(`<span class="eyebrow">You know this one</span><div class="o2-mv"><b>${esc(moveLabel(s.ply, s.san))}</b></div><p class="small muted">Played for you: it is in a line you already learned. Tap it in the notes to read why.</p>`);
          continue;
        }
        k++; head(`${label} · move ${k} of ${fresh.size}`, l.title, k - 1, fresh.size * 2);
        fb(commentHtml(s, { eyebrow: 'Your move · play the blue arrow' }) + xNotes(s));
        P.shapes = dedupe([...moveShapes(s), ...shapes(s.n.shapes), ...xShapes(s)]);
        const xs = (s.n.x || []).map(x => norm(x.san));
        await ask(s, {
          onWrong: san => {
            const isX = xs.includes(norm(san));
            fb(`<span class="eyebrow" style="color:var(--blunder)">${isX ? `Don't play <span class="o2-san">${esc(san)}</span>` : 'Not this one'}</span>${isX ? `<p>${rich(s.n.x.find(x => norm(x.san) === norm(san)).why)}</p>` : '<p>Follow the blue arrow: that is the course move.</p>'}` + commentHtml(s), 'wrong');
          },
        }); chk();
        play('right');
        P.shapes = shapes(s.n.shapes); P.hist[P.hist.length - 1].shapes = P.shapes; draw();
        addNote(s);
        fb(commentHtml(s, { eyebrow: '✓ Right', prefix: '' }), 'right');
        if (s.n.plan) {
          await wait(500); chk();
          fb(planHtml(s), 'plan'); P.shapes = shapes(s.n.plan.shapes); draw();
          await cont(); chk();
        }
        if (s.n.quiz) { await quiz(s.n.quiz); chk(); }
      }
      // step 2: from memory, only the new moves are asked; misses repeat the pass
      let todo = new Set(fresh), pass = 0, k2 = 0;
      while (todo.size && pass < 3) {
        pass++;
        fb(`<span class="eyebrow">Step 2 of 2 · from memory</span><h3>${pass === 1 ? 'Now play it without arrows' : `Once more: ${plural(todo.size, 'move')} to fix`}</h3><p class="small muted">The opponent's moves and the moves you already know are played for you. A wrong move shows the note again.</p>`);
        actions('cont', 'Start'); await cont('Start'); chk();
        resetBoard();
        const last = Math.max(...seq.map((s, i) => todo.has(s.id) ? i : -1));
        const missed = new Set();
        for (let i = 0; i <= last; i++) {
          const s = seq[i];
          if (!s.n.mine || !todo.has(s.id)) { await wait(todo.has(s.id) ? 0 : 380); chk(); playStep(s); continue; }
          fb(`<span class="eyebrow">Your move · from memory</span><p>What does the course play here?</p>`);
          P.shapes = []; draw();
          const r = await ask(s, {
            onWrong: (san, e) => {
              P.shapes = dedupe([...moveShapes(s), ...shapes(s.n.shapes)]); draw();
              fb(`<span class="eyebrow" style="color:var(--blunder)">Not <span class="o2-san">${esc(san)}</span></span>` + commentHtml(s) + xNotes(s) + '<p class="small muted">Play the arrow move.</p>', 'wrong');
            },
          }); chk();
          if (r.wrongs || r.shown) missed.add(s.id);
          else { k2++; play('right'); fb(`<span class="eyebrow">✓ Right</span><div class="o2-mv"><b>${esc(moveLabel(s.ply, s.san))}</b></div>`, 'right'); }
          head(`${label} · from memory`, l.title, fresh.size + Math.min(k2, fresh.size), fresh.size * 2);
          if (r.wrongs || r.shown) { await cont(); chk(); }
        }
        todo = missed;
      }
      // finish
      if (!relearn) srsLearn(c, [...fresh]);
      put('o2l', ckey(c, l.id), { done: 1 });
      changed();
      head(label, l.title, 1, 1);
      play('done'); try { H.confetti?.(); } catch {}
      const nl = nextLine(c), dueN = dueCards([c]).length;
      actions('none');
      fb(`<span class="eyebrow">Line learned</span><h3>${esc(l.title)}</h3><p>${relearn ? 'Refresher done.' : `${plural(fresh.size, 'new move')} added. ${fresh.size === 1 ? 'It comes' : 'They come'} back tomorrow for a quick review.`}</p>
        <div class="controls">${nl ? `<button class="btn primary" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(nl.id)}">Learn the next line</button>` : ''}
        ${dueN ? `<button class="btn${nl ? '' : ' primary'}" data-act="review" data-c="${esc(c.id)}">Review now (${dueN})</button>` : ''}
        <button class="btn" data-act="course" data-c="${esc(c.id)}">Back to the course</button></div>${nl ? `<p class="small muted">Next: ${esc(nl.title)}</p>` : ''}`, 'right');
    });
  }
  async function quiz(qz) {
    const box = $('#o2-panel');
    box.innerHTML = `<div class="card o2-quiz"><span class="eyebrow">Quick question</span><p><b>${rich(qz.q)}</b></p><div class="quiz-opts">${qz.options.map((o, i) => `<button data-q="${i}">${rich(o)}</button>`).join('')}</div><div class="o2-qa" aria-live="polite"></div></div>`;
    await new Promise(res => {
      box.querySelector('.quiz-opts').onclick = e => {
        const b = e.target.closest('[data-q]'); if (!b) return;
        const ok = +b.dataset.q === qz.answer;
        box.querySelectorAll('[data-q]').forEach(x => { x.disabled = true; if (+x.dataset.q === qz.answer) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        play(ok ? 'right' : 'wrong');
        box.querySelector('.o2-qa').innerHTML = `<p><b>${ok ? 'Right.' : 'Not quite.'}</b> ${rich(qz.explain || '')}</p>`;
        res();
      };
    });
    await cont();
    box.innerHTML = '';
  }

  /* ---- study mode: read a line freely, no scheduling */
  function startStudy(c, l, atId) {
    run(async () => {
      begin(c, 'study', () => show('course', c.id));
      P.ctxLine = l.id;
      const seq = c.seq[l.id];
      let at = atId ? seq.findIndex(s => s.id === atId) : 0; if (at < 0) at = 0;
      P.seq = seq;
      silentTo(seq, at);
      P.si = at;
      head(`Study · ${c.title}`, l.title, at, seq.length);
      actions('study');
      if (at) studyShow(); else fb(`<span class="eyebrow">Study</span><p>${rich(l.intro || '')}</p><p class="small muted">Step through with Next (or play the moves). Nothing here changes your reviews.</p>`);
      P.shapes = at < seq.length && seq[at].n.mine ? moveShapes(seq[at]).map(x => ({ ...x, brush: 'paleBlue' })) : P.shapes; draw();
    });
  }
  function studyShow() {
    const s = P.seq[P.si - 1];
    if (!s) return fb('<span class="eyebrow">Start position</span><p class="small muted">Press Next to begin.</p>');
    fb(commentHtml(s, { eyebrow: s.n.mine ? 'Your move' : 'Opponent' }) + (s.n.mine ? xNotes(s) : '') + (s.n.plan ? `<div class="o2-plan-in">${planHtml(s)}</div>` : '') + (P.si >= P.seq.length ? '<p class="small muted"><b>End of the line.</b></p>' : ''), s.n.plan ? 'plan' : '');
    P.shapes = dedupe([...shapes(s.n.shapes), ...(s.n.plan ? shapes(s.n.plan.shapes) : []), ...(s.n.mine ? xShapes(s) : [])]);
    const nx = P.seq[P.si];
    if (nx && nx.n.mine) P.shapes.push({ orig: nx.from, dest: nx.to, brush: 'paleBlue' });
    head(`Study · ${P.c.title}`, $('#o2-title').textContent, P.si, P.seq.length);
    draw();
  }
  function studyStep(d) {
    if (P.mode !== 'study') return;
    P.view = null;
    if (d > 0 && P.si < P.seq.length) { playStep(P.seq[P.si]); P.si++; studyShow(); }
    if (d < 0 && P.si > 0) { P.chess.undo(); P.hist.pop(); P.si--; renderChips(); studyShow(); }
  }

  /* ---- review mode (also daily review, line practice and difficult-move drills) */
  function buildGroups(items) {
    const m = new Map();
    for (const x of items) {
      const card = x.c.cardById.get(x.id); if (!card) continue;
      const k = x.c.id + '/' + card.line;
      if (!m.has(k)) m.set(k, { c: x.c, line: x.c.lineById.get(card.line), ids: new Set() });
      m.get(k).ids.add(x.id);
    }
    return [...m.values()].filter(g => g.line).sort((a, b) => COURSES.indexOf(a.c) - COURSES.indexOf(b.c) || (a.c.orderIdx.get(a.line.id) ?? 0) - (b.c.orderIdx.get(b.line.id) ?? 0));
  }
  function startReview(items, { label = 'Review', practice = false, back, scope } = {}) {
    run(async () => {
      const all = items.slice(), batch = all.slice(0, CAP), rest = all.slice(CAP);
      const first = batch[0]?.c || curCourse || COURSES[0];
      const chk = begin(first, practice ? 'drill' : 'review', back || (() => show(curCourse ? 'course' : 'home', curCourse?.id)));
      const groups = buildGroups(batch);
      const total = groups.reduce((s, g) => s + g.ids.size, 0);
      const S = { asked: 0, ok: 0, wrong: [], answered: new Set() };
      let qn = 0;
      if (!total) { fb('<p>Nothing to review right now.</p>'); actions('none'); return; }
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi], c = g.c; P.c = c; P.ctxLine = g.line.id;
        const seq = c.seq[g.line.id];
        const idx = seq.map((s, i) => g.ids.has(s.id) ? i : -1).filter(i => i >= 0);
        if (!idx.length) continue;
        const firstI = idx[0], lastI = idx[idx.length - 1];
        const fromStart = H.store.get('o2fromstart', false);
        const s0 = fromStart ? 0 : Math.max(0, seq[firstI - 1] && !seq[firstI - 1].n.mine ? firstI - 1 : firstI);
        silentTo(seq, s0);
        head(`${label} · move ${Math.min(qn + 1, total)} of ${total}`, `${COURSES.length > 1 && !scope ? c.title + ' · ' : ''}${g.line.title}${g.again ? ' (again)' : ''}`, qn, total);
        fb(`<span class="eyebrow">${g.again ? 'One more time' : 'In this line'}</span><p class="small muted">${esc(g.line.title)}. ${s0 ? 'The moves above show how the position arose.' : ''}</p>`);
        actions('none');
        await wait(350); chk();
        for (let i = s0; i <= lastI; i++) {
          const s = seq[i];
          if (!s.n.mine || !g.ids.has(s.id)) { await wait(fromStart && i < firstI - 1 ? 160 : 520); chk(); playStep(s); continue; }
          head(`${label} · move ${Math.min(qn + 1, total)} of ${total}`, $('#o2-title').textContent, qn, total);
          fb(`<span class="eyebrow">Your move</span><p>Play the course move${g.again ? ' (you missed it before)' : ''}.</p>`);
          P.shapes = []; draw();
          const xs = (s.n.x || []);
          const r = await ask(s, {
            onWrong: (san, e) => {
              const x = xs.find(x => norm(x.san) === norm(san));
              P.shapes = dedupe([...moveShapes(s), ...shapes(s.n.shapes)]); draw();
              fb(`<span class="eyebrow" style="color:var(--blunder)">${x ? `Don't play <span class="o2-san">${esc(san)}</span>` : `<span class="o2-san">${esc(san)}</span> is not the course move`}</span>${x ? `<p>${rich(x.why)}</p>` : ''}` + commentHtml(s, { eyebrow: 'The course move' }) + '<p class="small muted">Play the arrow move to go on.</p>', 'wrong');
            },
          }); chk();
          const res = r.wrongs || r.shown ? 'wrong' : r.hinted ? 'hint' : 'ok';
          const key = c.id + '/' + s.id;
          if (!S.answered.has(key)) {
            S.answered.add(key); S.asked++; qn++;
            if (practice) { if (res === 'wrong') srsAnswer(c, s.id, 'pwrong'); else spent(); }
            else srsAnswer(c, s.id, res);
            if (res !== 'wrong') S.ok++; else S.wrong.push({ c, s, line: g.line });
            changed();
          }
          if (res === 'wrong') {
            if (!g.again) groups.push({ c, line: g.line, ids: new Set([s.id]), again: true });
            P.shapes = shapes(s.n.shapes); draw();
            fb(commentHtml(s, { eyebrow: 'Now you know' }) + `<p class="small muted">${practice ? 'This move is due again now.' : 'It comes back at the end of this session and again tomorrow.'}</p>`, 'wrong');
            await cont(); chk();
          } else {
            play('right');
            P.shapes = shapes(s.n.shapes); P.hist[P.hist.length - 1].shapes = P.shapes; draw();
            fb(`<span class="eyebrow">✓ ${res === 'hint' ? 'Right, with a hint' : 'Right'}</span>` + commentHtml(s), 'right');
            addNote(s, true);
            await wait(i === lastI ? 900 : 650); chk();
          }
        }
      }
      // summary
      play('done');
      const cs = scope || [...new Set(batch.map(x => x.c))];
      const nd = nextDueAfterToday(cs), more = dueCards(cs).length;
      head(label, 'Session complete', 1, 1);
      actions('none');
      const acc = S.asked ? S.ok / S.asked : 0;
      if (acc >= 0.9 && S.asked >= 5) { try { H.confetti?.(); } catch {} }
      fb(`<span class="eyebrow">${practice ? 'Drill finished' : 'Review finished'}</span><h3>${S.ok} of ${S.asked} right · ${pct(acc)}</h3>
        <p>${more && !practice ? `${plural(more, 'move')} still due.` : nd ? `Next review: ${whenText(nd)}.` : ''}</p>
        ${S.wrong.length ? `<p class="small muted">Missed (tap to study the position):</p><div class="o2-missed">${S.wrong.map(w => `<button class="o2-drow" data-act="study" data-c="${esc(w.c.id)}" data-l="${esc(w.line.id)}" data-id="${esc(w.s.id)}"><b>${esc(moveLabel(w.s.ply, w.s.san))}</b><span class="small muted">${esc(w.line.title)}</span></button>`).join('')}</div>` : ''}
        <div class="controls">${rest.length || (more && !practice) ? `<button class="btn primary" data-act="${scope && scope.length === 1 ? 'review' : 'daily'}" data-c="${esc(cs[0]?.id || '')}">Keep going (${rest.length || more})</button>` : ''}
        <button class="btn${rest.length || more ? '' : ' primary'}" data-act="${curCourse ? 'course' : 'home'}" data-c="${esc(curCourse?.id || '')}">Done</button></div>`, 'right');
    });
  }
  function reviewCourse(c) { curCourse = c; startReview(dueCards([c]), { label: `Review · ${c.title}`, scope: [c] }); }
  function startDaily() { startReview(dueCards(), { label: 'Daily review', back: () => show('home') }); }
  function practiseLine(c, l) {
    const items = l.mine.map(s => ({ c, id: s.id })).filter(x => srsGet(c, x.id));
    // practice inside its own line: show them all in this line, even when their primary line is another one
    run(async () => { startReview(items.map(x => ({ ...x })), { label: `Practise · ${l.title}`, practice: true, scope: [c] }); });
  }
  function reviewLine(c, l) {
    const items = l.mine.filter(s => isDue(srsGet(c, s.id))).map(s => ({ c, id: s.id }));
    startReview(items, { label: `Review · ${l.title}`, scope: [c] });
  }
  function drillDifficult(c) {
    const items = c.cards.filter(k => isDifficult(srsGet(c, k.id))).map(k => ({ c, id: k.id }));
    startReview(items, { label: 'Difficult moves', practice: true, scope: [c] });
  }

  /* ---- generic script player for T6 (traps, fix-it drills, model games) */
  /** opts: {c, label, title, intro, fen?, startPly?, moves:[{san, ask?:bool, c?:text, shapes?:[]}], onDone?(result)}
      Plays the moves; asks the ones with ask:true (wrong -> note + arrow, must play it). Resolves {asked, wrong}. */
  function playScript(o) {
    return new Promise(resolve => run(async () => {
      const c = o.c || curCourse || COURSES[0];
      const chk = begin(c, 'script', o.back || (() => show(curCourse ? 'course' : 'home', curCourse?.id)));
      if (o.side) P.c = { ...c, side: o.side };
      resetBoard(o.fen || null, o.startPly || 0);
      head(o.label || 'Drill', o.title || '', 0, 1);
      if (o.intro) { fb(`<p>${rich(o.intro)}</p>`); await cont('Start'); chk(); }
      let asked = 0, wrong = 0;
      for (const m of o.moves) {
        const t = new Chess(P.chess.fen()), mv = t.move(m.san, { sloppy: true });
        if (!mv) throw new Error('illegal move ' + m.san);
        const ply = P.startPly + P.hist.length + 1;
        const s = { id: null, n: { san: mv.san, mine: !!m.ask, c: m.c || '', shapes: m.shapes || [], alts: m.alts || [], x: [] }, fen: P.chess.fen(), from: mv.from, to: mv.to, san: mv.san, ply };
        if (!m.ask) { await wait(480); chk(); playStep(s, { shapes: shapes(m.shapes) }); if (m.c) { fb(commentHtml(s)); P.shapes = shapes(m.shapes); draw(); } continue; }
        asked++;
        fb(`<span class="eyebrow">Your move</span><p>${esc(m.prompt || 'Find the right move.')}</p>`); P.shapes = []; draw();
        const r = await ask(s, { onWrong: san => { P.shapes = moveShapes(s); draw(); fb(`<span class="eyebrow" style="color:var(--blunder)">Not <span class="o2-san">${esc(san)}</span></span>${m.c ? `<p>${rich(m.c)}</p>` : ''}<p class="small muted">Play the arrow move.</p>`, 'wrong'); } }); chk();
        if (r.wrongs || r.shown) wrong++; else play('right');
        P.shapes = shapes(m.shapes); draw();
        fb((r.wrongs || r.shown ? '' : '<span class="eyebrow">✓ Right</span>') + commentHtml(s), r.wrongs ? 'wrong' : 'right');
        await wait(700); chk();
      }
      const res = { asked, wrong };
      try { o.onDone?.(res); } catch (e) { console.warn(e); }
      actions('none');
      fb(`<span class="eyebrow">Done</span><h3>${wrong ? `${asked - wrong} of ${asked} first try` : 'Solved'}</h3><div class="controls"><button class="btn primary" data-act="back">Back</button></div>`, wrong ? '' : 'right');
      resolve(res);
    }));
  }

  /* ================================================================ D. move tree */
  function openTree(c, path = []) {
    run(async () => {
      begin(c, 'tree', () => show('course', c.id));
      P.tpath = path.slice();
      treeRender();
    });
  }
  function treeRender() {
    const c = P.c, path = P.tpath;
    P.chess = new Chess(); P.startFen = P.chess.fen(); P.startPly = 0; P.hist = []; P.view = null;
    for (const id of path) { const n = c.nodes[id]; const mv = P.chess.move(n.san, { sloppy: true }); if (!mv) break; P.hist.push({ san: mv.san, from: mv.from, to: mv.to, fen: P.chess.fen(), mine: n.mine, node: id, shapes: [] }); }
    const fen = P.chess.fen(), k = posKey(fen), kids = (c.children.get(k) || []).map(id => ({ id, n: c.nodes[id] }));
    const last = path.length ? c.nodes[path[path.length - 1]] : null;
    const st = H.statsAt ? H.statsAt(fen) : null, gi = gamesIndex()?.get(k) || {};
    const courseSans = new Set(kids.map(x => norm(x.n.san)));
    const myTurn = (P.chess.turn() === 'w') === (c.side === 'white');
    const shareOf = n => n.st?.share ?? (st ? (st.m.find(m => norm(m[0]) === norm(n.san))?.[1] || 0) / st.n : null);
    P.shapes = kids.map((x, i) => { const m = new Chess(fen).move(x.n.san, { sloppy: true }); return m && { orig: m.from, dest: m.to, brush: i === 0 ? 'blue' : 'paleBlue' }; }).filter(Boolean);
    head(`Move tree · ${c.title}`, last ? `After ${moveLabel(last.ply, last.san)}` : 'Start position', path.length, Math.max(path.length, 20));
    fb(last && (last.c || last.plan) ? commentHtml({ n: last, ply: last.ply, san: last.san }) + (last.plan ? `<div class="o2-plan-in">${planHtml({ n: last, ply: last.ply, san: last.san })}</div>` : '') : `<span class="eyebrow">Move tree</span><p class="small muted">Tap a move below or play it on the board. Blue arrows show where the course goes.</p>`);
    const others = st && !myTurn ? st.m.filter(m => !courseSans.has(norm(m[0])) && m[1] / st.n >= 0.02).slice(0, 6) : [];
    const thr = c.linesOf.get(path[path.length - 1]) || [];
    const leaf = !kids.length;
    $('#o2-panel').innerHTML = `<div class="card o2-tree">
      <span class="eyebrow">${kids.length ? (myTurn ? 'Your course move' : `Opponent replies in the course (${kids.length})`) : 'End of the course here'}</span>
      <div class="o2-trows">${kids.map(x => {
        const sh = shareOf(x.n), yg = gi[x.n.san] || gi[norm(x.n.san)] || 0, ls = c.linesOf.get(x.id) || [];
        return `<button class="o2-trow" data-tree="${esc(x.id)}"><b>${esc(moveLabel(x.n.ply, x.n.san))}</b>${x.n.nag && x.n.nag !== 'sys' ? `<span class="o2-nag">${esc(x.n.nag)}</span>` : ''}
          <span class="o2-tbar">${sh != null ? `<i style="width:${Math.max(2, sh * 100)}%"></i>` : ''}</span><span class="small">${sh != null ? pct(sh) : ''}</span>
          <span class="small muted o2-tl">${yg ? `your games: ${yg}× · ` : ''}${plural(ls.length, 'line')}${ls.length === 1 ? `: ${esc(c.lineById.get(ls[0])?.title || '')}` : ''}</span></button>`;
      }).join('')}
      ${others.map(m => `<div class="o2-trow off"><b>${esc(m[0])}</b><span class="o2-tbar"><i style="width:${m[1] / st.n * 100}%"></i></span><span class="small">${pct(m[1] / st.n)}</span><span class="small muted o2-tl">not in the course${gi[m[0]] ? ` · your games: ${gi[m[0]]}×` : ''}</span></div>`).join('')}</div>
      ${st ? `<p class="small muted">Shares: Lichess players rated 1200-1600 (${st.n.toLocaleString()} games).</p>` : '<p class="small muted">Statistics for this position arrive with the weekly update.</p>'}
      ${thr.length ? `<span class="eyebrow">${leaf ? 'Lines ending here' : 'Lines through this position'}</span><div class="o2-tlines">${thr.slice(0, 8).map(id => { const l = c.lineById.get(id); const i = lineInfo(c, l); return `<div class="o2-tline"><span>${esc(l.title)} <span class="status ${i.state}">${STATE[i.state]}</span></span><span class="controls">${i.learned ? '' : `<button class="btn primary" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(id)}">Learn this line</button>`}<button class="btn" data-act="study" data-c="${esc(c.id)}" data-l="${esc(id)}">Study</button></span></div>`; }).join('')}${thr.length > 8 ? `<p class="small muted">and ${thr.length - 8} more</p>` : ''}</div>` : ''}
    </div>`;
    actions('tree');
    renderChips();
  }
  function treeMove(san) {
    const c = P.c, kids = c.children.get(posKey(P.chess.fen())) || [];
    const id = kids.find(k => norm(c.nodes[k].san) === norm(san));
    if (!id) { toast(`${esc(san)} is not in the course here.`); return setTimeout(draw, 250); }
    P.tpath.push(id); play('move'); treeRender();
  }

  /* ================================================================ events */
  function onClick(e) {
    const t = e.target;
    const pa = t.closest('[data-pa]');
    if (pa) {
      const a = pa.dataset.pa;
      if (a === 'hint') hint(false);
      if (a === 'showmv') hint(true);
      if (a === 'cont') doCont();
      if (a === 'prev') studyStep(-1);
      if (a === 'next') studyStep(1);
      if (a === 'tback') { if (P.tpath.length) { P.tpath.pop(); treeRender(); } }
      if (a === 'flip') { P.flipped = !P.flipped; draw(); }
      if (a === 'more') openMenu();
      return;
    }
    const mi = t.closest('[data-menu]'); if (mi) return menuAction(mi.dataset.menu);
    if (!t.closest('#o2-menu')) closeMenu();
    const chip = t.closest('.o2-chip');
    if (chip) {
      if (chip.id === 'o2-viewback') { P.view = null; return draw(); }
      const i = +chip.dataset.i;
      if (P.mode === 'tree') { P.tpath = P.tpath.slice(0, i); return treeRender(); }
      if (P.mode === 'study') { while (P.si > i) studyStep(-1); while (P.si < i) studyStep(1); return; }
      P.view = i >= P.hist.length ? null : i; return draw();
    }
    const tr = t.closest('[data-tree]'); if (tr) { P.tpath.push(tr.dataset.tree); play('move'); return treeRender(); }
    const note = t.closest('.o2-note'); if (note && !t.closest('.gl')) { note.classList.toggle('collapsed'); const p = +note.dataset.ply; if (p && P.mode !== 'study' && P.mode !== 'tree') { P.view = p >= P.hist.length ? null : p; draw(); } return; }
    const tab = t.closest('[data-tab]'); if (tab && curCourse) { H.store.set('o2tab.' + curCourse.id, tab.dataset.tab); return renderCourse(curCourse, true); }
    const b = t.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const c = COURSES.find(x => x.id === b.dataset.c), l = c?.lineById.get(b.dataset.l);
    switch (b.dataset.act) {
      case 'home': return show('home');
      case 'course': curCourse = c || curCourse; return show(curCourse ? 'course' : 'home', curCourse?.id);
      case 'back': return P.back ? P.back() : show('home');
      case 'daily': curCourse = null; return startDaily();
      case 'learn': if (c && l) { curCourse = c; startLearn(c, l); } return;
      case 'study': if (c && l) { curCourse = c; startStudy(c, l, b.dataset.id); } return;
      case 'review': if (c) reviewCourse(c); return;
      case 'review-line': if (c && l) { curCourse = c; reviewLine(c, l); } return;
      case 'practise-line': if (c && l) { curCourse = c; practiseLine(c, l); } return;
      case 'drill': if (c) { curCourse = c; drillDifficult(c); } return;
      case 'tree': if (c) { curCourse = c; openTree(c, []); } return;
    }
  }
  function onKey(e) {
    if (!ROOT || ROOT.offsetParent === null || $('#o2-player').hidden) return;
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return closeMenu();
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest?.('button') && e.key === 'Enter') return;
      if (P.cont) { e.preventDefault(); return doCont(); }
      if (P.mode === 'study') { e.preventDefault(); return studyStep(1); }
      return;
    }
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (P.mode === 'study') return studyStep(d);
      if (P.mode === 'tree') { if (d < 0 && P.tpath.length) { P.tpath.pop(); treeRender(); } else if (d > 0) { const kids = P.c.children.get(posKey(P.chess.fen())) || []; if (kids[0]) { P.tpath.push(kids[0]); treeRender(); } } return; }
      const cur = P.view ?? P.hist.length, nv = Math.max(0, Math.min(P.hist.length, cur + d));
      P.view = nv >= P.hist.length ? null : nv; return draw();
    }
    if (k === 'h' && P.expect) return hint(false);
    if (k === 's' && P.expect) return hint(true);
    if (k === 'f') { P.flipped = !P.flipped; return draw(); }
  }
  function onToggle(e) {
    const d = e.target.closest?.('details.o2-chap');
    if (d && curCourse) H.store.set(`o2ch.${curCourse.id}.${d.dataset.ch}`, d.open);
  }
  function onChange(e) {
    if (e.target.dataset?.act === 'fromstart') H.store.set('o2fromstart', e.target.checked);
  }

  /* ================================================================ init */
  function init({ root, data, hooks = {} }) {
    ROOT = root;
    Object.assign(H, Object.fromEntries(Object.entries(hooks).filter(([, v]) => v != null)));
    if (!H.Chessground || !H.record || !H.progress) throw new Error('O2.init needs hooks.Chessground, hooks.record and hooks.progress');
    for (const k of KINDS) H.progress[k] ||= {};
    COURSES = (data?.courses || []).filter(c => c && c.lines && c.nodes);
    DRAFT = COURSES.some(c => c.draft);
    COURSES.forEach(prep);
    evalOn = H.store.get('o2eval', false);
    if (!ROOT.dataset.o2) {
      ROOT.dataset.o2 = '1';
      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('toggle', onToggle, true);
      ROOT.addEventListener('change', onChange);
      document.addEventListener('keydown', onKey);
    }
    show('home');
    return api;
  }
  const api = {
    init, show, refresh, startDaily, dueSummary, now, endOfDay, posKey, KINDS, GLOSSARY: GLOSSARY.map(([id, t, d]) => [id, t, d]),
    courses: () => COURSES,
    addSection(s) { sections.push(s); if (screen === 'course') renderCourse(curCourse, true); },
    addHomeBlock(fn) { homeBlocks.push(fn); if (screen === 'home' && ROOT) renderHome(); },
    playScript, openTree, startLearn, startStudy, reviewCourse,
    srs: { get: srsGet, answer: srsAnswer, learn: srsLearn, isDue, isDifficult, dueCards, lineInfo, courseInfo, nextLine, IV, MATURE },
    rich, toast,
    get hooks() { return H; },
  };
  return api;
})();
