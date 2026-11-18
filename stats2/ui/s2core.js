/* ============================================================================================
   S2: the rebuilt Stats tab. Plain script, no imports, everything lives inside the S2 object, so it can be pasted into
   the app's module script (placeholder S2_JS) next to O2 and T2 without name clashes. Plan: stats2/PLAN.md.
   Answers two questions: "Am I getting better?" and "What should I train next?" Every answer has a button.

   S2.init({ root, data, hooks })
     root   the #s2 element from s2.html
     data   { mine: MINE2 }   mine2.json (its "stats" and "plays"); may be null: the parts that need it shrink
     hooks  games           the analysed games (GAMES, sorted by date). Fields the app adds (myWin, acc, acpl, nb, nm, family,
                            plies[].cpl) are used when present and worked out here when not.
            progress        the app's progress object (reads t2x: which play-outs are converted)
            goToday()                   open the Today tab
            openCourse(id)              open a Train course ('convert', 'think')
            practiseTheme(groupId)      start Train puzzles for a theme group (hanging, fork, defend, removal, backrank, mate1)
            canPractise(groupId)        optional: true when that theme can be practised (puzzles loaded)
            playOut(playId)             start a Train play-out ('cv/<game id>-<ply>')
            openGame(url)               open one game in the Games tab
            seeGames({color, family})   open the Games list filtered by colour and opening family
            openingCourses()            [{id, title, side, games:[{g, devBy:'me'|'opp'|null, devPly}]}]  (O2 courses with where
                                        each of your games left the course)
            studyCourse(id)             open an Openings course
            fixCourse(id)               open the course's "Your games" tab
            now()                       optional: current time in ms (tests)
   S2.refresh()   draw (first call) or redraw. Cheap; call it whenever the tab opens or progress changed.
   S2.GLOSSARY    rows for the app's glossary ([id, title, text]).
   ============================================================================================ */
