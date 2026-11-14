/* ============================================================================================
   T2 Stats + Practise-a-theme screens (T7). Plain script, loaded after t2core.js. BLUEPRINT sections 6, 7F, 7G.
   Every number on the Stats screen is read from mine2.json "stats" (the numbers t2stats.py prints) or from his progress.
   T2.setScreen('stats', el => ...) and T2.setScreen('themes', el => ...). Buttons use the core's data-act hooks
   (theme, themes, course, playwin, pplay), so the core's click handler does the navigation.
   ============================================================================================ */
(() => {
  'use strict';
  if (typeof T2 === 'undefined') return;
  const esc = T2.ui.esc;
  const pct = x => `${Math.round(x * 100)}%`;
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = m => { const [y, mo] = m.split('-'); return `${MON[+mo - 1]} ${y.slice(2)}`; };
  const dayLabel = unix => new Date(unix * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const PG = k => T2.hooks.progress?.[k] || {};
  const card = (eyebrow, body, extra = '') => `<section class="card t2-st ${extra}"><span class="eyebrow">${esc(eyebrow)}</span>${body}</section>`;
  const reading = txt => `<p class="t2-st-read">${txt}</p>`;
  const empty = txt => `<p class="muted">${txt}</p>`;
  const bars = (rows, { max = 0, fmt = v => v, cls = '' } = {}) => {
    const m = max || Math.max(1, ...rows.map(r => r.v));
    return `<div class="t2-st-bars ${cls}">${rows.map(r => `<div class="t2-st-bar"><span class="l small">${esc(r.l)}</span><i style="width:${Math.max(r.v ? 2 : 0, r.v / m * 100)}%"${r.c ? ` class="${r.c}"` : ''}></i><b>${esc(fmt(r.v, r))}</b></div>`).join('')}</div>`;
  };
  const line = (vals, w = 300, h = 70) => {
    if (vals.length < 2) return '';
    const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * (w - 8) + 4).toFixed(1)},${(h - 6 - (v - lo) / sp * (h - 12)).toFixed(1)}`).join(' ');
    return `<svg class="t2-st-line" viewBox="0 0 ${w} ${h}" role="img" aria-label="Puzzle rating from ${vals[0]} to ${vals[vals.length - 1]}"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  };
  const trendOf = v => v.prev30 == null || v.last30 == null ? '' : v.last30 < v.prev30 ? ' <span class="t2-good" title="fewer than in the 30 games before">↓</span>' : v.last30 > v.prev30 ? ' <span class="t2-bad" title="more than in the 30 games before">↑</span>' : ' →';
  const groupIdx = id => T2.groups().findIndex(g => g.id === id);

  /* ---------------------------------------------------------------- blocks */
  function weakBlock(st) {
    const tags = st && st.tags ? Object.entries(st.tags).filter(([, v]) => v.n).sort((a, b) => (b[1].per10 || 0) - (a[1].per10 || 0)) : [];
    if (!tags.length) return card('Your weak spots', empty('Your game statistics arrive after the next update of your games.'));
    const acc = T2.groupAccuracy(), hasPuz = !!T2.puzzles();
    const top = tags[0];
    const rows = tags.map(([tag, v]) => {
      const gi = groupIdx(v.group), a = gi >= 0 ? acc[gi] : null;
      const btn = gi >= 0 && hasPuz ? `<button class="btn" data-act="theme" data-g="${gi}">Practise</button>` : !v.group ? `<button class="btn" data-act="course" data-c="convert">Win the won game</button>` : '';
      return `<div class="t2-wrow"><div><b>${esc(cap1(tag))}</b><div class="small muted">In your games: ${v.n} times (${v.per10} per 10 games)${v.last30 != null ? ` · last 30 games: ${v.last30}${trendOf(v)}` : ''}</div>
        ${a && a.n ? `<div class="small">In training: ${pct(a.ok / a.n)} of ${a.n}</div>` : a ? '<div class="small muted">Not tried in training yet</div>' : ''}</div>${btn}</div>`;
    }).join('');
    return card('Your weak spots · from your games', `${rows}${reading(`${esc(cap1(top[0]))} is your most common mistake: ${top[1].per10} in every 10 games. Practise the ones with a button first.`)}`);
  }

  function wonBlock(st) {
    const w = st?.won, months = (st?.months || []).filter(m => m.wonReached);
    if (!w || !w.reached) return card('Won positions', empty('No winning positions found in your games yet.'));
    const thrown = w.thrown || [], plays = T2.mine()?.plays || [];
    const playFor = t => plays.find(p => p.id.startsWith(`cv/${t.gid}-`));
    const list = thrown.slice(0, 8).map(t => { const p = playFor(t), pr = p && PG('t2x')[p.id];
      return `<div class="t2-grow"><div class="t2-gt"><b>vs ${esc(t.opp || '?')}</b><div class="small muted">${t.end ? dayLabel(t.end) : ''} · move ${Math.ceil(t.ply / 2)} · ${esc(t.result || '')}${pr?.ok ? ' · converted ✓' : ''}</div></div>${p ? `<button class="btn" data-act="pplay" data-id="${esc(p.id)}">Play it out</button>` : ''}</div>`; }).join('');
    return card('Won positions', `<p class="t2-big">${w.kept} of ${w.reached}</p>
      ${reading(`You reached a winning position in ${w.reached} games and won ${w.kept} of them (${pct(w.kept / w.reached)}). ${thrown.length ? `${plural(thrown.length, 'game')} were thrown away: those are your play-outs.` : ''}`)}
      ${months.length ? bars(months.map(m => ({ l: monthLabel(m.m), v: m.wonReached, k: m.wonKept })), { fmt: (v, r) => `${r.k}/${v}`, cls: 'won' }) : ''}
      ${thrown.length ? `<h4 class="t2-h4">Thrown away (${thrown.length})</h4><div class="t2-list">${list}</div>${thrown.length > 8 ? `<p class="small muted">and ${thrown.length - 8} more</p>` : ''}` : ''}
      <div class="controls"><button class="btn primary" data-act="playwin">Play out a win</button></div>`);
  }

  function slowBlock(st) {
    const c = st?.clock, months = (st?.months || []).filter(m => m.fast != null && m.mist + m.blun > 0);
    if (!c) return card('Slow down', empty('Clock statistics arrive after the next update of your games.'));
    const d = PG('t2d'); let fw = 0, wrong = 0;
    for (const k of Object.keys(d)) { fw += d[k].fw || 0; wrong += d[k].wrong || 0; }
    return card('Slow down', `<p class="t2-big">${pct(c.fastShare)}</p>
      ${reading(`${pct(c.fastShare)} of your mistakes are played in under 5 seconds. A bad move takes you about ${c.medianBad} s, an ordinary move ${c.medianOther} s: the quick ones are the ones that go wrong.`)}
      ${months.length ? bars(months.map(m => ({ l: monthLabel(m.m), v: Math.round(m.fast * 100) })), { max: 100, fmt: v => v + '%', cls: 'fast' }) : ''}
      <p class="small">${wrong ? `In training: ${fw} of your ${wrong} wrong answers came in under 4 seconds (${pct(fw / wrong)}).` : 'In training: no wrong answers yet, so nothing to compare.'}</p>`);
  }

  function beforeAfter(st) {
    const days = Object.keys(PG('t2d')).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const games = T2.hooks.games;
    if (!days.length) return card('Before and after training', empty('Do your first Train session and this page will compare the games before it with the games after it.'));
    if (!games?.length) return card('Before and after training', empty('Your analysed games are not loaded here, so the comparison is not available.'));
    const [y, m, d] = days[0].split('-').map(Number), split = new Date(y, m - 1, d).getTime() / 1000;
    const before = games.filter(g => g.end < split), after = games.filter(g => g.end >= split);
    const head = `<p class="small muted">Split: your first Train day, ${new Date(split * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. ${before.length} games before, ${after.length} after.</p>`;
    if (after.length < 20) return card('Before and after training', `${head}${empty(`Needs ${20 - after.length} more games after your first Train day.`)}`);
    const agg = gs => {
      const o = { n: gs.length, mist: 0, fast: 0, tags: {} };
      for (const g of gs) g.plies.forEach((p, i) => {
        if ((i % 2 === 0) !== (g.color === 'white') || !p.lab || p.lab === 'inaccuracy') return;
        o.mist++; if (p.t != null && p.t < 5) o.fast++;
        for (const t of p.why || []) o.tags[t] = (o.tags[t] || 0) + 1;
      });
      return o;
    };
    const b = agg(before), a = agg(after), r1 = x => (Math.round(x * 100) / 100);
    const row = (lab, bv, av, fmt = v => v, lowerBetter = true) => `<tr><td>${esc(lab)}</td><td>${fmt(bv)}</td><td>${fmt(av)}</td><td class="${(av < bv) === lowerBetter && av !== bv ? 't2-good' : av === bv ? '' : 't2-bad'}">${av < bv ? '↓' : av > bv ? '↑' : '→'}</td></tr>`;
    const tagRows = Object.keys(st?.tags || {}).filter(t => b.tags[t] || a.tags[t]).sort((x, y) => (b.tags[y] || 0) - (b.tags[x] || 0))
      .map(t => row(cap1(t), r1((b.tags[t] || 0) / b.n), r1((a.tags[t] || 0) / a.n))).join('');
    const mb = b.mist / b.n, ma = a.mist / a.n;
    return card('Before and after training', `${head}<table class="t2-st-tbl"><thead><tr><th></th><th>Before</th><th>After</th><th></th></tr></thead><tbody>
      ${row('Mistakes + blunders per game', r1(mb), r1(ma))}${row('Fast mistakes (under 5 s)', pct(b.mist ? b.fast / b.mist : 0), pct(a.mist ? a.fast / a.mist : 0))}${tagRows}</tbody></table>
      ${reading(ma < mb ? `You make ${r1(mb - ma)} fewer mistakes per game than before you started training.` : `Your mistakes per game have not dropped yet (${r1(mb)} before, ${r1(ma)} after). Give it more games.`)}`);
  }

  function trainingBlock() {
    const d = PG('t2d'), days = Object.keys(d).sort(), t2c = PG('t2c'), trh = Object.entries(PG('trh')).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.r);
    const lessons = Object.entries(PG('t2l')).filter(([, v]) => v.st >= 2).length, started = Object.keys(PG('t2l')).length;
    const total = T2.courses().reduce((s, c) => s + (c.order?.length || 0), 0);
    if (!days.length && !Object.keys(t2c).length && !started) return card('Training', empty('Nothing trained yet. Start with the Train today button and this fills up.'));
    const last = days.filter(k => d[k].rev).slice(-14).map(k => ({ l: k.slice(8) + '/' + k.slice(5, 7), v: d[k].rev || 0, w: d[k].wrong || 0 }));
    const tot = days.reduce((a, k) => ({ rev: a.rev + (d[k].rev || 0), wrong: a.wrong + (d[k].wrong || 0) }), { rev: 0, wrong: 0 });
    const lv = Array(8).fill(0); let retired = 0;
    for (const v of Object.values(t2c)) { if (v.lv >= (T2.srs.RETIRED || 9)) retired++; else lv[Math.max(0, Math.min(7, v.lv || 0))]++; }
    const lvRows = lv.map((n, i) => ({ l: i ? 'L' + i : 'New', v: n })).filter((r, i) => i > 0 || r.v).concat(retired ? [{ l: 'Done', v: retired }] : []);
    return card('Training', `
      ${last.length ? `<h4 class="t2-h4">Reviews per day (last ${last.length} days with training)</h4>${bars(last, { fmt: (v, r) => `${v}${r.w ? ` (${r.w} wrong)` : ''}`, cls: 'rev' })}` : ''}
      <p>${tot.rev ? `${tot.rev} reviews in total, ${pct(1 - tot.wrong / Math.max(1, tot.rev))} right.` : 'No reviews yet.'} ${started ? `Lessons finished: ${lessons} of ${total || '?'}.` : ''}</p>
      ${Object.keys(t2c).length ? `<h4 class="t2-h4">Cards by level</h4>${bars(lvRows, { cls: 'lv' })}${reading('Cards move up a level each time you get them right on the day they are due. Level 4 and higher counts as known.')}` : ''}
      <h4 class="t2-h4">Puzzle rating: ${T2.rating()}</h4>${trh.length > 1 ? line(trh.slice(-60)) : '<p class="small muted">The graph appears after your second day of puzzles.</p>'}`);
  }

  /* ---------------------------------------------------------------- screens */
  T2.setScreen('stats', el => {
    const mine = T2.mine(), st = mine?.stats;
    const sub = st ? `Based on ${st.games} of your games${st.from ? ` (${dayLabel(st.from)} to ${dayLabel(st.to)})` : ''}.` : '';
    el.innerHTML = `<div class="t2-stats"><h2>Stats</h2><p class="muted">${sub || 'Your game statistics are not available yet.'} Each block says in one line what it means.</p>
      ${weakBlock(st)}${wonBlock(st)}${slowBlock(st)}${beforeAfter(st)}${trainingBlock()}</div>`;
  });

  T2.setScreen('themes', el => {
    const PUZ = T2.puzzles();
    if (!PUZ) { el.innerHTML = `<h2>Practise a theme</h2>${empty('The puzzle collection arrives with the next update. Come back then.')}`; return; }
    const acc = T2.groupAccuracy(), seen = T2.srs.seen(), tags = T2.mine()?.stats?.tags || {}, w = T2.groupWeights?.() || [];
    const t2c = PG('t2c');
    const focus = new Set(w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(x => x[0] > 1.2).map(x => x[1]));
    el.innerHTML = `<h2>Practise a theme</h2><p class="muted">Pick a theme: you get puzzles near your rating (${T2.rating()}) that you have not seen. “Focus” marks the themes that cost you most in your own games.</p>
      <div class="t2-tgrid">${PUZ.groups.map((g, i) => {
        const un = (PUZ.byGroup?.[i] || []).filter(p => !seen.has(p.id) && !t2c['pz/' + p.id]).length;
        const ts = Object.entries(tags).filter(([, v]) => v.group === g.id);
        const n = ts.reduce((s, [, v]) => s + (v.n || 0), 0), per = ts.reduce((s, [, v]) => s + (v.per10 || 0), 0);
        const a = acc[i] || { n: 0, ok: 0 };
        return `<button class="card t2-theme" data-act="theme" data-g="${i}"${un ? '' : ' disabled'}><b>${esc(g.name)}${focus.has(i) ? ' <span class="t2-focus">Focus</span>' : ''}</b><span class="small muted">${esc(g.ds || '')}</span>
          <span class="small">${n ? `In your games: ${n} times (${Math.round(per * 10) / 10} per 10 games)` : 'Not among your mistakes'}</span>
          <span class="small">${a.n ? `In training: ${pct(a.ok / a.n)} of ${a.n}` : 'Not tried yet'} · ${un ? `${un} unseen` : 'all seen'}</span></button>`; }).join('')}</div>`;
  });
})();
