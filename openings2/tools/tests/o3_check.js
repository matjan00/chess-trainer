// R4+R5 checks (v3 courses): progress namespace, unlocking, nextLine order, branch learn (pause card, clue questions), review clue question
// (first review / missed, at most once per line), rule card on a wrong sister move, rule book, Today-tab counters.
// Run: node openings2/tools/tests/o3_check.js
// Same harness as replay_check.js (vm + fake DOM + fake board, timers at 1/100) but with the v3 dev data (openings2/ui/courses2.dev.json,
// compiled from openings2/ui/fixtures/devcaro3.txt), and a fb element that records every card it was given.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const listeners = {};
function fakeEl(over = {}) {
  const fn = function () {};
  const kids = new Map();
  const target = { dataset: {}, style: {}, children: [], hidden: false, offsetParent: null, innerHTML: '', textContent: '', className: '', ...over };
  const p = new Proxy(fn, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k in target) return target[k];
      if (k === 'querySelector') return sel => { if (!kids.has(sel)) kids.set(sel, fakeEl()); return kids.get(sel); };
      if (k === 'querySelectorAll') return () => [];
      if (k === 'addEventListener') return (ev, f) => { (listeners[ev] ||= []).push(f); };
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'then') return undefined;
      return p;
    },
    set(_, k, v) { target[k] = v; return true; },
    apply() { return p; },
  });
  return p;
}

const checks = [];
function ok(name, cond, extra) { checks.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); }
const errors = [];
const NOW0 = new Date(2026, 10, 18, 10, 0, 0).getTime();
const fastTimeout = (f, ms) => setTimeout(f, Math.ceil((ms || 0) / 100));
const ctx = {
  console: { ...console, error: (...a) => { errors.push(a.map(String).join(' ')); console.log('console.error', ...a); } },
  setTimeout: fastTimeout, clearTimeout, Math, Date, JSON, Map, Set, Promise, Object, Array, String, Number, Intl, Symbol,
  location: { search: '?o2now=' + NOW0 }, localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {} }), requestAnimationFrame: f => setTimeout(f, 0),
  navigator: {},
  document: { addEventListener: (ev, f) => { (listeners['doc:' + ev] ||= []).push(f); }, getElementById: () => fakeEl(), querySelector: () => fakeEl(), documentElement: fakeEl(), body: fakeEl(), createElement: () => fakeEl() },
  window: { scrollTo() {}, addEventListener() {}, scrollY: 0 },
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
vm.runInContext(read('docs/vendor/chess.min.js') + ';this.Chess = Chess;', ctx);
vm.runInContext(read('openings2/ui/o2core.js') + ';this.O2 = O2;', ctx);
const O2 = ctx.O2, Chess = ctx.Chess;

let boards = [];
const board = { set(o) { boards.push(o); }, state: {} };
const Chessground = (el, o) => { boards.push(o); return board; };
const kv = new Map();
const store = { get: (k, d) => kv.has(k) ? kv.get(k) : d, set: (k, v) => kv.set(k, v) };
const data = JSON.parse(read('openings2/ui/courses2.dev.json'));
const progress = {};
const record = (kind, id, value) => { (progress[kind] ||= {})[id] = { ...value, t: Date.now() }; };
const root = fakeEl({ offsetParent: {} });
const fbLog = []; let fbHtml = '';
const fbEl = { querySelectorAll: () => [], className: '', classList: { add() {}, remove() {}, toggle() {} }, scrollIntoView() {}, get innerHTML() { return fbHtml; }, set innerHTML(v) { fbHtml = v; fbLog.push(v); } };
const origQS = root.querySelector;
root.querySelector = sel => sel === '#o2-fb' ? fbEl : origQS(sel);
O2.init({ root, data, hooks: { Chessground, record, progress, store } });
const $ = s => root.querySelector(s);