const S2 = (() => {
  'use strict';
  let ROOT = null, H = {}, D = {}, G = [], drawn = false, token = 0;
  const DAY = 86400;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const pct = x => Math.round(x * 100) + '%';
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const fmtDay = t => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const has = k => typeof H[k] === 'function';
  const isMine = (g, i) => (i % 2 === 0) === (g.color === 'white');
  const serious = p => p.lab === 'blunder' || p.lab === 'mistake';
  const nowSec = () => (has('now') ? H.now() : Date.now()) / 1000;
  const openingName = slug => (slug || 'Unknown').replace(/-/g, ' ').replace(/\s+\d.*$/, '').replace(/\.{3}.*/, '').trim();
  const openingFamily = slug => openingName(slug).split(' ').slice(0, 3).join(' ').trim();

  /* ---------------------------------------------------------------- per-game numbers (used from the app when present) */
  const evalAt = (g, k) => (k < g.plies.length ? g.plies[k].e : g.final);
  function winW(e, len) {
    if (!e) return 50;
    if (e.m !== undefined) return e.m === 0 ? (len % 2 === 1 ? 100 : 0) : e.m > 0 ? 100 : 0;
    const cp = Math.max(-1000, Math.min(1000, e.cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }
  function cpW(e, len) {
    if (!e) return 0;
    if (e.m !== undefined) return e.m === 0 ? (len % 2 === 1 ? 1000 : -1000) : e.m > 0 ? 1000 : -1000;
    return Math.max(-1000, Math.min(1000, e.cp));
  }
  const moveAcc = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  function prep(g) {
    const n = g.plies.length;
    if (g.myWin === undefined) { const w = [...g.plies.map((_, k) => winW(evalAt(g, k), n)), winW(g.final, n)]; g.myWin = g.color === 'white' ? w : w.map(x => 100 - x); }
    if (n && g.plies[0].cpl === undefined) g.plies.forEach((p, i) => { p.cpl = Math.max(0, (i % 2 === 0 ? 1 : -1) * (cpW(evalAt(g, i), n) - cpW(evalAt(g, i + 1), n))); });
    const mine = g.plies.filter((p, i) => isMine(g, i));
    if (g.nb === undefined) { g.nb = mine.filter(p => p.lab === 'blunder').length; g.nm = mine.filter(p => p.lab === 'mistake').length; }
    if (g.acpl === undefined) g.acpl = avg(mine.map(p => p.cpl));
    if (g.acc === undefined) {
      const a = mine.map(p => moveAcc(p.loss)), mean = avg(a), harm = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
      g.acc = a.length ? (mean + harm) / 2 : null;
    }
    if (g.family === undefined) g.family = openingFamily(g.opening);
  }

  /* ---------------------------------------------------------------- shared small pieces */
  const gl = (term, text) => `<button class="gl" data-term="${term}">${esc(text)}</button>`;
  const btn = (label, attrs, cls = '') => `<button class="btn ${cls}" ${attrs}>${esc(label)}</button>`;
  // same rule as mine2 (build_mine2.py): a position before one of the moves reached 85%; the final position alone does not count
  const winning = g => Math.max(...g.myWin.slice(0, g.plies.length)) >= 85;
  function summ(gs) {
    const win = gs.filter(winning);
    return { n: gs.length, slips: gs.length ? gs.reduce((s, g) => s + g.nb + g.nm, 0) / gs.length : null, reached: win.length, kept: win.filter(g => g.result === 'win').length,
      rating: gs.length ? gs[gs.length - 1].myRating : null };
  }
  const arrow = (delta, lowerIsBetter, fmt, flatBelow = 0) => {
    if (delta == null) return '';
    if (Math.abs(delta) <= flatBelow) return '<span class="s2-d">→ about the same</span>';
    const good = (delta < 0) === lowerIsBetter;
    return `<span class="s2-d ${good ? 'good' : 'bad'}">${delta < 0 ? '▼' : '▲'} ${fmt(Math.abs(delta))}</span>`;
  };

  /* ================================================================ A. verdict */
  function windows() {
    const now = nowSec(), cut = now - 30 * DAY;
    const cur = G.filter(g => g.end >= cut && g.end <= now), prev = G.filter(g => g.end < cut && g.end >= cut - 30 * DAY);
    if (cur.length >= 10 && prev.length >= 10) return { label: 'Your last 30 days', cur, prev, before: G.filter(g => g.end < cut) };
    const k = 15, c = G.slice(-k), p = G.slice(-2 * k, -k);
    return { label: c.length < k ? `Your ${plural(c.length, 'game')}` : 'Your last 15 games', cur: c, prev: p.length >= 8 ? p : [], before: G.slice(0, Math.max(0, G.length - c.length)) };
  }
  function verdict() {
    if (!G.length) return `<section class="card"><p class="muted">No analysed games yet. They arrive with the next update.</p></section>`;
    const w = windows(), a = summ(w.cur), b = w.prev.length ? summ(w.prev) : null, base = w.before.length ? w.before[w.before.length - 1].myRating : null;
    const rDelta = base != null ? a.rating - base : null;
    const sDelta = b ? a.slips - b.slips : null;
    const kRate = a.reached >= 4 ? a.kept / a.reached : null, kPrev = b && b.reached >= 4 ? b.kept / b.reached : null;
    const kDelta = kRate != null && kPrev != null ? (kRate - kPrev) * 100 : null;
    const better = [], worse = [];
    if (sDelta != null && sDelta <= -0.3) better.push(`${f1(-sDelta)} fewer serious slips per game`); else if (sDelta != null && sDelta >= 0.3) worse.push(`${f1(sDelta)} more serious slips per game`);
    if (rDelta != null && rDelta >= 15) better.push(`rating up ${rDelta}`); else if (rDelta != null && rDelta <= -15) worse.push(`rating down ${-rDelta}`);
    if (kDelta != null && kDelta >= 10) better.push('more winning positions kept'); else if (kDelta != null && kDelta <= -10) worse.push('fewer winning positions kept');
    let say = '';
    if (!b) say += 'Not enough earlier games to compare yet. ';
    else if (!better.length && !worse.length) say += 'About the same as before. ';
    if (better.length) say += `Better than before: ${better.join(', ')}. `;
    if (worse.length) say += `Worse than before: ${worse.join(', ')}. `;
    if (kRate != null && kRate < 0.75) say += 'Still weak: winning positions.';
    // good news: from what is going well in these games
    const good = [];
    if (rDelta != null && rDelta > 0) good.push(`Your rating is up ${rDelta} points, to ${a.rating}.`);
    let oppBl = 0, punished = 0;
    for (const g of w.cur) g.plies.forEach((p, i) => { if (!isMine(g, i) && p.lab === 'blunder' && i + 1 < g.plies.length) { oppBl++; if (g.plies[i + 1].loss < 10) punished++; } });
    if (oppBl >= 3 && punished / oppBl >= 0.4) good.push(`You punished ${punished} of your opponents' ${oppBl} blunders.`);
    if (w.cur.length >= 5 && !w.cur.some(g => g.result === 'loss' && g.how === 'timeout')) good.push('You did not lose a game on time.');
    const tile = (name, value, sub, delta) => `<div class="s2-tile"><span class="eyebrow">${name}</span><b class="s2-v num">${value}</b><span class="s2-sub">${sub}</span>${delta || '<span class="s2-d muted">Not enough games to compare yet</span>'}</div>`;
    const first = w.cur[0], last = w.cur[w.cur.length - 1];
    return `<section class="card s2-verdict">
      <span class="eyebrow">${w.label} · ${a.n} games${first ? ` · ${fmtDay(first.end)} to ${fmtDay(last.end)}` : ''}</span>
      <p class="s2-say">${esc(say.trim())}</p>
      <div class="s2-tiles">
        ${tile('Rating', a.rating, 'rapid, now', arrow(rDelta, false, v => v, 0))}
        ${tile(gl('slip', 'Serious slips'), f1(a.slips), 'per game', arrow(sDelta, true, v => f1(v), 0.05))}
        ${tile('Winning positions kept', `${a.kept} of ${a.reached}`, a.reached ? pct(a.kept / a.reached) : 'none reached', arrow(kDelta, false, v => Math.round(v) + ' pts', 2))}
      </div>
      ${good.length ? `<ul class="s2-good">${good.slice(0, 2).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${has('goToday') ? `<div class="s2-actions">${btn('Start the session', 'data-act="today"', 'primary')}</div>` : ''}
    </section>`;
  }

  /* ================================================================ B. progress by month */
  const mkey = g => { const d = new Date(g.end * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const mlabel = k => { const [y, m] = k.split('-'); return `${MON[+m - 1]} ${y.slice(2)}`; };
  function rowStats(gs) {
    const s = summ(gs); let ser = 0, fast = 0;
    for (const g of gs) g.plies.forEach((p, i) => { if (isMine(g, i) && serious(p) && p.t != null) { ser++; if (p.t < 5) fast++; } });
    return { ...s, fast: ser >= 3 ? fast / ser : null, ser };
  }
  function monthsBlock() {
    const by = new Map();
    for (const g of G) { const k = mkey(g); (by.get(k) || by.set(k, []).get(k)).push(g); }
    const keys = [...by.keys()].sort(), quiet = keys.filter(k => by.get(k).length < 5);
    const rows = [];
    let quietDone = false;
    for (const k of keys) {
      if (by.get(k).length >= 5) rows.push({ label: mlabel(k), ...rowStats(by.get(k)) });
      else if (!quietDone) {
        quietDone = true;
        const gs = quiet.flatMap(q => by.get(q)), a = quiet[0];
        rows.push({ label: quiet.length === 1 ? mlabel(a) : 'Other', names: quiet.map(q => mlabel(q)).join(', '), quiet: quiet.length > 1, ...rowStats(gs) });
      }
    }
    if (!rows.length) return '';
    const mx = Math.max(...rows.map(r => r.slips || 0), 0.1);
    const body = rows.map(r => `<div class="s2-mrow${r.quiet ? ' quiet' : ''}"><span class="s2-ml">${esc(r.label)}</span><span class="num">${r.n}</span><span class="num">${r.rating}</span>
      <span class="s2-bar"><b class="num">${f1(r.slips)}</b><i style="width:${Math.max(2, r.slips / mx * 100)}%"></i></span>
      <span class="num">${r.reached ? `${r.kept}/${r.reached}` : '–'}</span><span class="num">${r.fast == null ? '–' : pct(r.fast)}</span></div>`).join('');
    return `<section class="card"><h3>Progress by month</h3>
      <p class="sub">One row per month. ${gl('slip', 'Serious slips')} are blunders and mistakes. Lower is better.</p>
      <div class="s2-mtab"><div class="s2-mrow head"><span>Month</span><span>Games</span><span>Rating</span><span>Slips per game</span><span>Kept</span><span>Fast</span></div>${body}</div>
      <p class="small muted s2-foot">Rating is the last one that month. Kept = winning positions you won, out of those you reached. Fast = share of your serious slips played in under 5 seconds.${rows.some(r => r.quiet) ? ` Other = ${rows.find(r => r.quiet).names}, grouped because each had fewer than 5 games.` : ''}</p></section>`;
  }

  /* ================================================================ C. won positions */
  function wonBlock() {
    const st = D.mine?.stats, w = st?.won;
    const reached = w ? w.reached : G.filter(winning).length, kept = w ? w.kept : G.filter(g => winning(g) && g.result === 'win').length;
    if (!reached) return `<section class="card"><h3>Winning positions</h3><p class="muted">No winning positions found in your games yet.</p></section>`;
    const thrown = w?.thrown || [], plays = D.mine?.plays || [], t2x = H.progress?.t2x || {};
    const playFor = t => plays.find(p => p.id.startsWith(`cv/${t.gid}-`));
    const mv = median(thrown.map(t => Math.ceil(t.ply / 2)));
    const bm = new Map();
    for (const g of G) { if (!winning(g)) continue; const k = mkey(g), o = bm.get(k) || bm.set(k, { k, r: 0, w: 0 }).get(k); o.r++; if (g.result === 'win') o.w++; }
    const months = [...bm.values()].filter(o => o.r >= 3).sort((a, b) => a.k.localeCompare(b.k));
    const list = thrown.slice(0, 5).map(t => {
      const p = playFor(t), done = p && t2x[p.id]?.ok, g = G.find(x => x.url && x.url.endsWith('/' + t.gid));
      const act = p && has('playOut') ? btn('Play it out', `data-act="pplay" data-id="${esc(p.id)}"`) : g && has('openGame') ? btn('See game', `data-act="game" data-url="${esc(g.url)}"`) : '';
      return `<div class="s2-row"><div><b>vs ${esc(t.opp || '?')}</b><div class="small muted">${t.end ? fmtDate(t.end) : ''} · move ${Math.ceil(t.ply / 2)} · ${esc(t.result || '')}${done ? ' · converted ✓' : ''}</div></div>${act}</div>`;
    }).join('');
    return `<section class="card"><h3>Winning positions: your main weakness</h3>
      <p class="s2-big num">${kept} of ${reached} <span class="muted">kept (${pct(kept / reached)})</span></p>
      <p class="s2-read">You reached a ${gl('winchance', 'winning position')} in ${reached} games and won ${kept} of them.${thrown.length ? ` ${thrown.length} were thrown away.` : ''}${mv ? ` It usually goes wrong around move ${mv}.` : ''}</p>
      ${months.length ? `<div class="s2-bars">${months.map(o => `<div class="s2-brow"><span class="small">${mlabel(o.k)}</span><i style="width:${Math.max(2, o.w / o.r * 100)}%"></i><b class="num small">${o.w}/${o.r}</b></div>`).join('')}</div>` : ''}
      ${thrown.length ? `<h4>Last ${Math.min(5, thrown.length)} thrown away</h4><div class="s2-list">${list}</div>` : ''}
      ${has('openCourse') ? `<div class="s2-actions">${btn('Win the won game', 'data-act="course" data-c="convert"', 'primary')}</div>` : ''}</section>`;
  }

  /* ================================================================ D. thinking time */
  function tenseNumbers() {
    const r = { fast: { n: 0, bad: 0 }, slow: { n: 0, bad: 0 } };
    for (const g of G) g.plies.forEach((p, i) => {
      if (!isMine(g, i) || i < 1 || p.t == null || p.ph === 'opening') return;
      const prev = g.plies[i - 1], n = g.plies.length;
      const swing = Math.abs(cpW(evalAt(g, i), n) - cpW(evalAt(g, i - 1), n));
      if (!(/[+#]/.test(prev.san) || swing >= 100)) return;   // tense: the opponent just gave check, or their move moved the score by a pawn
      const o = p.t < 5 ? r.fast : r.slow; o.n++; if (serious(p)) o.bad++;
    });
    return r;
  }
  function timeBlock() {
    const c = D.mine?.stats?.clock;
    let fastShare = c?.fastShare, medBad = c?.medianBad, medOk = c?.medianOther;
    if (!c) {
      const bad = [], ok = [];
      for (const g of G) g.plies.forEach((p, i) => { if (isMine(g, i) && p.t != null) (serious(p) ? bad : ok).push(p.t); });
      if (bad.length) { fastShare = bad.filter(t => t < 5).length / bad.length; medBad = median(bad); medOk = median(ok); }
    }
    if (fastShare == null) return `<section class="card"><h3>Thinking time</h3><p class="muted">Clock numbers arrive after the next update of your games.</p></section>`;
    const t = tenseNumbers(), rf = t.fast.n ? t.fast.bad / t.fast.n : null, rs = t.slow.n ? t.slow.bad / t.slow.n : null;
    let verdictLine = '';
    if (rf != null && rs != null && t.fast.n >= 30 && t.slow.n >= 30) {
      verdictLine = rf >= rs * 1.25
        ? `Quick moves cost you in ${gl('tense', 'tense moments')}: moves under 5 seconds were a serious slip ${pct(rf)} of the time, slower ones ${pct(rs)}.`
        : `In ${gl('tense', 'tense moments')}, moves under 5 seconds were a serious slip ${pct(rf)} of the time and slower ones ${pct(rs)}. Speed alone is not what hurts you: the long thinks go wrong too, so use the time to check what is attacked and what can be taken.`;
    }
    const mm = new Map();
    for (const g of G) { const k = mkey(g); let o = mm.get(k); if (!o) mm.set(k, o = { k, n: 0, f: 0, games: 0 }); o.games++; g.plies.forEach((p, i) => { if (isMine(g, i) && serious(p) && p.t != null) { o.n++; if (p.t < 5) o.f++; } }); }
    const months = [...mm.values()].filter(o => o.n >= 5 && o.games >= 5).sort((a, b) => a.k.localeCompare(b.k));
    return `<section class="card"><h3>Thinking time</h3>
      <p class="s2-big num">${pct(fastShare)} <span class="muted">of your serious slips took under 5 seconds</span></p>
      <p class="s2-read">${medBad != null ? `A serious slip took you ${f1(medBad)} s, an ordinary move ${f1(medOk)} s (typical).` : ''}${verdictLine ? ` ${verdictLine}` : ''}</p>
      ${months.length ? `<div class="s2-bars fast">${months.map(o => `<div class="s2-brow"><span class="small">${mlabel(o.k)}</span><i style="width:${Math.max(2, o.f / o.n * 100)}%"></i><b class="num small">${pct(o.f / o.n)}</b></div>`).join('')}</div><p class="small muted s2-foot">Share of serious slips under 5 seconds, by month (months with at least 5 games).</p>` : ''}
      ${has('openCourse') ? `<div class="s2-actions">${btn('Practise Think first', 'data-act="course" data-c="think"', 'primary')}</div>` : ''}</section>`;
  }

  /* ================================================================ E. what your mistakes are */
  const KIND = { 'hung piece': 'Left a piece undefended', 'lost material': 'Lost material in a trade', 'missed capture': 'Missed a winning capture', 'fork': 'Walked into a fork',
    'walked into check': 'Allowed a strong check', 'allowed mate': 'Allowed a mating attack', 'missed mate': 'Missed a checkmate' };
  function kindsBlock() {
    const tags = D.mine?.stats?.tags;
    if (!tags) return `<section class="card"><h3>What your mistakes are</h3><p class="muted">Your mistake kinds arrive after the next update of your games.</p></section>`;
    const top = Object.entries(tags).filter(([k, v]) => k !== 'threw away win' && v.n).sort((a, b) => (b[1].per10 || 0) - (a[1].per10 || 0) || b[1].n - a[1].n).slice(0, 5);
    const phases = {};
    for (const g of G) g.plies.forEach((p, i) => { if (isMine(g, i) && serious(p)) for (const t of p.why || []) { const o = phases[t] ||= { opening: 0, middlegame: 0, endgame: 0 }; if (o[p.ph] != null) o[p.ph]++; } });
    const rows = top.map(([tag, v]) => {
      const ph = phases[tag], tot = ph ? ph.opening + ph.middlegame + ph.endgame : 0, best = tot ? Object.entries(ph).sort((a, b) => b[1] - a[1])[0] : null;
      const trend = v.prev30 == null || v.last30 == null ? '' : v.last30 < v.prev30 ? ' <span class="good" title="fewer than in the 30 games before">▼</span>' : v.last30 > v.prev30 ? ' <span class="bad" title="more than in the 30 games before">▲</span>' : ' →';
      const can = v.group && has('practiseTheme') && (!has('canPractise') || H.canPractise(v.group));
      return `<div class="s2-row"><div><b>${esc(KIND[tag] || cap1(tag))}</b>
        <div class="small muted">${f1(v.per10)} per 10 games${v.last30 != null ? ` · last 30 games: ${v.last30}${trend}` : ''}${best && best[1] / tot >= 0.4 ? ` · mostly in the ${best[0]} (${pct(best[1] / tot)})` : ''}</div></div>
        ${can ? btn('Practise', `data-act="theme" data-grp="${esc(v.group)}"`) : ''}</div>`;
    }).join('');
    return `<section class="card"><h3>What your mistakes are</h3>
      <p class="sub">The five most common causes behind your blunders and mistakes. One slip can have several causes. Throwing away a win is counted by game, in Winning positions above.</p>
      <div class="s2-list">${rows}</div></section>`;
  }

  /* ================================================================ F. openings */
  function openingsBlock() {
    const courses = has('openingCourses') ? H.openingCourses() : [];
    const inCourse = new Set(courses.flatMap(c => c.games.map(x => x.g)));
    const row = (name, gs, devs, extra) => {
      const n = gs.length, sc = gs.reduce((s, g) => s + (g.result === 'win' ? 1 : g.result === 'draw' ? .5 : 0), 0) / n;
      const w10 = avg(gs.map(g => g.myWin[Math.min(20, g.myWin.length - 1)]));
      const left = median(devs.filter(x => x.devBy === 'me' && x.devPly).map(x => Math.ceil(x.devPly / 2)));
      return `<div class="s2-copen"><div class="s2-chead"><b>${esc(name)}</b><span class="small muted">${plural(n, 'game')} · ${pct(sc)} score</span></div>
        <div class="small muted">${gl('winchance', 'Winning chance')} after 10 moves: ${Math.round(w10)}%${left ? ` · you usually leave the course at move ${left}` : ''}</div>${extra || ''}</div>`;
    };
    const parts = [];
    for (const c of courses) {
      if (!c.games.length) continue;
      const fam = {}; for (const x of c.games) fam[x.g.family] = (fam[x.g.family] || 0) + 1;
      const topFam = Object.entries(fam).sort((a, b) => b[1] - a[1])[0][0];
      parts.push(row(c.title, c.games.map(x => x.g), c.games, `<div class="s2-actions">${has('studyCourse') ? btn('Study this course', `data-act="study" data-c="${esc(c.id)}"`) : ''}${has('fixCourse') ? btn('Fix lines from your games', `data-act="fix" data-c="${esc(c.id)}"`) : ''}${has('seeGames') ? `<button class="s2-link" data-act="seegames" data-color="${c.side}" data-fam="${esc(topFam)}">See games</button>` : ''}</div>`));
    }
    const other = G.filter(g => !inCourse.has(g));
    if (courses.length && other.length) parts.push(row('Other openings', other, [], ''));
    // all openings, collapsed
    const tbl = color => {
      const fam = {};
      for (const g of G.filter(g => g.color === color)) (fam[g.family] ||= []).push(g);
      const rows = Object.entries(fam).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
      return `<div><div class="eyebrow">As ${cap1(color)}</div>${rows.map(([f, arr]) => {
        const w = arr.filter(g => g.result === 'win').length, d = arr.filter(g => g.result === 'draw').length, l = arr.length - w - d, s = arr.length;
        return `<button class="s2-orow" ${has('seeGames') ? `data-act="seegames" data-color="${color}" data-fam="${esc(f)}"` : ''}><span class="nm">${esc(f)}</span><span class="num">${s}</span>
          <span class="s2-wdl"><i class="w" style="width:${w / s * 100}%"></i><i class="d" style="width:${d / s * 100}%"></i><i class="l" style="width:${l / s * 100}%"></i></span><span class="num">${Math.round((w + d / 2) / s * 100)}%</span></button>`;
      }).join('')}</div>`;
    };
    return `<section class="card" id="s2-open"><h3>Openings: your results against your courses</h3>
      ${parts.length ? `<div class="s2-copens">${parts.join('')}</div>` : courses.length ? '' : '<p class="muted s2-loading">Loading your courses...</p>'}
      <details class="s2-more"><summary>All openings</summary><p class="sub">Grouped by the opening name chess.com gives. Tap a row to see those games.</p><div class="s2-otabs">${tbl('white')}${tbl('black')}</div></details></section>`;
  }

  /* ================================================================ G. more numbers */
  function moreBlock() {
    const n = G.length, myPlies = G.flatMap(g => g.plies.filter((p, i) => isMine(g, i))), oppPlies = G.flatMap(g => g.plies.filter((p, i) => !isMine(g, i)));
    const f0 = v => v == null ? '–' : v.toFixed(0);
    const gls = G.filter(g => g.acpl != null);
    const last20 = avg(gls.slice(-20).map(g => g.acpl)), prev20 = gls.length > 40 ? avg(gls.slice(-40, -20).map(g => g.acpl)) : null;
    const diff = last20 != null && prev20 != null ? last20 - prev20 : null;
    const calm = avg(myPlies.filter(p => p.cpl < 200).map(p => p.cpl));
    const accs = G.map(g => g.acc).filter(x => x != null);
    const tiles = [
      ['Overall', f0(avg(myPlies.map(p => p.cpl))), `across ${myPlies.length} of your moves`],
      ['Last 20 games', f0(last20), diff == null ? 'recent form' : Math.abs(diff) < 1 ? 'same as the 20 before' : `${diff < 0 ? '▼ better by' : '▲ worse by'} ${Math.abs(diff).toFixed(0)}`],
      ['Typical game', f0(median(gls.map(g => g.acpl))), 'the median game'],
      ['Opponents', f0(avg(oppPlies.map(p => p.cpl))), 'their average'],
      ['Without blunders', f0(calm), 'moves losing under 2 pawns'],
      ['Accuracy', accs.length ? avg(accs).toFixed(1) : '–', 'average per game, 0 to 100'],
    ].map(([k, v, s]) => `<div class="s2-tile"><span class="eyebrow">${k}</span><b class="s2-v num">${v}</b><span class="s2-sub">${s}</span></div>`).join('');
    // chart: one dot per game and a rolling average of 10
    const W = 520, Ht = 190, P = { l: 38, r: 10, t: 10, b: 22 };
    const top = Math.min(400, Math.ceil(Math.max(...gls.map(g => g.acpl)) / 50) * 50) || 50;
    const x = i => P.l + i / Math.max(1, n - 1) * (W - P.l - P.r), y = v => P.t + (1 - Math.min(v, top) / top) * (Ht - P.t - P.b);
    let svg = `<svg class="s2-chart" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Average mistake size per game over time">`;
    for (let v = 0; v <= top; v += 50) svg += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    G.forEach((g, i) => { if (g.acpl != null) svg += `<circle class="${g.result}" cx="${x(i).toFixed(1)}" cy="${y(g.acpl).toFixed(1)}" r="2.6"/>`; });
    const roll = G.map((g, i) => { const w = G.slice(Math.max(0, i - 9), i + 1).map(q => q.acpl).filter(v => v != null); return `${x(i).toFixed(1)},${y(avg(w) ?? 0).toFixed(1)}`; }).join(' ');
    svg += `<polyline class="roll" points="${roll}"/><text x="${P.l}" y="${Ht - 5}">${fmtDate(G[0].end)}</text><text x="${W - P.r}" y="${Ht - 5}" text-anchor="end">${fmtDate(G[n - 1].end)}</text></svg>`;
    const bars = rows => { const mx = Math.max(...rows.map(r => r.v || 0)) || 1; return `<div class="s2-bars">${rows.map(r => `<div class="s2-brow wide"><span class="small">${esc(r.name)}</span><i style="width:${Math.max(2, (r.v || 0) / mx * 100)}%"></i><b class="num small">${f0(r.v)} <span class="muted">${r.note}</span></b></div>`).join('')}</div>`; };
    const acplOf = a => avg(a.map(g => g.acpl).filter(v => v != null));
    const col = ['white', 'black'].map(c => ({ name: 'As ' + c, v: acplOf(G.filter(g => g.color === c)), note: `${G.filter(g => g.color === c).length}g` }));
    const rb = [['vs lower rated', g => g.oppRating < g.myRating - 50], ['similar (±50)', g => Math.abs(g.oppRating - g.myRating) <= 50], ['vs higher rated', g => g.oppRating > g.myRating + 50]]
      .map(([name, f]) => ({ name, v: acplOf(G.filter(f)), note: `${G.filter(f).length}g` }));
    const link = (g, t) => `<button class="s2-grow" ${has('openGame') ? `data-act="game" data-url="${esc(g.url)}"` : ''}><span class="small muted">${fmtDate(g.end)}</span><span>${esc(openingName(g.opening)).slice(0, 30)} · ${g.result}</span><span class="small muted">${t}</span></button>`;
    const sorted = [...gls].sort((a, b) => a.acpl - b.acpl);
    return `<details class="card s2-more" id="s2-more"><summary><h3>More numbers</h3></summary>
      <div class="s2-lazy"><p class="sub">${gl('acpl', 'Average mistake size')} (ACPL): how much engine score you give away on an average move, in hundredths of a pawn. Lower is better.</p>
      <div class="s2-tiles six">${tiles}</div><div class="eyebrow s2-gap">Each game, with a 10-game average</div>${svg}
      <div class="s2-legend"><span><i class="roll"></i>10-game average</span><span><i class="win"></i>Win</span><span><i class="draw"></i>Draw</span><span><i class="loss"></i>Loss</span></div>
      <div class="s2-two"><div><div class="eyebrow">By colour</div>${bars(col)}</div><div><div class="eyebrow">By opponent rating</div>${bars(rb)}</div></div>
      <div class="s2-two"><div><div class="eyebrow">Your cleanest games</div>${sorted.slice(0, 3).map(g => link(g, 'ACPL ' + f0(g.acpl))).join('')}</div>
      <div><div class="eyebrow">Your messiest games</div>${sorted.slice(-3).reverse().map(g => link(g, 'ACPL ' + f0(g.acpl))).join('')}</div></div></div></details>`;
  }

  /* ================================================================ page */
  function render() {
    if (!ROOT) return;
    const myToken = ++token;
    if (!G.length) { ROOT.innerHTML = `<h2>Stats</h2><p class="muted">No analysed games yet. They arrive with the next update.</p>`; return; }
    const first = G[0], last = G[G.length - 1];
    ROOT.innerHTML = `<h2>Stats</h2><p class="muted s2-lead">Am I getting better, and what should I train next?</p>
      <p class="small muted s2-range">${plural(G.length, 'rated rapid game')} · ${fmtDate(first.end)} to ${fmtDate(last.end)}</p>
      <div class="s2-stack">${verdict()}${monthsBlock()}${wonBlock()}${timeBlock()}${kindsBlock()}<div id="s2-open-slot">${openingsBlock()}</div>${moreBlock()}</div>`;
    drawn = true;
    // the openings part replays every game: draw it after the rest is on screen
    if (has('openingCourses')) setTimeout(() => {
      if (myToken !== token) return;
      const slot = ROOT.querySelector('#s2-open-slot'); if (!slot) return;
      const keep = slot.querySelector('details.s2-more')?.open;
      slot.innerHTML = openingsBlock();
      if (keep) slot.querySelector('details.s2-more').open = true;
    }, 0);
  }
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || !ROOT.contains(b)) return;
    const d = b.dataset;
    switch (d.act) {
      case 'today': return H.goToday?.();
      case 'course': return H.openCourse?.(d.c);
      case 'theme': return H.practiseTheme?.(d.grp);
      case 'pplay': return H.playOut?.(d.id);
      case 'game': return H.openGame?.(d.url);
      case 'seegames': return H.seeGames?.({ color: d.color, family: d.fam });
      case 'study': return H.studyCourse?.(d.c);
      case 'fix': return H.fixCourse?.(d.c);
    }
  }
  function init({ root, data, hooks }) {
    ROOT = root; H = hooks || {}; D = data || {};
    G = (H.games || []).slice().sort((a, b) => a.end - b.end);
    G.forEach(prep);
    ROOT.addEventListener('click', onClick);
    return api;
  }
  const GLOSSARY = [
    ['slip', 'Serious slip', 'A blunder or a mistake: a move that gave away a lot of winning chance, such as a piece, a mate, or the win. Inaccuracies are not counted. This is the one number the Stats tab uses to ask "am I making fewer errors?".'],
    ['tense', 'Tense moment', 'A position where your opponent has just given check, or where their last move changed the engine score by a pawn or more. These are the moments that most need a careful look.'],
    ['acpl', 'Average mistake size (ACPL)', 'After every move the engine scores the position in hundredths of a pawn ("centipawns"). ACPL is how many of those you give away per move on average: if the engine thought you were +0.5 and after your move only +0.2, that move cost 30. Lower is better. Roughly: under 30 is very strong, 30 to 60 good club play, 60 to 100 typical improving player, over 100 means big mistakes. One blunder can cost 300 or more, so a single bad move moves it a lot. Here scores are capped at ±10 pawns, and a mate counts as ±10.'],
  ];
  const api = { init, refresh: () => { if (ROOT) { G = (H.games || []).slice().sort((a, b) => a.end - b.end); G.forEach(prep); render(); } }, GLOSSARY, get drawn() { return drawn; } };
  return api;
})();
