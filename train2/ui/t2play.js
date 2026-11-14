/* ============================================================================================
   T2 play-outs (T7): play a position out against the in-page Stockfish. Plain script, loaded after t2core.js.
   Port of the old app's loadPlay / onMgMove / engineReply (Convert the win, Essential endgames) with the same
   fair-play thresholds: resign line cp >= 600 (after 4 moves; 1 for promote), fail line = min(failBelow ?? (mate|promote ? 90 : 62), start - 20),
   draw goal fails below 25, hold default 20 moves. Levels Club / Strong / Full as in the app (lesson play-outs are always full strength).
   Contract with the core: T2.setPlayout(async (play, ctx) => ({ok, aborted})). The core records t2x; this file never does.
   play: {id, fen, side, goal 'win'|'draw', finish 'mate'|'promote'|'hold:<n>'|'eval:<cp>'|undefined, max, failBelow, text, tb}
         (from his games: {goal:'win', result, opp, end, moveNo} with no finish: resign line applies).
   A win that slips is stopped at once; "Take back and try again" counts as ONE fail (the result is then ok:false even if he wins after it).
   ============================================================================================ */
(() => {
  'use strict';
  if (typeof T2 === 'undefined') return;
  const U = T2.ui, esc = U.esc;
  const LEVELS = [{ id: 'club', name: 'Club player', skill: 4, ms: 500 }, { id: 'strong', name: 'Strong', skill: 12, ms: 800 }, { id: 'max', name: 'Full strength', skill: 20, ms: 1200 }];
  const winPct = s => s.mate !== undefined ? (s.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, s.cp)))) - 1);
  const cpOf = s => s.mate !== undefined ? (s.mate > 0 ? 10000 : -10000) : s.cp;   // for the side the score belongs to
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const store = () => T2.hooks.store;
  let cur = null;   // handler for [data-po] / [data-pa^=po-] clicks of the running play-out

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-po], [data-pa^="po-"]');
    if (b && cur) cur(b.dataset.po || b.dataset.pa.slice(3), b);
  }, true);

  function normalise(play, lessonMode) {
    const f = String(play.finish || '');
    const hold = /^hold:(\d+)/.exec(f);
    const evalCp = /^eval:(-?\d+)/.exec(f);
    const goal = play.goal === 'draw' || hold ? 'draw' : 'win';
    return { goal, mate: f === 'mate', promote: f === 'promote', hold: hold ? +hold[1] : goal === 'draw' ? (play.max || 20) : 0,
      evalCp: evalCp ? +evalCp[1] : null, max: goal === 'win' ? (play.max || 0) : 0, failBelow: play.failBelow ?? null, fixed: lessonMode };
  }

  async function runPlayout(play, ctx) {
    const chk = ctx.chk || (() => {});
    const eng = T2.hooks.engine;
    const lessonMode = !!ctx.lesson;
    const cfg = normalise(play, lessonMode);
    const side = play.side || (play.fen.split(' ')[1] === 'w' ? 'white' : 'black');
    const engineFirst = (play.fen.split(' ')[1] === 'w') !== (side === 'white');
    const goalText = cfg.goal === 'draw' ? `Goal: hold the draw for ${cfg.hold} moves.` : cfg.mate ? `Goal: checkmate${cfg.max ? ` within ${cfg.max} moves` : ''}.` : cfg.promote ? 'Goal: promote the pawn and win.' : cfg.evalCp != null ? 'Goal: get a winning advantage.' : 'Goal: checkmate, or get so far ahead that the engine would resign.';
    const intro = play.text ? U.rich(play.text) : esc(goalText);
    if (!eng) {
      U.board(play.fen, side);
      U.fb(`<span class="eyebrow">Play-out</span><p>The computer opponent is not available in this browser.</p>`, 'wrong');
      await U.cont('Back'); return { aborted: true };
    }
    let level = store().get('mglevel', 'club'); if (!LEVELS.some(l => l.id === level)) level = 'club';
    let slipped = false;   // a slip / take-back happened in this play-out: counts as one fail
    const lv = () => cfg.fixed ? LEVELS[2] : LEVELS.find(l => l.id === level);

    let S = null, resume = null;                       // resume = snapshot after a take-back (state S is kept)
    for (;;) {                                         // one pass = one attempt; 'restart' starts over, a take-back continues
      if (!resume) S = { moves: 0, hist: [], snaps: [], myWin: null, line: null, base: null, last: null, q0: 0, done: false, status: 'wait', san: [] };
      else { S.done = false; S.status = 'wait'; }
      U.board(resume ? resume.fen : play.fen, side, resume ? { last: resume.last } : {});
      if (!resume) S.q0 = U.chess.board().flat().filter(p => p && p.type === 'q' && p.color === side[0]).length;
      const panel = document.getElementById('t2-panel');
      const meterLine = () => cfg.goal === 'draw' ? 25 : S.line;
      function renderPanel() {
        const w = S.myWin, line = meterLine();
        let txt = 'Waiting for your first move', cls = '';
        if (w != null) {
          const slip = line != null && w < line, close = line != null && w < line + 6;
          cls = slip ? 'bad' : close ? 'warn' : 'good';
          txt = cfg.goal === 'draw' ? (slip ? 'The position is lost' : close ? 'Holding, but it is thin' : 'Holding well') : (slip ? 'The win slipped' : close ? 'Still winning, but careful' : 'Still winning');
        }
        const f = play.fen.split(' '), blackFirst = f[1] === 'b', n0 = +f[5] || 1;
        const moves = S.san.length ? S.san.map((m, i) => { const k = i + (blackFirst ? 1 : 0); return `${k % 2 === 0 ? `<b class="no">${n0 + k / 2}.</b>` : i === 0 ? `<b class="no">${n0}...</b>` : ''}${esc(m)} `; }).join('') : '<span class="muted small">No moves yet</span>';
        panel.innerHTML = `<div class="t2-po">
          <div class="t2-po-meter ${cls}" role="status"><div class="t2-po-bar"><span style="width:${w == null ? 0 : Math.round(w)}%"></span>${line != null && cfg.goal ? `<i style="left:${Math.round(line)}%" title="the win slips below here"></i>` : ''}</div>
            <div class="t2-po-txt"><b>${esc(txt)}</b>${w != null ? `<span class="small muted"> · ${Math.round(w)}% for you</span>` : ''}</div></div>
          ${cfg.fixed ? '' : `<div class="t2-po-lv"><span class="small muted">Opponent:</span><div class="seg" role="group" aria-label="Opponent strength">${LEVELS.map(l => `<button data-po="lv:${l.id}" aria-pressed="${l.id === level}">${l.name}</button>`).join('')}</div></div>`}
          <div class="t2-po-moves small">${moves}</div>
          ${ctx.lesson?.rule ? `<details class="t2-po-rule"><summary>Remind me of the rule</summary><p>${U.rich(ctx.lesson.rule)}</p></details>` : ''}</div>`;
      }
      const dummy = [];
      let cmdRes = null;
      const cmd = new Promise(r => cmdRes = r);        // restart / give up / leave
      cur = async (a) => {
        if (a.startsWith('lv:')) { level = a.slice(3); store().set('mglevel', level); renderPanel(); return; }
        if (a === 'restart') return cmdRes('restart');
        if (a === 'quit') return cmdRes('quit');
        if (a === 'hint' && !S.done && S.status === 'ask') {
          const fen = U.chess.fen();
          U.fb('<span class="eyebrow">Hint</span><p class="small muted">Thinking…</p>');
          const r = await eng.go(fen, { movetime: 1200, skill: 20 }).catch(() => null);
          if (!r || fen !== U.chess.fen() || S.status !== 'ask') return;
          U.shapes = [{ orig: r.best.slice(0, 2), brush: 'yellow' }];
          U.fb(`<span class="eyebrow">Hint</span><p>The circled piece has the engine's best move.</p>`);
        }
      };
      const btns = () => U.actions([['po-hint', 'Hint', '', false], ['po-restart', 'Restart', '', false], ['po-quit', 'Give up', '', false, 'narrow']]);
      const lastMove = m => S.last = [m.from, m.to];

      /** end of the attempt: show the result, wait for the choice. returns 'done' | 'retry' | 'restart' | 'leave' */
      async function end(ok, msg, { slip = false } = {}) {
        S.done = true; S.status = 'end'; cur = null;
        const retryOk = !ok && S.snaps.length;
        if (!ok) slipped = true;
        let worst = null;
        if (!ok && S.hist.length > 1) { let prev = null; for (const h of S.hist) { const drop = (prev ?? h.myWin) - h.myWin; if (!worst || drop > worst.drop) worst = { ...h, drop }; prev = h.myWin; } }
        const tail = ok ? (slipped ? '<p class="small muted">You needed a take-back on the way, so it comes back for another go.</p>' : '')
          : `${worst && worst.drop > 5 ? `<p class="small">The biggest drop came after your move <b class="t2-san">${esc(worst.san)}</b>.</p>` : ''}<p class="small muted">${cfg.goal === 'win' ? 'Try again from just before it: check what your opponent threatens, then simplify.' : 'Keep your king active and do not rush.'}</p>`;
        U.fb(`<span class="eyebrow">${ok ? 'Done' : 'Not this time'}</span><h3>${esc(msg)}</h3>${tail}`, ok ? 'right' : 'wrong');
        const v = await U.cont(ok ? 'Finish' : 'Restart', [...(retryOk ? [['cont:retry', 'Take back and try again', '', true]] : []), ...(ok ? [['cont:restart', 'Play again']] : [['cont:leave', 'Leave']])]);
        chk();
        if (ok) return v === 'restart' ? 'restart' : 'done';
        return v === 'retry' ? 'retry' : v === 'leave' ? 'leave' : 'restart';
      }

      async function engineReplyOrEnd(mv) {
        const ch = U.chess;
        if (ch.in_checkmate()) return end(true, 'Checkmate! Well done.');
        const drawn = ch.in_stalemate() || ch.insufficient_material() || ch.in_threefold_repetition() || ch.in_draw();
        if (drawn) return cfg.goal === 'draw' ? end(true, 'Draw! You held it.') : end(false, ch.in_stalemate() ? 'Stalemate: the win slipped away. With a big lead, always check that your opponent still has a legal move.' : 'The game ended in a draw.');
        if (mv && cfg.max && S.moves >= cfg.max) return end(false, `Too slow: the goal was not reached within ${cfg.max} moves.`);
        S.status = 'think'; U.actions([['po-restart', 'Restart'], ['po-quit', 'Give up', '', false, 'narrow']]);
        U.fb('<span class="muted">Opponent is thinking…</span>');
        const r = await eng.go(ch.fen(), { movetime: lv().ms, skill: lv().skill }).catch(() => null);
        chk();
        if (!r) return end(false, 'The engine stopped responding. Reload the page and try again.');
        const myWin = 100 - winPct(r.score), myCp = -cpOf(r.score);   // the engine reports its own point of view
        if (mv) { S.hist.push({ san: mv.san, myWin }); S.myWin = myWin; renderPanel(); }
        else if (S.base == null) { S.base = myWin; S.myWin = myWin; if (cfg.goal === 'win') S.line = Math.min(cfg.failBelow ?? (cfg.mate || cfg.promote ? 90 : 62), myWin - 20); renderPanel(); }
        if (mv && cfg.goal === 'win' && !cfg.mate) {
          const queens = ch.board().flat().filter(p => p && p.type === 'q' && p.color === side[0]).length;
          if (cfg.evalCp != null ? (myCp >= cfg.evalCp && S.moves >= 1) : (myCp >= 600 && S.moves >= (cfg.promote ? 1 : 4) && (!cfg.promote || queens > S.q0)))
            return end(true, cfg.promote ? 'Promoted, and the win is certain. Well done!' : "You're winning easily. The engine resigns: converted!");
        }
        if (mv && cfg.goal === 'win' && myWin < S.line) return end(false, `The win slipped away after ${mv.san}.`, { slip: true });
        if (mv && cfg.goal === 'draw') {
          if (myWin < 25) return end(false, `After ${mv.san} the position is lost.`, { slip: true });
          if (S.moves >= cfg.hold) return end(true, `You held it for ${S.moves} moves. That is a draw.`);
        }
        const reply = ch.move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] || 'q' });
        if (!reply) return end(false, 'The engine got out of step. Press Restart to try again.');
        ch.undo();                                      // let the core animate it
        const m2 = U.playUci(r.best); lastMove(m2); S.san.push(m2.san); renderPanel();
        if (ch.in_checkmate()) return end(false, 'You got checkmated.');
        if (ch.in_stalemate() || ch.insufficient_material() || ch.in_threefold_repetition() || ch.in_draw())
          return cfg.goal === 'draw' ? end(true, 'Draw! You held it.') : end(false, 'The game ended in a draw.');
        S.status = 'ask';
        const left = cfg.goal === 'draw' ? `Hold on: ${Math.max(0, cfg.hold - S.moves)} more moves.` : cfg.mate ? `Mate needed${cfg.max ? ` within ${cfg.max - S.moves} moves` : ''}.` : '';
        U.fb(`<span class="eyebrow">Your move</span><p>Opponent played <b class="t2-san">${esc(m2.san)}</b>. ${left} What does ${esc(m2.san)} threaten?</p>`);
        return null;
      }

      // ----- the attempt
      U.head(ctx.lesson ? `Test · ${ctx.lesson.title}` : 'Play it out', ctx.lesson ? ctx.lesson.title : (play.opp ? `Your game vs ${play.opp}` : 'Play it out'), 0, 0, '');
      U.fb(`<span class="eyebrow">${side === 'white' ? 'White' : 'Black'} to play</span><p>${intro}</p><p class="small muted">Starting the engine…</p>`);
      renderPanel(); btns();
      let next = null;
      const resumed = !!resume; resume = null;
      if (resumed) { S.myWin = S.hist.length ? S.hist[S.hist.length - 1].myWin : S.base; renderPanel(); }
      else if (engineFirst) { S.line = cfg.failBelow ?? (cfg.mate || cfg.promote ? 90 : 62); next = await engineReplyOrEnd(null); }
      else if (cfg.goal === 'win') {
        // rate the start with the same engine, so the failure line matches what it sees
        const r0 = await eng.go(play.fen, { movetime: 700, skill: 20 }).catch(() => null); chk();
        S.base = r0 ? winPct(r0.score) : null;
        S.line = Math.min(cfg.failBelow ?? (cfg.mate || cfg.promote ? 90 : 62), S.base != null ? S.base - 20 : 100);
        S.myWin = S.base; renderPanel();
      } else S.line = 25;
      S.status = 'ask';
      if (!next && !engineFirst) U.fb(`<span class="eyebrow">${side === 'white' ? 'White' : 'Black'} to play</span><p>${intro}</p>${play.text ? `<p class="small muted">${esc(goalText)}</p>` : ''}`);

      let outcome = next;
      while (!outcome) {
        btns(); S.status = 'ask';
        const fenBefore = U.chess.fen(), lastBefore = S.last;
        const ask = U.askMove({ judge: () => 'sol' });
        btns();
        const r = await Promise.race([ask, cmd]);
        chk();
        if (r === 'restart' || r === 'quit') { cur = null; if (r === 'quit') return { aborted: true }; outcome = 'restart'; break; }
        // snapshot of the position before his move (rebuilt by undoing on a copy)
        S.snaps.push({ fen: fenBefore, last: lastBefore, san: S.san.length, hist: S.hist.length, moves: S.moves });
        S.moves++; lastMove(r.mv); S.san.push(r.mv.san); renderPanel();
        const o = await engineReplyOrEnd(r.mv);
        if (o) { outcome = o; break; }
      }
      cur = null;
      if (outcome === 'done') return { ok: !slipped };
      if (outcome === 'leave') return { ok: false };
      if (outcome === 'retry') {                        // take back his last move (the engine's reply before it stays)
        const sn = S.snaps.pop();
        S.moves = sn.moves; S.san.length = sn.san; S.hist.length = sn.hist; S.last = sn.last;
        resume = sn; continue;
      }
      continue;                                          // restart
    }
  }

  T2.setPlayout(async (play, ctx) => {
    try { return await runPlayout(play, ctx); } finally { cur = null; }
  });
})();