const DAY = 86400000, t = O2.now();
const C = O2.courses()[0];
const L = id => C.lineById.get(id);
const key = id => `${C.id}@3/${id}`;
const reset = () => { for (const k of Object.keys(progress)) delete progress[k]; progress.o2c = {}; progress.o2l = {}; progress.o2d = {}; O2.srs.resetLoad(); boards = []; fbLog.length = 0; fbHtml = ''; };
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
const bar = () => $('#o2-actions').innerHTML;
const panel = () => $('#o2-panel').innerHTML;
const fbText = () => fbHtml;
const asking = () => /data-pa="hint"/.test(bar());
async function until(cond, what, n = 3000) { for (let i = 0; i < n; i++) { if (cond()) return true; await tick(2); } console.log('  timeout waiting for', what, '| card:', fbHtml.slice(0, 160), '| bar:', $('#o2-actions').innerHTML.slice(0, 80)); return false; }
const click = map => listeners.click.forEach(f => f({ target: { closest: sel => map[sel] || null } }));
const clickAct = (act, ds = {}) => click({ '[data-act]': { dataset: { act, ...ds }, tagName: 'BUTTON' } });
const clickPa = pa => click({ '[data-pa]': { dataset: { pa } } });
const posOf = f => f.split(' ').slice(0, 4).join(' ');
const lastFen = () => [...boards].reverse().find(o => o.fen)?.fen;
async function answer(s) {
  const o = [...boards].reverse().find(o => o.movable?.events?.after);
  o.movable.events.after(s.from, s.to);
  await tick(2);
}
// a pointerdown on the board at the centre of square sq (board 80x80 at the origin); orientation from the course side
function tapAt(sq) {
  const f = sq.charCodeAt(0) - 97, rk = +sq[1] - 1, black = C.side === 'black';
  const x = (black ? 7 - f : f) + .5, y = (black ? rk : 7 - rk) + .5;
  const bd = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 80, height: 80 }) };
  (listeners.pointerdown || []).forEach(fn => fn({ target: { closest: sel => sel === 'cg-board' ? bd : null }, clientX: x * 10, clientY: y * 10 }));
}
const setBox = (id, lv, extra = {}) => { progress.o2c[key(id)] = { lv, due: t + 5 * DAY, n: 1, w: 0, s: 1, ...extra }; };
// a line's own cards (not the ones it shares with its parent, which keep their box)
function learned(lineId, lv, extra) { const l = L(lineId); progress.o2l[key(lineId)] = { done: 1 }; l.mine.filter(s => C.cardById.get(s.id).line === lineId || !progress.o2c[key(s.id)]).forEach(s => setBox(s.id, lv, extra)); }
// drive a review/learn one step: answer the asked move, press Continue; returns false when nothing could be done
let quizDone = false;
async function drive(lineId) {
  if (!/o2-quiz/.test(panel())) quizDone = false;
  if (asking()) { const fen = posOf(lastFen()), st = C.seq[lineId].find(s => s.n.mine && posOf(s.fen) === fen); if (st) { await answer(st); return true; } }
  if (/o2-quiz/.test(panel()) && /quiz-opts/.test(panel()) && !/data-q2/.test(panel()) && !quizDone) { quizDone = true; const qo = $('#o2-panel').querySelector('.quiz-opts'); if (qo.onclick) { qo.onclick({ target: { closest: () => ({ dataset: { q: '0' }, classList: { add() {} } }) } }); await tick(3); return true; } }
  if (/data-pa="cont"/.test(bar())) { clickPa('cont'); await tick(2); return true; }
  await tick(2); return false;
}
async function driveUntil(lineId, cond, n = 3000) { for (let i = 0; i < n && !cond(); i++) await drive(lineId); return cond(); }
const q2Options = () => [...panel().matchAll(/data-q2="(\d+)">([^<]*)</g)].map(m => [+m[1], m[2]]);

