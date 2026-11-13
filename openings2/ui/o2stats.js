/* ============================================================================================
   O2 stats: "Your games vs the course" (E), Statistics (F), "Stats here" drawer, Traps, Model games,
   and the recent-games strip on the Openings home. Spec: openings2/BLUEPRINT.md section 5 (screens E and F).
   Plain script, loaded AFTER o2core.js (needs the global O2). It plugs in through O2's extension API only:
     O2.addSection x4 (traps, models, games, stats), O2.addHomeBlock (recent games), O2.hooks.statsHere (drawer),
     O2.playScript (traps, fix-it drills), O2.srs / O2.courses / O2.hooks.{games, statsAt, progress, record, store, Chessground}.
   Nothing to call: it installs itself on load. Data: O2.hooks.games = analysis.json-style list
   [{url, color, result, end, opp, oppRating, plies:[{san, loss, best}]}] ; O2.hooks.statsAt(fen) -> {n, m:[[san, count, score]]}|null.
   Progress kinds written: o2g (fix-it solved), o2t (trap), o2m (model game seen / guess score).
   Test helpers: O2.stats.reach(cid, key) and O2.stats.analyse(cid) (used for the cross-check against game_probe.py).
   ============================================================================================ */
(() => {
  'use strict';
  const H = () => O2.hooks;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const norm = s => String(s || '').replace(/[+#!?]/g, '');
  const posKey = fen => fen.split(' ').slice(0, 3).join(' ') + ' -';
  const plyLabel = ply => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'}`;
  const moveLabel = (ply, san) => plyLabel(ply) + san;
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const pct = x => `${Math.round(x * 100)}%`;
  const score = (w, d, l) => (w + d + l) ? Math.round((w + d / 2) / (w + d + l) * 100) : 0;
  const RES = { win: 'W', draw: 'D', loss: 'L' };
  const gid = g => String(g.url || '').split('?')[0].split('/').filter(Boolean).pop() || String(g.end || '');
  const when = g => g.end ? new Date(+g.end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const wdl = o => `W${o.w} D${o.d} L${o.l}`;
  const empty = (h, p) => `<div class="card o2s-empty"><h3>${esc(h)}</h3><p class="muted small">${esc(p || '')}</p></div>`;
  const resPill = r => `<span class="o2s-res ${esc(r)}">${RES[r] || '?'}</span>`;
  const moveText = (steps, upto) => steps.slice(0, upto).map((s, i) => (i % 2 ? '' : `${i / 2 + 1}.`) + s.san).join(' ');
  const copy = (txt, ok) => (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => O2.toast(ok), () => O2.toast(esc(txt), 9000));

  /* ---------------------------------------------------------------- games, parsed once (positions before each ply) */
  let PC = null;
  function parsed() {
    const G = H().games || [];
    if (PC && PC.src === G && PC.len === G.length) return PC.list;
    const list = [];
    for (const g of G) {
      if (!g || !Array.isArray(g.plies) || g.rated === false || !g.color) continue;
      const b = new Chess(), steps = [], white = g.color === 'white';
      for (const p of g.plies) {
        const fen = b.fen(), mine = (b.turn() === 'w') === white, mv = b.move(p.san, { sloppy: true });
        if (!mv) break;
        steps.push({ key: posKey(fen), fen, san: mv.san, mine, loss: p.loss, best: p.best });
      }
      list.push({ g, id: gid(g), color: g.color, res: g.result, end: +g.end || 0, steps });
    }
    list.sort((a, b) => b.end - a.end);
    PC = { src: G, len: G.length, list }; IDX = {}; AN.clear();
    return list;
  }
  /* posKey -> {me: Map san -> {ids:Set, w, d, l, games:[]}, opp: Map ...}; same unit as game_probe.py (a game counts once per move) */
  let IDX = {};
  function index(color) {
    if (IDX[color]) return IDX[color];
    const m = new Map();
    for (const pg of parsed()) {
      if (pg.color !== color) continue;
      for (const s of pg.steps) {
        let e = m.get(s.key); if (!e) m.set(s.key, e = { me: new Map(), opp: new Map() });
        const side = s.mine ? e.me : e.opp;
        let d = side.get(s.san); if (!d) side.set(s.san, d = { ids: new Set(), w: 0, d: 0, l: 0, games: [] });
        if (d.ids.has(pg.id)) continue;
        d.ids.add(pg.id); d.games.push(pg);
        if (pg.res === 'win') d.w++; else if (pg.res === 'loss') d.l++; else d.d++;
      }
    }
    return IDX[color] = m;
  }
  const reach = (cid, key) => {
    const c = O2.courses().find(x => x.id === cid), e = index(c.side).get(key);
    if (!e) return { me: {}, opp: {} };
    const out = { me: {}, opp: {} };
    for (const w of ['me', 'opp']) for (const [san, d] of e[w]) out[w][san] = { games: d.ids.size, win: d.w, draw: d.d, loss: d.l };
    return out;
  };

  /* ---------------------------------------------------------------- per course: where each game left the course */
  const AN = new Map();
  function analyse(cOrId) {
    const c = typeof cOrId === 'string' ? O2.courses().find(x => x.id === cOrId) : cOrId;
    parsed();
    if (AN.has(c.id)) return AN.get(c.id);
    const games = [], total = parsed().filter(p => p.color === c.side).length;
    for (const pg of parsed()) {
      if (pg.color !== c.side) continue;
      let depth = 0, dev = null, state = 'over';
      for (let i = 0; i < pg.steps.length; i++) {
        const s = pg.steps[i], kids = c.children.get(s.key);
        if (!kids) { state = 'end'; break; }
        if (!kids.some(id => norm(c.nodes[id].san) === norm(s.san))) {
          const nx = pg.steps[i + 1];
          const sans = [...new Set(kids.map(id => c.nodes[id].san))];
          const fine = s.mine && kids.some(id => (c.nodes[id].alts || []).some(a => norm(a.san) === norm(s.san)));
          dev = { i, ply: i + 1, by: s.mine ? 'me' : 'opp', san: s.san, key: s.key, fen: s.fen, kids, courseSans: sans, fine, loss: s.loss, next: nx?.san, nextBest: nx?.best };
          state = 'dev'; break;
        }
        depth++;
      }
      if (depth >= 1) games.push({ pg, depth, dev, state });
    }
    const an = { c, total, games };
    // my deviations grouped by position
    const mine = new Map(), opp = new Map();
    for (const x of games) {
      const d = x.dev; if (!d) continue;
      const mapp = d.by === 'me' ? mine : opp, k = d.by === 'me' ? d.key : d.key + '|' + d.san;
      let gr = mapp.get(k);
      if (!gr) mapp.set(k, gr = { key: d.key, fen: d.fen, ply: d.ply, kids: d.kids, courseSans: d.courseSans, count: 0, moves: new Map(), games: [], w: 0, d: 0, l: 0, sumLoss: 0, nLoss: 0, fine: true, san: d.san, nexts: new Map(), bests: new Map() });
      gr.count++; gr.games.push(x);
      if (x.pg.res === 'win') gr.w++; else if (x.pg.res === 'loss') gr.l++; else gr.d++;
      let mv = gr.moves.get(d.san); if (!mv) gr.moves.set(d.san, mv = { n: 0, fine: d.fine });
      mv.n++;
      if (!d.fine) gr.fine = false;
      if (typeof d.loss === 'number') { gr.sumLoss += d.loss; gr.nLoss++; }
      if (d.next) gr.nexts.set(d.next, (gr.nexts.get(d.next) || 0) + 1);
      if (d.nextBest) gr.bests.set(d.nextBest, (gr.bests.get(d.nextBest) || 0) + 1);
    }
    an.mine = [...mine.values()].sort((a, b) => b.count - a.count || a.ply - b.ply);
    an.opp = [...opp.values()].sort((a, b) => b.count - a.count || a.ply - b.ply);
    return AN.set(c.id, an).get(c.id), an;
  }
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const leftText = x => {
    const d = x.dev;
    if (!d) return x.state === 'end' ? 'Stayed in the course to the end of its line' : 'The game ended inside the course';
    const my = moveLabel(d.ply, d.san), cm = d.courseSans.map(s => moveLabel(d.ply, s)).join(' / ');
    return d.by === 'me' ? `You left at ${my} (course: ${cm})${d.fine ? ', a fine move' : ''}` : `Opponent left at ${my} (course: ${cm})`;
  };

  /* ---------------------------------------------------------------- shared bits */
  const outcome = r => `<span class="o2s-wdl"><b class="w">${r.w}</b><b class="d">${r.d}</b><b class="l">${r.l}</b></span>`;
  const bar = (frac, cls = '') => `<span class="o2s-bar ${cls}"><i style="width:${Math.max(frac > 0 ? 2 : 0, Math.min(100, frac * 100))}%"></i></span>`;
  function seqFen(c, ids) { const b = new Chess(); for (const id of ids) if (!b.move(c.nodes[id].san, { sloppy: true })) break; return b.fen(); }

  /* ================================================================ E. Your games */
  const OPEN = {};               // course id -> game id to expand (set by the home strip)
  const SHOW = {};               // course id -> {dev, opp, list} how many rows are shown
  function tabGames(c, el) {
    const an = analyse(c), sh = SHOW[c.id] ||= { dev: 8, opp: 6, list: 20 };
    const col = c.side === 'white' ? 'White' : 'Black';
    if (!an.total) { el.innerHTML = empty('No games yet', `Your ${col} games from chess.com appear here after the next update.`); return; }
    const ent = an.games.length;
    if (!ent) { el.innerHTML = empty('No games in this course yet', `None of your ${an.total} ${col} games entered this course. They will show up here when one does.`); return; }
    const avg = ent ? an.games.reduce((a, x) => a + x.depth, 0) / ent / 2 : 0;
    const left = an.mine.filter(g => !g.fine), fine = an.mine.filter(g => g.fine);
    const nLeft = left.reduce((a, g) => a + g.count, 0);
    const fixed = g => { const t = Math.max(0, ...g.games.map(x => H().progress.o2g?.[`${c.id}/${x.pg.id}`]?.t || 0)); return t ? { t, again: g.games.filter(x => x.pg.end * 1000 > t).length } : null; };
    const devRow = g => {
      const mv = [...g.moves.entries()].sort((a, b) => b[1].n - a[1].n), cm = g.courseSans.map(s => moveLabel(g.ply, s)).join(' / ');
      const f = fixed(g), avgL = g.nLoss ? Math.round(g.sumLoss / g.nLoss) : null;
      const fenSh = g.kids[0] ? (() => { const m = new Chess(g.fen).move(c.nodes[g.kids[0]].san, { sloppy: true }); return m ? `g:${m.from}-${m.to}` : ''; })() : '';
      return `<div class="card o2s-dev${g.fine ? ' fine' : ''}">
        <div class="o2s-mini" data-mini="${esc(g.fen)}" data-orient="${c.side}" data-shapes="${esc(fenSh)}"></div>
        <div class="o2s-dmain">
          <div class="o2s-dt"><b>${esc(plyLabel(g.ply))}</b> ${mv.map(([s, v]) => `<span class="o2-san o2s-bad">${esc(s)}</span>${v.n > 1 ? `<span class="small muted"> ×${v.n}</span>` : ''}`).join(' ')} <span class="o2s-arrow">→</span> <span class="o2-san o2s-good">${esc(cm)}</span></div>
          <div class="o2s-meta"><span>${plural(g.count, 'time')}</span>${outcome(g)}<span class="small muted">score ${score(g.w, g.d, g.l)}%</span>${avgL != null ? `<span class="small muted" title="Average engine loss of your move, in hundredths of a pawn (capped at 100)">avg loss ${avgL}</span>` : ''}
            ${g.fine ? '<span class="o2-kind">Fine, but not the course move</span>' : ''}${f ? `<span class="o2s-fixed">Fixed ✓${f.again ? ` · left again ${f.again}×` : ''}</span>` : ''}</div>
        </div>
        ${g.fine ? '' : `<div class="o2s-act"><button class="btn primary" data-s="fix" data-k="${esc(g.key)}">${f ? 'Drill again' : 'Fix it'}</button></div>`}</div>`;
    };
    const oppRows = an.opp.filter(g => g.count >= 2);
    const oppRow = g => {
      const st = H().statsAt?.(g.fen), m = st?.m.find(x => norm(x[0]) === norm(g.san)), nx = top(g.nexts), bst = top(g.bests);
      const sample = g.games[0];
      return `<div class="card o2s-dev">
        <div class="o2s-mini" data-mini="${esc(g.fen)}" data-orient="${c.side}"></div>
        <div class="o2s-dmain">
          <div class="o2s-dt"><b>${esc(plyLabel(g.ply))}</b> <span class="o2-san o2s-bad">${esc(g.san)}</span> <span class="small muted">instead of</span> <span class="o2-san o2s-good">${esc(g.courseSans.join(' / '))}</span></div>
          <div class="o2s-meta"><span>${plural(g.count, 'time')}</span>${outcome(g)}<span class="small muted">score ${score(g.w, g.d, g.l)}%</span>${m && st ? `<span class="small muted">Lichess: ${pct(m[1] / st.n)} of players</span>` : ''}</div>
          <p class="small">${nx ? `You played <b>${esc(nx)}</b> next${bst && norm(bst) !== norm(nx) ? `; the engine preferred <b>${esc(bst)}</b>` : bst ? ' (the engine agrees)' : ''}.` : 'The game ended there.'}</p>
        </div>
        <div class="o2s-act"><button class="btn" data-s="ask" data-k="${esc(g.key)}" data-m="${esc(g.san)}">Ask Claude to add a line</button></div></div>`;
    };
    const rows = an.games.slice().sort((a, b) => b.pg.end - a.pg.end);
    el.innerHTML = `
      <div class="card o2s-sum"><p><b>${ent} of your ${an.total}</b> ${col} games started in this course. On average you stay in the course for <b>${avg.toFixed(1)} moves</b>.
        ${nLeft ? `You left it with a move that is not in the course in <b>${nLeft}</b> of them.` : 'You always followed the course when it was your move.'}</p></div>
      <h3 class="o2s-h">Where you leave the course</h3>
      ${left.length || fine.length ? `<p class="small muted">Positions where your move was not the course move. "Fix it" replays your game up to there and you play the course move.</p>
        <div class="o2s-list">${left.slice(0, sh.dev).map(devRow).join('') || '<p class="muted small">Nothing here: every time you left the course, your move was a fine alternative.</p>'}</div>
        ${left.length > sh.dev ? `<button class="btn" data-s="more" data-w="dev">Show ${left.length - sh.dev} more</button>` : ''}
        ${fine.length ? `<details class="o2s-fine"><summary>${plural(fine.length, 'position')} where your move was fine (not counted as a mistake)</summary><div class="o2s-list">${fine.map(devRow).join('')}</div></details>` : ''}`
        : '<p class="muted small">You have not left the course on your own move yet.</p>'}
      <h3 class="o2s-h">Where opponents leave the course</h3>
      <p class="small muted">Opponent moves that are not in the course and came up at least twice. This is what to add to the course next.</p>
      <div class="o2s-list">${oppRows.slice(0, sh.opp).map(oppRow).join('') || `<p class="muted small">No move outside the course has come up twice yet${an.opp.length ? ` (${plural(an.opp.length, 'different one')} came up once)` : ''}.</p>`}</div>
      ${oppRows.length > sh.opp ? `<button class="btn" data-s="more" data-w="opp">Show ${oppRows.length - sh.opp} more</button>` : ''}
      <h3 class="o2s-h">Your games in this course</h3>
      <div class="o2s-games">${rows.slice(0, sh.list).map(x => {
        const open = OPEN[c.id] === x.pg.id, g = x.pg.g;
        return `<details class="o2s-game" data-gid="${esc(x.pg.id)}"${open ? ' open' : ''}><summary>${resPill(x.pg.res)}<span class="o2s-gt"><b>vs ${esc(g.opp || '?')}</b> <span class="small muted">${esc(g.oppRating || '')} · ${esc(when(g))} · ${x.depth} plies in the course</span><br><span class="small">${esc(leftText(x))}</span></span></summary>
          <div class="o2s-gbody">${gameMoves(c, x)}<div class="controls">${x.dev?.by === 'me' && !x.dev.fine ? `<button class="btn primary" data-s="fixg" data-g="${esc(x.pg.id)}">Fix it</button>` : ''}<a class="btn" href="${esc(g.url)}" target="_blank" rel="noopener">Open the game</a></div></div></details>`;
      }).join('')}</div>
      ${rows.length > sh.list ? `<button class="btn" data-s="more" data-w="list">Show ${rows.length - sh.list} more games</button>` : ''}`;
    if (OPEN[c.id]) { const d = el.querySelector(`details[data-gid="${CSS.escape(OPEN[c.id])}"]`); delete OPEN[c.id]; setTimeout(() => d?.scrollIntoView({ block: 'center' }), 50); }
    el.onclick = e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const s = b.dataset.s;
      if (s === 'more') { sh[b.dataset.w] += b.dataset.w === 'list' ? 30 : 10; return tabGames(c, el); }
      if (s === 'fix') { const g = an.mine.find(x => x.key === b.dataset.k); if (g) fixIt(c, g, g.games[0].pg); }
      if (s === 'fixg') { const x = rows.find(r => r.pg.id === b.dataset.g); const g = an.mine.find(m => m.key === x.dev.key); if (g) fixIt(c, g, x.pg); }
      if (s === 'ask') { const g = an.opp.find(x => x.key === b.dataset.k && x.san === b.dataset.m); if (g) askClaude(c, g); }
    };
  }
  function gameMoves(c, x) {
    const steps = x.pg.steps, devI = x.dev ? x.dev.i : -1, cut = x.state === 'end' ? x.depth : steps.length;
    return `<div class="o2s-gm">${steps.map((s, i) => {
      const cls = i < x.depth ? 'course' : i === devI ? (x.dev.fine ? 'fine' : 'dev') : (s.loss >= 50 ? 'bad' : '');
      return `<span class="${cls}${s.mine ? ' mine' : ''}">${i % 2 === 0 ? `<i>${i / 2 + 1}.</i>` : ''}${esc(s.san)}</span>`;
    }).join(' ')}</div><p class="small muted"><span class="o2s-key course">in the course</span> <span class="o2s-key dev">where you left</span> <span class="o2s-key bad">engine: big loss</span></p>`;
  }
  function askClaude(c, g) {
    const x = g.games[0], steps = x.pg.steps, txt =
      `Openings: please add a line to the course "${c.title}" (${c.id}). In ${plural(g.count, 'of my games')} the opponent leaves the course at ${moveLabel(g.ply, g.san)} (course: ${g.courseSans.join(' / ')}). `
      + `Moves: ${moveText(steps, g.ply)}. FEN before the move: ${g.fen}. My score there: ${wdl({ w: g.w, d: g.d, l: g.l })}. `
      + `${top(g.bests) ? `The engine's best reply is ${top(g.bests)}. ` : ''}Please write a sound reply line and a short explanation.`;
    copy(txt, 'Copied. Paste it to Claude.');
  }
  /* fix-it drill: replay the game to the position (from a few plies earlier on long games), play the course move */
  function fixIt(c, g, pg) {
    const x = g.games.find(y => y.pg === pg) || g.games[0], d = x.dev, steps = x.pg.steps;
    const from = Math.max(0, d.i - 6);
    const kid = c.nodes[d.kids[0]], xn = (kid.x || []).find(z => norm(z.san) === norm(d.san));
    const text = (xn ? `Don't play ${d.san}: ${xn.why} ` : '') + (kid.c || '');
    const alts = [...d.kids.slice(1).map(id => ({ san: c.nodes[id].san, note: 'This is in the course too.' })), ...(kid.alts || [])];
    const moves = steps.slice(from, d.i).map(s => ({ san: s.san }));
    moves.push({ san: kid.san, ask: true, c: text, alts, shapes: kid.shapes || [], prompt: `In your game you played ${d.san} here. What does the course play?` });
    const g0 = x.pg.g;
    O2.playScript({ c, label: `Fix it · ${c.title}`, title: `You left at ${moveLabel(d.ply, d.san)}`,
      fen: from ? steps[from].fen : null, startPly: from, back: () => O2.show('course', c.id),
      intro: `Your game against ${g0.opp || 'an opponent'}${from ? ` (from move ${Math.ceil((from + 1) / 2)})` : ''}. The moves are replayed; then it is your turn where you left the course.`,
      moves,
      onDone: r => { H().record('o2g', `${c.id}/${x.pg.id}`, { ok: 1, w: r.wrong ? 1 : 0 }); H().onChange?.(); } });
  }

  /* ================================================================ F. Statistics */
  const STAT_NOTE = 'Source: Lichess games of players rated 1200-1600 (data/explorer.json, refreshed by the weekly update).';
  function reachWords(r) {
    if (r == null) return '';
    if (r >= 0.5) return 'most games';
    const n = Math.max(2, Math.round(1 / r));
    return n > 500 ? 'rare' : `about 1 game in ${n}`;
  }
  function lineStart(c, l) {                // the first node this line owns (its branch point) and the end position
    const id = l.nodes.find(i => (c.linesOf.get(i) || [])[0] === l.id) || l.nodes[l.nodes.length - 1];
    return c.nodes[id];
  }
  function tabStats(c, el) {
    const idx = index(c.side), nG = parsed().filter(p => p.color === c.side).length;
    const lines = c.order.map(id => c.lineById.get(id));
    const seen = (key) => { let w = 0, d = 0, l = 0, n = 0; const e = idx.get(key); if (e) { const ids = new Set(); for (const side of [e.me, e.opp]) for (const v of side.values()) for (const g of v.games) if (!ids.has(g.id)) { ids.add(g.id); n++; if (g.res === 'win') w++; else if (g.res === 'loss') l++; else d++; } } return { n, w, d, l }; };
    // position unit: the position before a node; games that reached it
    const pos = new Map();
    for (const l of lines) for (const s of (c.seq[l.id] || [])) { const k = posKey(s.fen); if (!pos.has(k)) pos.set(k, { k, fen: s.fen, ply: s.ply, san: s.san, line: l }); }
    const heat = [...pos.values()].filter(p => p.ply >= 3).map(p => ({ ...p, ...seen(p.k) })).filter(p => p.n).sort((a, b) => b.n - a.n || a.ply - b.ply).slice(0, 15);
    const mx = heat[0]?.n || 1;
    const chapReach = c.chapters.map(ch => {
      const ls = ch.lines.map(id => c.lineById.get(id)).filter(Boolean);
      const rows = ls.map(l => { const st = lineStart(c, l), a = seen(st.k), e = seen(posKey(l.endFen)); return { l, st, a, e }; });
      return { ch, rows };
    });
    const pr = chapReach.map(({ ch, rows }) => `<details class="o2-chap"><summary><span class="t">${esc(ch.title)}</span><span class="small muted">${plural(rows.reduce((a, r) => a + r.a.n, 0), 'game visit')}</span></summary>
      <div class="o2s-trows">${rows.map(({ l, st, a, e }) => `<div class="o2s-trow"><span class="o2s-tl"><b>${esc(l.title)}</b><br><span class="small muted">branches at ${esc(moveLabel(st.ply, st.san))}</span></span>
        <span class="o2s-tn">${a.n ? `<b>${a.n}</b> reached ${outcome(a)} <span class="small muted">${score(a.w, a.d, a.l)}%</span>` : '<span class="small muted">not reached</span>'}</span>
        <span class="o2s-tn small muted">${e.n ? `${e.n} played to the end` : ''}</span></div>`).join('') || '<p class="small muted">No lines.</p>'}</div></details>`).join('');
    // Lichess
    const hasSt = !!H().statsAt;
    const likely = lines.filter(l => l.reach != null).sort((a, b) => b.reach - a.reach).slice(0, 8);
    const chapSt = c.chapters.map(ch => {
      const seenK = new Set(), pts = [];
      for (const id of ch.lines) for (const s of (c.seq[id] || [])) {
        if (s.n.mine) continue;
        const k = posKey(s.fen); if (seenK.has(k)) continue; seenK.add(k);
        const reps = (c.children.get(k) || []).filter(i => !c.nodes[i].mine);
        if (reps.length < 2) continue;
        const st = hasSt ? H().statsAt(s.fen) : null;
        if (st) pts.push({ s, st, reps });
      }
      return { ch, pts: pts.slice(0, 4) };
    }).filter(x => x.pts.length);
    const bp = ({ s, st, reps }) => {
      const cs = new Set(reps.map(i => norm(c.nodes[i].san))), shown = new Set();
      const rows = st.m.filter((m, i) => cs.has(norm(m[0])) || i < 4).slice(0, 7).map(m => { shown.add(norm(m[0])); const inC = cs.has(norm(m[0])); return `<div class="o2s-st${inC ? '' : ' off'}"><b>${esc(m[0])}</b>${bar(m[1] / st.n, inC ? 'c' : '')}<span class="small">${pct(m[1] / st.n)}</span><span class="small muted">${m[2] != null ? `score ${pct(m[2])}` : ''}${inC ? '' : ' · not in the course'}</span></div>`; }).join('');
      return `<div class="o2s-bp"><span class="eyebrow">${s.ply > 1 ? `After ${esc(moveLabel(s.ply - 1, prevSan(c, s)))}` : 'Start position'} · opponent to move</span>${rows}<p class="small muted">${st.n.toLocaleString()} games</p></div>`;
    };
    const endSt = lines.map(l => { const q = c.seq[l.id]?.[c.seq[l.id].length - 1]; if (!q || !hasSt) return null; const st = H().statsAt(q.fen), m = st?.m.find(x => norm(x[0]) === norm(q.san)); return m ? { l, q, m, st } : null; }).filter(Boolean);
    const opening = `<p class="small muted">${STAT_NOTE}</p>
      ${likely.length ? `<h4 class="o2s-h2">Most likely lines for you</h4><div class="o2s-trows">${likely.map(l => `<div class="o2s-trow"><span class="o2s-tl"><b>${esc(l.title)}</b></span>${bar(l.reach)}<span class="small">${reachWords(l.reach)}</span></div>`).join('')}</div>` : '<p class="muted small">Statistics for these lines arrive with the weekly update.</p>'}
      ${chapSt.length ? `<h4 class="o2s-h2">What opponents play at the branch points</h4>${chapSt.map(({ ch, pts }) => `<details class="o2-chap"><summary><span class="t">${esc(ch.title)}</span><span class="small muted">${plural(pts.length, 'position')}</span></summary><div class="o2s-bps">${pts.map(bp).join('')}</div></details>`).join('')}` : '<p class="muted small">Statistics for the branch points arrive with the weekly update.</p>'}
      ${endSt.length ? `<h4 class="o2s-h2">Score of the last move of each line</h4><div class="o2s-trows">${endSt.slice(0, 40).map(({ l, q, m, st }) => `<div class="o2s-trow"><span class="o2s-tl"><b>${esc(l.title)}</b><br><span class="small muted">${esc(moveLabel(q.ply, q.san))}</span></span><span class="small">${pct(m[1] / st.n)} play it</span><span class="small">${m[2] != null ? `score ${pct(m[2])}` : ''}</span></div>`).join('')}</div>` : ''}`;
    // training
    const lv = Array.from({ length: 8 }, () => 0);
    for (const k of c.cards) lv[O2.srs.get(c, k.id)?.lv || 0]++;
    const mxl = Math.max(1, ...lv), o2d = H().progress.o2d || {}, days = [], t0 = new Date(O2.now());
    for (let i = 13; i >= 0; i--) { const d = new Date(t0); d.setDate(d.getDate() - i); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; days.push({ k, d, v: o2d[k] || null }); }
    const rev = days.reduce((a, x) => a + (x.v?.rev || 0), 0), wr = days.reduce((a, x) => a + (x.v?.wrong || 0), 0), mxd = Math.max(1, ...days.map(x => x.v?.rev || 0));
    let streak = 0; { const d = new Date(t0), key = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; if (!o2d[key(d)]) d.setDate(d.getDate() - 1); while (o2d[key(d)]) { streak++; d.setDate(d.getDate() - 1); } }
    const training = `<div class="o2s-g2"><div class="card"><span class="eyebrow">Moves by level</span><div class="o2-lv">${lv.map((n, j) => `<div><span>${j ? 'L' + j : 'New'}</span><i style="width:${n / mxl * 100}%"></i><b>${n}</b></div>`).join('')}</div></div>
      <div class="card"><span class="eyebrow">Reviews per day (last 14 days, all courses)</span>
        <div class="o2s-days">${days.map(x => `<div title="${esc(x.k)}: ${x.v?.rev || 0}"><i style="height:${(x.v?.rev || 0) / mxd * 100}%"></i><span>${x.d.getDate()}</span></div>`).join('')}</div>
        <p class="small">${rev ? `<b>${rev}</b> reviews · accuracy <b>${Math.round((1 - wr / rev) * 100)}%</b> · ` : 'No reviews in the last 14 days · '}streak <b>${streak}</b> ${streak === 1 ? 'day' : 'days'}</p></div></div>`;
    el.innerHTML = `
      <h3 class="o2s-h">Position reach in your games</h3>
      ${nG ? `<p class="small muted">How many of your ${nG} ${c.side === 'white' ? 'White' : 'Black'} games passed through each line's branch point, and how you scored.</p>${pr}
        <h4 class="o2s-h2">The 15 course positions you reach most</h4>
        <div class="o2s-trows">${heat.map(p => `<div class="o2s-trow"><span class="o2s-tl"><b>Before ${esc(moveLabel(p.ply, p.san))}</b><br><span class="small muted">${esc(p.line.title)}</span></span>${bar(p.n / mx)}<span class="o2s-tn"><b>${p.n}</b> ${outcome(p)}</span></div>`).join('') || '<p class="muted small">None of your games reached a course position beyond move 1 yet.</p>'}</div>`
        : empty('No games yet', 'Your games from chess.com appear here after the next update.')}
      <h3 class="o2s-h">Opening statistics (Lichess 1200-1600)</h3>${opening}
      <h3 class="o2s-h">Training</h3>${training}`;
  }
  function prevSan(c, s) {   // SAN of the ply before s in its line
    for (const seq of Object.values(c.seq)) { const i = seq.indexOf(s); if (i > 0) return seq[i - 1].san; }
    return '';
  }

  /* ================================================================ Traps */
  const TK = { set: ['Set it', 'You set it: the natural reply loses.'], avoid: ['Avoid it', 'A pitfall for you: find the safe move.'], punish: ['Punish it', 'The opponent errs: find the refutation.'] };
  function tabTraps(c, el) {
    const ts = c.traps || [];
    if (!ts.length) { el.innerHTML = empty('No traps yet', 'Traps and pitfalls for this course arrive with the next update.'); return; }
    el.innerHTML = `<p class="muted small">Short positions where a natural move loses. "Set it" traps catch your opponent, "Avoid it" are pitfalls for you, "Punish it" show how to win after a mistake.</p>
      <div class="o2s-cards">${ts.map(t => {
        const p = H().progress.o2t?.[`${c.id}/${t.id}`], k = TK[t.kind] || [t.kind, ''];
        const ns = (t.nodes || []).map(id => c.nodes[id]).filter(Boolean);
        return `<div class="card o2s-trap"><div class="o2s-mini big" data-mini="${esc(seqFen(c, t.nodes || []))}" data-orient="${c.side}"></div>
          <div class="o2s-tb"><span class="o2-kind ${t.kind === 'avoid' ? 'draft' : t.kind === 'set' ? 'main' : 'punish'}">${esc(k[0])}</span>${p?.ok ? `<span class="o2s-fixed">Solved ✓</span>` : ''}
          <h3>${esc(t.title)}</h3><p class="small">${O2.rich(t.intro || k[1])}</p>
          <p class="small muted">${p?.n ? `Tried ${plural(p.n, 'time')} · first try ${p.ok || 0}×` : 'Not tried yet'}</p>
          <div class="controls">${ns.length ? `<button class="btn primary" data-s="trap" data-t="${esc(t.id)}">${p?.n ? 'Try again' : 'Try it'}</button>` : ''}</div></div></div>`;
      }).join('')}</div>`;
    el.onclick = e => {
      const b = e.target.closest('[data-s="trap"]'); if (!b) return;
      const t = ts.find(x => x.id === b.dataset.t); if (t) playTrap(c, t);
    };
  }
  function playTrap(c, t) {
    const ns = (t.nodes || []).map(id => c.nodes[id]).filter(Boolean);
    const moves = ns.map(n => ({ san: n.san, ask: !!n.mine, shapes: n.shapes || [],
      c: [n.c, ...(n.x || []).map(x => `Don't play ${x.san}: ${x.why}`)].filter(Boolean).join(' '),
      prompt: t.kind === 'avoid' ? 'Careful: which move is safe here?' : 'Find the strongest move.' }));
    O2.playScript({ c, label: `${(TK[t.kind] || [t.kind])[0]} · trap`, title: t.title, intro: t.intro || '', moves, back: () => O2.show('course', c.id),
      onDone: r => { const key = `${c.id}/${t.id}`, p = H().progress.o2t?.[key] || {}; H().record('o2t', key, { ok: (p.ok || 0) + (r.wrong ? 0 : 1), n: (p.n || 0) + 1 }); H().onChange?.(); } });
  }

  /* ================================================================ Model games */
  const V = { cid: null, id: null, ply: 0, guess: false, gOk: 0, gN: 0, miss: 0, flip: false };
  let vboard = null;
  const destroyBoard = () => { try { vboard?.destroy(); } catch {} vboard = null; };
  function tabModels(c, el) {
    destroyBoard();
    const ms = c.models || [];
    if (V.cid === c.id && ms.some(m => m.id === V.id)) return viewer(c, el, ms.find(m => m.id === V.id));
    V.cid = null;
    if (!ms.length) { el.innerHTML = empty('No model games yet', 'Verified master games for this course arrive with the next update.'); return; }
    el.innerHTML = `<p class="muted small">Famous games that pass through this course. Step through them with the notes, or try to guess your side's moves.</p>
      <div class="o2s-cards">${ms.map(m => {
        const p = H().progress.o2m?.[`${c.id}/${m.id}`];
        return `<div class="card o2s-model"><span class="eyebrow">${esc(m.year || '')} · ${esc(m.result || '')}</span>
          <h3>${esc(m.white)}${m.wr ? ` <span class="small muted">${esc(m.wr)}</span>` : ''} vs ${esc(m.black)}${m.br ? ` <span class="small muted">${esc(m.br)}</span>` : ''}</h3>
          <p class="small muted">${plural((m.moves || []).length, 'move')} (plies)${(m.hits || []).length ? ` · passes through ${plural(m.hits.length, 'course position')}` : ''}${p?.seen ? ' · seen ✓' : ''}${p?.score != null ? ` · guessed ${pct(p.score)}` : ''}</p>
          <div class="controls"><button class="btn primary" data-s="open" data-m="${esc(m.id)}">Open</button></div></div>`;
      }).join('')}</div>`;
    el.onclick = e => { const b = e.target.closest('[data-s="open"]'); if (!b) return; Object.assign(V, { cid: c.id, id: b.dataset.m, ply: 0, guess: false, gOk: 0, gN: 0, miss: 0, flip: false }); tabModels(c, el); };
  }
  function viewer(c, el, m) {
    const moves = m.moves || [], side = c.side === 'white' ? 'white' : 'black';
    const b = new Chess(), hist = [];
    for (let i = 0; i < moves.length; i++) {
      const key = posKey(b.fen()), kids = c.children.get(key) || [], mv = b.move(moves[i], { sloppy: true });
      if (!mv) break;
      const hit = kids.find(id => norm(c.nodes[id].san) === norm(mv.san));
      hist.push({ san: mv.san, from: mv.from, to: mv.to, fen: b.fen(), hit });
    }
    V.ply = Math.max(0, Math.min(hist.length, V.ply));
    const cur = V.ply ? hist[V.ply - 1] : null, prevFen = cur ? cur.fen : new Chess().fen();
    const nextMine = V.ply < hist.length && ((V.ply % 2 === 0) === (c.side === 'white'));
    const note = m.notes?.[String(V.ply)], hn = cur?.hit && c.nodes[cur.hit];
    el.innerHTML = `<div class="o2s-v">
      <div class="backrow"><button class="btn" data-s="close">← Model games</button></div>
      <h3>${esc(m.white)} vs ${esc(m.black)} <span class="small muted">${esc(m.year || '')} · ${esc(m.result || '')}</span></h3>
      <div class="o2s-vgrid"><div><div class="o2s-board" id="o2s-board"></div>
        <div class="controls o2s-vc"><button class="btn" data-s="first" aria-label="Start">⏮</button><button class="btn" data-s="prev">◀ Back</button><button class="btn primary" data-s="next">Next ▶</button><button class="btn" data-s="last" aria-label="End">⏭</button><button class="btn" data-s="flip">Flip</button></div>
        <label class="o2-check"><input type="checkbox" data-s="guess"${V.guess ? ' checked' : ''}> Guess the move for ${side === 'white' ? 'White' : 'Black'}${V.gN ? ` · ${V.gOk}/${V.gN} first try` : ''}</label></div>
      <div><div class="card o2s-vnote" aria-live="polite">${V.guess && nextMine ? `<span class="eyebrow">Your turn</span><p>What did ${side === 'white' ? 'White' : 'Black'} play here?</p>` : cur ? `<div class="o2-mv"><b>${esc(moveLabel(V.ply, cur.san))}</b></div>${note ? `<p>${O2.rich(note)}</p>` : '<p class="small muted">No note for this move.</p>'}` : '<p class="small muted">Press Next to start the game.</p>'}
        ${hn && !(V.guess && nextMine) ? `<p class="small"><span class="o2s-key course">course position</span> ${hn.c ? O2.rich(hn.c) : 'The course plays this move too.'}</p>` : ''}</div>
      <div class="o2s-chips">${hist.map((h, i) => `<button class="o2-chip${h.hit ? ' course' : ''}${i + 1 === V.ply ? ' cur' : ''}" data-s="go" data-i="${i + 1}">${i % 2 === 0 ? `<span class="no">${i / 2 + 1}.</span>` : ''}${esc(h.san)}</button>`).join('')}</div>
      <p class="small muted"><span class="o2s-key course">green</span> = a move that is also in this course.</p></div></div></div>`;
    const cfg = { fen: prevFen, orientation: V.flip ? (side === 'white' ? 'black' : 'white') : side, coordinates: true, animation: { duration: 200 }, lastMove: cur ? [cur.from, cur.to] : undefined,
      viewOnly: false, movable: { free: false, color: undefined, dests: new Map() }, drawable: { enabled: false } };
    if (V.guess && nextMine && !V.flip) {
      const t = new Chess(prevFen), d = new Map(); for (const mv of t.moves({ verbose: true })) { if (!d.has(mv.from)) d.set(mv.from, []); d.get(mv.from).push(mv.to); }
      cfg.movable = { free: false, color: side, dests: d, showDests: true, events: { after: (o, dd) => guess(c, el, m, hist, o, dd) } };
      cfg.turnColor = side;
    }
    vboard = H().Chessground(el.querySelector('#o2s-board'), cfg);
    if (V.guess && nextMine && V.miss >= 2) { const nx = hist[V.ply]; vboard.setShapes([{ orig: nx.from, dest: nx.to, brush: 'blue' }]); }
    if (V.ply === hist.length && hist.length) { const key = `${c.id}/${m.id}`; if (!H().progress.o2m?.[key]?.seen) H().record('o2m', key, { seen: 1, score: V.gN ? V.gOk / V.gN : null }); }
    el.onclick = e => {
      const t = e.target.closest('[data-s]'); if (!t) return;
      const s = t.dataset.s;
      if (s === 'close') { V.cid = null; return tabModels(c, el); }
      if (s === 'first') V.ply = 0; if (s === 'prev') V.ply--; if (s === 'next') V.ply++; if (s === 'last') V.ply = hist.length;
      if (s === 'go') V.ply = +t.dataset.i;
      if (s === 'flip') V.flip = !V.flip;
      if (s === 'guess') return;
      V.miss = 0; viewer(c, el, m);
    };
    el.onchange = e => { if (e.target.dataset.s === 'guess') { V.guess = e.target.checked; V.miss = 0; viewer(c, el, m); } };
  }
  function guess(c, el, m, hist, o, d) {
    const want = hist[V.ply], t = new Chess(V.ply ? hist[V.ply - 1].fen : undefined), mv = t.move({ from: o, to: d, promotion: 'q' });
    if (mv && norm(mv.san) === norm(want.san)) {
      V.gN++; if (!V.miss) V.gOk++; V.miss = 0; V.ply++;
      if (V.ply >= hist.length - 1) H().record('o2m', `${c.id}/${m.id}`, { seen: 1, score: V.gN ? V.gOk / V.gN : null });
      return viewer(c, el, m);
    }
    V.miss++; O2.toast(`<b>${esc(mv ? mv.san : 'That')}</b> is not what was played. Try again.`, 2200);
    setTimeout(() => viewer(c, el, m), 250);
  }

  /* ================================================================ "Stats here" drawer */
  let drawer = null;
  function closeDrawer() { if (drawer) drawer.hidden = true; }
  function statsHere({ c, fen }) {
    const root = document.getElementById('o2'); if (!root || !c) return;
    if (!drawer || !root.contains(drawer)) {
      drawer = document.createElement('div'); drawer.id = 'o2s-drawer'; drawer.className = 'o2s-drawer'; drawer.hidden = true; root.append(drawer);
      drawer.addEventListener('click', e => { if (e.target === drawer || e.target.closest('[data-s="x"]')) closeDrawer(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    }
    const key = posKey(fen), myTurn = (fen.split(' ')[1] === 'w') === (c.side === 'white');
    const kids = (c.children.get(key) || []).map(id => c.nodes[id]), cs = new Set(kids.map(n => norm(n.san)));
    const st = H().statsAt?.(fen);
    const lich = st ? `<div class="o2s-bps">${st.m.slice(0, 8).map(m => { const inC = cs.has(norm(m[0])); return `<div class="o2s-st${inC ? '' : ' off'}"><b>${esc(m[0])}</b>${bar(m[1] / st.n, inC ? 'c' : '')}<span class="small">${pct(m[1] / st.n)}</span><span class="small muted">${m[2] != null ? `score ${pct(m[2])}` : ''}${inC ? ' · course' : ''}</span></div>`; }).join('')}<p class="small muted">${st.n.toLocaleString()} games, Lichess players rated 1200-1600. Score is for the player making the move.</p></div>`
      : '<p class="small muted">Statistics for this position arrive with the weekly update.</p>';
    const e = index(c.side).get(key), side = e && (myTurn ? e.me : e.opp), ids = new Set();
    if (e) for (const sd of [e.me, e.opp]) for (const v of sd.values()) v.games.forEach(g => ids.add(g.id));
    const mine = side ? [...side.entries()].sort((a, b) => b[1].ids.size - a[1].ids.size) : [];
    const yg = ids.size ? `<p>You reached this position in <b>${plural(ids.size, 'game')}</b>.</p>
      <p class="small muted">${myTurn ? 'Your moves here' : 'Your opponents played'}:</p>
      <div class="o2s-trows">${mine.map(([san, v]) => `<div class="o2s-trow"><span class="o2s-tl"><b>${esc(san)}</b> <span class="small muted">${cs.has(norm(san)) ? 'course move' : kids.length ? 'not in the course' : ''}</span></span><span class="o2s-tn"><b>${v.ids.size}</b>× ${outcome(v)}</span>
        <span class="o2s-gl">${v.games.slice(0, 6).map(g => `<a href="${esc(g.g.url)}" target="_blank" rel="noopener" title="${esc(`${g.g.opp || ''} ${when(g.g)}`)}">${RES[g.res] || '?'} ${esc(when(g.g))}</a>`).join('')}</span></div>`).join('')}</div>`
      : '<p class="small muted">None of your games reached this position.</p>';
    drawer.innerHTML = `<div class="o2s-sheet card" role="dialog" aria-label="Stats for this position"><div class="o2s-sh"><h3>Stats for this position</h3><button class="btn" data-s="x">Close</button></div>
      <span class="eyebrow">What players like you play</span>${lich}
      <span class="eyebrow">In your games</span>${yg}</div>`;
    drawer.hidden = false;
    drawer.querySelector('button')?.focus();
  }

  /* ================================================================ home strip */
  function homeStrip(el) {
    const items = [];
    for (const c of O2.courses()) for (const x of analyse(c).games) items.push({ c, x });
    const best = new Map();
    for (const it of items) { const o = best.get(it.x.pg.id); if (!o || it.x.depth > o.x.depth) best.set(it.x.pg.id, it); }
    const rows = [...best.values()].sort((a, b) => b.x.pg.end - a.x.pg.end).slice(0, 5);
    const tot = parsed().length;
    el.insertAdjacentHTML('beforeend', `<section class="o2s-strip"><h3 class="o2s-h">Your recent games</h3>${
      !tot ? '<p class="muted small">Your chess.com games appear here after the next update.</p>'
        : !rows.length ? '<p class="muted small">None of your games entered a course yet.</p>'
        : `<div class="o2s-list">${rows.map(({ c, x }) => `<button class="card o2s-srow" data-s="game" data-c="${esc(c.id)}" data-g="${esc(x.pg.id)}">${resPill(x.pg.res)}<span class="o2s-gt"><b>vs ${esc(x.pg.g.opp || '?')}</b> <span class="small muted">${esc(c.title)} · ${esc(when(x.pg.g))}</span><br><span class="small">${esc(leftText(x))}</span></span></button>`).join('')}</div>`}</section>`);
    el.querySelector('.o2s-strip:last-child')?.addEventListener('click', e => {
      const b = e.target.closest('[data-s="game"]'); if (!b) return;
      OPEN[b.dataset.c] = b.dataset.g; H().store.set('o2tab.' + b.dataset.c, 'games'); O2.show('course', b.dataset.c);
    });
  }

  /* ================================================================ install */
  O2.addSection({ id: 'traps', label: 'Traps', render: tabTraps });
  O2.addSection({ id: 'models', label: 'Model games', render: tabModels });
  O2.addSection({ id: 'games', label: 'Your games', render: tabGames });
  O2.addSection({ id: 'stats', label: 'Stats', render: tabStats });
  O2.addHomeBlock(homeStrip);
  O2.hooks.statsHere = statsHere;
  O2.stats = { statsHere, reach, analyse, parsed, index };
})();