(async () => {
  // ---------- 1. namespace
  reset();
  ok('course is v3', C.ver === 3 && C.id === 'devcaro3');
  const k0 = L('cl-main').mine[0];
  progress.o2c[`${C.id}/${k0.id}`] = { lv: 3, due: t - DAY, n: 3, w: 0, s: 3, t: Date.now() };   // an old (ver 2) entry
  progress.o2l[`${C.id}/cl-main`] = { done: 1 };
  ok('old-key entries are ignored (srs)', O2.srs.get(C, k0.id) === null);
  ok('old-key entries are ignored (due)', O2.dueSummary().n === 0);
  ok('old-key entries are ignored (line learned)', !O2.srs.lineInfo(C, L('cl-main')).learned);
  ok('Today counters ignore old entries', O2.reviewedSince(0) === 0 && O2.hasProgress() === false);
  O2.srs.learn(C, [k0.id]);
  ok('learn writes the @3 key', !!progress.o2c[key(k0.id)] && Object.keys(progress.o2c).filter(k => k.includes('@3/')).length === 1);
  ok('day points use the 3: prefix', Object.keys(progress.o2d).length === 1 && Object.keys(progress.o2d)[0].startsWith('3:'), Object.keys(progress.o2d));
  ok('Today counters see the new entry only', O2.reviewedSince(0) === 1 && O2.hasProgress() === true);
  ok('streak restarts for v3 (old o2d keys ignored)', (() => { const d = new Date(O2.now()); const y = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); progress.o2d[y] = { rev: 5 }; return O2.dayPointKey() === '3:' + y && !!progress.o2d['3:' + y]; })());
  ok('dayPointKey has the prefix', O2.dayPointKey().startsWith('3:'));

  // ---------- 2. unlock rules
  reset();
  const lock = id => O2.srs.lockInfo(C, L(id));
  ok('trunk is always open', !lock('adv-main') && !lock('cl-main') && !lock('exch-main'));
  ok('branch locked while the parent is not learned', lock('adv-h4')?.kind === 'parent' && /has had its first review/.test(lock('adv-h4').text));
  learned('adv-main', 1);
  ok('branch locked while parent is in box 1', lock('adv-h4')?.kind === 'parent');
  learned('adv-main', 2);
  ok('branch open when every parent card is in box 2', !lock('adv-h4') && !lock('adv-bd3'));
  const one = L('adv-main').mine[3]; setBox(one.id, 1);
  ok('one parent card in box 1 keeps it locked', lock('adv-h4')?.kind === 'parent');
  setBox(one.id, 2);
  learned('adv-h4', 1);
  ok('look-alike twin (learned, box 1) locks its sibling', lock('adv-bd3')?.kind === 'twin' && /is solid — it looks a lot like it/.test(lock('adv-bd3').text) && /Advance: 4\.h4/.test(lock('adv-bd3').text), JSON.stringify(lock('adv-bd3')));
  learned('adv-h4', 2);
  ok('twin in box 2 still locks', lock('adv-bd3')?.kind === 'twin');
  L('adv-main').mine.forEach(x => setBox(x.id, 3)); learned('adv-h4', 3);
  ok('twin in box 3 opens the sibling', !lock('adv-bd3'));
  ok('a learned line is never reported as locked', !lock('adv-h4'));

  // ---------- 3. nextLine follows course.learn and skips locked lines
  reset();
  ok('learn order starts with the start lines', C.learn[0] === 'adv-main' && C.learn[1] === 'cl-main');
  ok('nextLine = first of course.learn', O2.srs.nextLine(C).id === 'adv-main');
  learned('adv-main', 1);
  ok('next after adv-main = cl-main (its branches are locked)', O2.srs.nextLine(C).id === 'cl-main');
  learned('cl-main', 1);
  ok('then the next trunk', O2.srs.nextLine(C).id === 'exch-main');
  learned('exch-main', 1);
  ok('all open lines done: locked branches are skipped', O2.srs.nextLine(C) === null, O2.srs.nextLine(C)?.id);
  learned('adv-main', 2);
  ok('first unlocked branch in learn order', O2.srs.nextLine(C)?.id === 'adv-bd3', O2.srs.nextLine(C)?.id);
  learned('cl-main', 2);
  progress.o2l[key('adv-bd3')] = { done: 1 };
  ok('locked branches (parent not ready / look-alike not solid) are all skipped', O2.srs.nextLine(C) === null, O2.srs.nextLine(C)?.id);

  // ---------- 4. review Q1 trigger condition
  const trigStep = C.seq['cl-main'].find(s => s.n.trig), plain = C.seq['cl-main'].find(s => s.n.mine && !s.n.trig);
  ok('fixture has trigger nodes', !!trigStep && !!plain);
  ok('Q1: first review (n = 0)', O2.srs.reviewAsksClue(trigStep, { lv: 1, n: 0, w: 0, s: 0 }));
  ok('Q1: missed last time', O2.srs.reviewAsksClue(trigStep, { lv: 1, n: 3, w: 1, s: 0 }));
  ok('Q1: not after a clean answer', !O2.srs.reviewAsksClue(trigStep, { lv: 3, n: 3, w: 0, s: 3 }));
  ok('Q1: not without a trigger', !O2.srs.reviewAsksClue(plain, { lv: 1, n: 0, w: 0, s: 0 }));
  ok('Q1: not without a schedule entry', !O2.srs.reviewAsksClue(trigStep, null));

  // ---------- 5. squares from a tap
  { const r = { left: 0, top: 0, width: 80, height: 80 };
    ok('squareAt maps (5,5) and (75,75)', O2.squareAt(r, 5, 5) !== null && O2.squareAt(r, 75, 75) !== null && O2.squareAt(r, 5, 5) !== O2.squareAt(r, 75, 75));
    ok('squareAt outside the board', O2.squareAt(r, -3, 5) === null && O2.squareAt(r, 85, 5) === null); }

  // ---------- 6. review: Q1 once per line, then the move; wrong tap = no penalty; normal moves blocked while Q1 is open
  reset();
  { const lineId = 'cl-main', l = L(lineId), mine = l.mine, trigs = mine.filter(s => s.n.trig);
    ok('cl-main has 2 trigger cards', trigs.length === 2, trigs.length);
    mine.forEach(s => progress.o2c[key(s.id)] = { lv: 1, due: t - DAY, n: 0, w: 0, s: 0 });   // all due, first review
    progress.o2l[key(lineId)] = { done: 1 }; O2.refresh();
    O2.reviewCourse(C);
    await driveUntil(lineId, () => /Question 1/.test(fbText()));
    ok('review: Q1 asked before the first trigger move', /Question 1/.test(fbText()) && /Tap the square where you should look/.test(fbText()));
    ok('review: Q1 has a "Show me" button and no Hint', /data-pa="q1show"/.test(bar()) && !asking());
    const o = [...boards].reverse().find(o => o.movable);
    ok('review: no move can be made while Q1 is open', !o.movable.color && (!o.movable.dests || o.movable.dests.size === 0), JSON.stringify(o.movable?.color));
    const before = boards.length; await answer(trigs[0]); // try a normal move
    ok('review: a board move during Q1 changes nothing', /Question 1/.test(fbText()));
    tapAt('a1');
    await until(() => /Look here|look here/.test(fbText()), 'wrong tap card');
    ok('wrong tap shows the clue circles and no penalty', /look here/i.test(fbText()) && [...boards].reverse().find(o => o.drawable?.autoShapes?.length)?.drawable.autoShapes.some(s => s.orig === 'g6' || s.orig === 'h4'), JSON.stringify([...boards].reverse().find(o => o.drawable)?.drawable));
    ok('no srs change from the question', progress.o2c[key(trigs[0].id)].n === 0);
    clickPa('cont');
    await until(asking, 'ask move');
    ok('then the move is asked', asking());
    await answer(trigs[0]);
    // go on through the line, answering what is asked
    let guard = 0;
    while (!/Review finished/.test(fbText()) && guard++ < 400) {
      if (asking()) {
        const fen = posOf(lastFen()), st = C.seq[lineId].find(s => s.n.mine && posOf(s.fen) === fen);
        if (st) await answer(st); else await tick(2);
      } else if (/data-pa="cont"/.test(bar())) clickPa('cont'); else await tick(2);
    }
    ok('review finished', /Review finished/.test(fbText()), fbText().slice(0, 100));
    ok('at most one Q1 for the line in this run', fbLog.filter(x => /Question 1/.test(x)).length === 1, fbLog.filter(x => /Question 1/.test(x)).length);
    ok('review never asked Q2', !fbLog.some(x => /Question 2/.test(x)));
    ok('answers were saved under the @3 keys', mine.every(s => progress.o2c[key(s.id)].n >= 1) && !Object.keys(progress.o2c).some(k => !k.includes('@3/')));
  }

  // ---------- 7. review: a later clean review does not ask Q1; a missed card does
  reset();
  { const l = L('adv-h4'), s = l.mine.find(x => x.n.trig);
    l.mine.forEach(x => progress.o2c[key(x.id)] = { lv: 3, due: t - DAY, n: 3, w: 0, s: 3 }); progress.o2l[key('adv-h4')] = { done: 1 }; O2.refresh();
    O2.reviewCourse(C);
    await until(asking, 'ask', 6000);
    ok('clean second review: no Q1', !fbLog.some(x => /Question 1/.test(x)));
    clickAct('home'); await tick(20);
  }
  reset();
  { const l = L('adv-h4'), s = l.mine.find(x => x.n.trig);
    l.mine.forEach(x => progress.o2c[key(x.id)] = { lv: 3, due: t - DAY, n: 3, w: 0, s: 3 });
    progress.o2c[key(s.id)] = { lv: 1, due: t - DAY, n: 3, w: 1, s: 0 }; progress.o2l[key('adv-h4')] = { done: 1 }; O2.refresh();
    O2.reviewCourse(C);
    await driveUntil('adv-h4', () => /Question 1/.test(fbText()));
    ok('missed last time: Q1 comes before the move', /Question 1/.test(fbText()));
    tapAt('h4');
    await until(() => /Yes, look at/.test(fbText()), 'right tap');
    ok('right tap (any clue square) is accepted', /Yes, look at/.test(fbText()));
    await until(asking, 'ask', 3000);
    ok('then the move is asked', asking());
    clickAct('home'); await tick(20);
  }

  // ---------- 8. rule card: wrong move = the twin line's move
  reset();
  { const l = L('cl-bc4'), s = l.mine.find(x => x.san === 'e6');
    l.mine.forEach(x => progress.o2c[key(x.id)] = { lv: 3, due: t - DAY, n: 3, w: 0, s: 3 }); progress.o2l[key('cl-bc4')] = { done: 1 }; O2.refresh();
    ok('sisters() finds the twin move', !!O2.srs.sisters(C, l, C.seq['cl-bc4'].indexOf(s)).find(x => x.s2.san === 'h6'));
    O2.reviewCourse(C);
    await until(asking, 'ask', 6000);
    // play h6 where the line wants e6 (legal here)
    const wrongSeq = { from: 'h7', to: 'h6' };
    let g = 0; while (asking() && g++ < 6 && C.seq['cl-bc4'].find(x => x.n.mine && posOf(x.fen) === posOf(lastFen()))?.san !== 'e6') { const st = C.seq['cl-bc4'].find(x => x.n.mine && posOf(x.fen) === posOf(lastFen())); await answer(st); await until(asking, 'next', 600); }
    await answer(wrongSeq);
    await until(() => /o2-rulecard/.test(fbText()), 'rule card', 400);
    ok('wrong sister move: rule card shown', /o2-rulecard/.test(fbText()), fbText().slice(0, 200));
    ok('rule card: rule name + text + trigger sentence', /A bishop looks at f7/.test(fbText()) && /shut the diagonal/.test(fbText()));
    ok('rule card: two mini boards, here / there', (fbText().match(/data-mini=/g) || []).length === 2 && /here →/.test(fbText()) && /there →/.test(fbText()));
    ok('rule card: names the twin line and its move', /Classical: 4\.\.\.Bf5/.test(fbText()) && /6\.\.\.h6/.test(fbText()));
    clickAct('home'); await tick(20);
  }

  // ---------- 9. branch learn: shared start fast, pause card, Q1 + Q2, then the move; trunk learn has Q1/Q2 too
  reset();
  learned('adv-main', 2);
  { O2.refresh();
    clickAct('learn', { c: C.id, l: 'adv-h4' });
    const saw = { start: false, pause: false, q1: false, q2: false, learned: false, boardsAtPause: 0 };
    let guard = 0, waitedForPause = null;
    const rule = C.rulesById.get('h-pawn');
    while (!saw.learned && guard++ < 4000) {
      const f = fbText(), b = bar();
      if (/Same as/.test(f) && !saw.pause) { saw.pause = true; saw.pauseHtml = f; saw.boardsAtPause = boards.filter(o => o.fen).length; saw.pauseFen = lastFen(); }
      if (/Question 1/.test(f)) saw.q1 = true;
      if (/Question 2/.test(f)) saw.q2 = true;
      if (/Line learned/.test(f)) { saw.learned = true; break; }
      if (/Question 1/.test(f) && /data-pa="q1show"/.test(b)) { tapAt('h4'); await tick(3); continue; }
      if (/Question 2/.test(f) && q2Options().length) {
        saw.opts = q2Options().map(x => x[1]);
        const right = q2Options().find(x => x[1] === rule.name); click({ '[data-q2]': { dataset: { q2: String(right[0]) } } }); await tick(3); continue;
      }
      await drive('adv-h4');
    }
    ok('branch learn: finished (line learned)', saw.learned, fbText().slice(0, 150));
    ok('branch learn: pause card text', /Same as <\/?[^>]*>?.*Advance: 3\.\.\.Bf5 and \.\.\.c5 until here/.test(saw.pauseHtml || '') || /Same as Advance: 3\.\.\.Bf5 and \.\.\.c5 until here/.test(saw.pauseHtml || ''), saw.pauseHtml);
    ok('branch learn: "Now White plays 4.h4 instead of 4.Nf3"', /Now White plays <b>4\.h4<\/b> instead of <b>4\.Nf3<\/b>/.test(saw.pauseHtml || ''), saw.pauseHtml);
    ok('branch learn: parent position as a mini board with the changed squares', /data-mini="[^"]+"/.test(saw.pauseHtml || '') && /data-shapes="g:g1 g:f3"/.test(saw.pauseHtml || ''), saw.pauseHtml);
    ok('branch learn: shared start was shown before the pause (6 moves) and the split move played', C.seq['adv-h4'].slice(0, 7).every(s => true) && saw.pauseFen && posOf(saw.pauseFen) === posOf(C.seq['adv-h4'][6].after), saw.pauseFen);
    ok('branch learn: Q1 then Q2 asked at the trigger move', saw.q1 && saw.q2);
    ok('branch learn: Q2 offers the rule + the "not" rules, 3 buttons', saw.opts && saw.opts.length === 3 && saw.opts.includes('h4 against your bishop'), JSON.stringify(saw.opts));
    ok('branch learn: line saved under the @3 key', !!progress.o2l[key('adv-h4')] && L('adv-h4').mine.every(s => progress.o2c[key(s.id)]));
    ok('branch learn: no console errors', !errors.length, errors.join(' | '));
  }
  reset(); errors.length = 0;
  { // trunk learn: Q1 + Q2 at the trigger moves too (cl-main has two)
    clickAct('learn', { c: C.id, l: 'cl-main' });
    let q1 = 0, q2 = 0, learnedLine = false, guard = 0, pause = false;
    const rule = C.rulesById.get('h-pawn');
    while (!learnedLine && guard++ < 6000) {
      const f = fbText(), b = bar();
      if (/Same as/.test(f)) pause = true;
      if (/Line learned/.test(f)) { learnedLine = true; break; }
      if (/Question 1/.test(f) && /data-pa="q1show"/.test(b)) { q1++; tapAt('a1'); await tick(3); continue; }          // a wrong tap: shows the clue, no penalty
      if (/Question 2/.test(f) && q2Options().length) { q2++; const wrong = q2Options().find(x => x[1] !== rule.name); click({ '[data-q2]': { dataset: { q2: String(wrong[0]) } } }); await tick(3); continue; }
      await drive('cl-main');
    }
    if (!learnedLine) console.log('STALL', JSON.stringify({ bar: bar().slice(0, 200), panel: panel().slice(0, 200), fb: fbText().slice(0, 100) }));
    ok('trunk learn: finished', learnedLine, fbText().slice(0, 150));
    ok('trunk learn: no pause card (it is a trunk)', !pause);
    ok('trunk learn: Q1 and Q2 at both trigger moves (step 1 only)', q1 === 2 && q2 === 2, `${q1}/${q2}`);
    ok('trunk learn: wrong answers did not block or penalise', !!progress.o2l[key('cl-main')] && L('cl-main').mine.every(s => (progress.o2c[key(s.id)] || {}).w === 0));
    ok('trunk learn: no console errors', !errors.length, errors.join(' | '));
  }

  // ---------- 10. course screen + rule book render (strings)
  reset();
  learned('adv-main', 1);
  { O2.show('course', C.id); await tick(3);
    const html = $('#o2-tab').innerHTML;
    ok('course screen renders (no errors)', !errors.length, errors.join(' | '));
    ok('course screen: trunk marked Main line', /o2-trunk">Main line/.test(html));
    ok('course screen: branch says "leaves <parent> at <move>"', /leaves Advance: 3\.\.\.Bf5 and \.\.\.c5 at 4\.h4/.test(html), html.match(/leaves[^<]*/g));
    ok('course screen: locked reason shown', /Opens when Advance: 3\.\.\.Bf5 and \.\.\.c5 has had its first review/.test(html));
    ok('course screen: locked line has "Learn anyway"', /Learn anyway/.test(html));
    ok('course screen: branch indented under its parent', /o2-sub/.test(html) && html.indexOf('data-line="adv-main"') < html.indexOf('data-line="adv-h4"'));
    ok('course screen: Next up marker is on cl-main', /data-line="cl-main"[^>]*>[\s\S]{0,400}?Next up/.test(html) || /next[^"]*"[^>]*data-line="cl-main"/.test(html), '');
    ok('course screen: mixed chapter shows its line', /data-line="odd-nf3"/.test(html));
    store.set('o2tab.' + C.id, 'ideas'); O2.show('course', C.id); await tick(3);
    const ih = $('#o2-tab').innerHTML;
    ok('Ideas tab: Rule book listed', /Rule book/.test(ih) && (ih.match(/data-rule="/g) || []).length === C.rules.length, (ih.match(/data-rule="/g) || []).length);
    ok('Ideas tab: each case is a mini board with its move', (ih.match(/class="o2-case"/g) || []).length === C.rules.reduce((a, r) => a + r.cases.length, 0) && /<b>6\.\.\.h6<\/b>/.test(ih));
  }

  const failed = checks.filter(c => !c[1]).length;
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('crash', e); process.exit(1); });
