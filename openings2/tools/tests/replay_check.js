// Review replay checks: every reviewed line is played from move 1 (option o2fromstart, default on), Skip, the guided
// replay for missed moves, several asked moves in one line, Back mid-replay, Black courses. Run: node openings2/tools/tests/replay_check.js
// Loads o2core.js in a vm with a fake DOM (one element per selector), a fake board that records every position it is
// asked to show, fast timers (1/100 of the real delay) and the real courses2.json.
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

// board: remember every config it gets
let boards = [];
const board = { set(o) { boards.push(o); }, state: {} };
const Chessground = (el, o) => { boards.push(o); return board; };
const kv = new Map();
const store = { get: (k, d) => kv.has(k) ? kv.get(k) : d, set: (k, v) => kv.set(k, v) };
const data = JSON.parse(read('docs/courses2.json'));
const progress = {};
const record = (kind, id, value) => { (progress[kind] ||= {})[id] = { ...value }; };
const root = fakeEl({ offsetParent: {} });
O2.init({ root, data, hooks: { Chessground, record, progress, store } });
const $ = s => root.querySelector(s);

const DAY = 86400000, t = O2.now();
const reset = () => { for (const k of Object.keys(progress)) delete progress[k]; progress.o2c = {}; progress.o2l = {}; progress.o2d = {}; O2.srs.resetLoad(); boards = []; };
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
const bar = () => $('#o2-actions').innerHTML;
const fbText = () => $('#o2-fb').innerHTML;
const asking = () => /data-pa="hint"/.test(bar());
async function until(cond, what, n = 3000) { for (let i = 0; i < n; i++) { if (cond()) return true; await tick(2); } console.log('  timeout waiting for', what); return false; }
const click = ds => listeners.click.forEach(f => f({ target: { closest: sel => sel === '[data-pa]' && ds.pa ? { dataset: ds } : sel === '[data-act]' && ds.act ? { dataset: ds, tagName: 'BUTTON' } : null } }));
const key = k => listeners['doc:keydown'].forEach(f => f({ key: k, target: { closest: () => null }, preventDefault() {} }));
const posOf = f => f.split(' ').slice(0, 4).join(' ');
const shown = () => boards.filter(o => o.fen).map(o => posOf(o.fen));
// positions of a line from the start up to (incl.) the one before seq[upto]
function positions(seq, upto) { const g = new Chess(), out = [posOf(g.fen())]; for (let i = 0; i < upto; i++) { g.move(seq[i].san, { sloppy: true }); out.push(posOf(g.fen())); } return out; }
const inOrder = (want, got) => { let j = 0; for (const x of got) if (x === want[j]) j++; return j === want.length; };
async function answer(s) {
  const o = [...boards].reverse().find(o => o.movable?.events?.after);
  o.movable.events.after(s.from, s.to);
  await tick(2);
}
// a card deep in its own line (first asked move at index >= minI), optionally with a second mine card later in the same line
function pick(c, minI, second = false) {
  for (const k of c.cards) {
    const seq = c.seq[k.line]; if (!seq) continue;
    const i = seq.findIndex(s => s.id === k.id);
    if (i < minI) continue;
    if (!second) return { k, seq, i };
    const j = seq.findIndex((s, j) => j > i + 3 && s.n.mine && c.cardById.get(s.id)?.line === k.line);
    if (j > 0) return { k, seq, i, j, k2: c.cardById.get(seq[j].id) };
  }
}
const due = (c, id, lapse = false) => { progress.o2c[`${c.id}${c.ver === 3 ? "@3" : ""}/${id}`] = lapse ? { lv: 1, due: t - DAY, n: 2, w: 1, s: 0 } : { lv: 3, due: t - DAY, n: 3, w: 0, s: 3 }; };

(async () => {
  const courses = O2.courses();
  const white = courses.find(c => c.side === 'white'), black = courses.find(c => c.side === 'black');

  // 1. normal due move, default option -> whole line from move 1, Skip offered, ask with no pending Continue
  for (const c of [white, black]) {
    reset();
    const { k, seq, i } = pick(c, 10);
    due(c, k.id); O2.refresh();
    O2.reviewCourse(c);
    let sawSkip = false;
    await until(() => { sawSkip ||= /Skip to the question/.test(bar()); return asking(); }, 'ask');
    ok(`${c.id}: normal move asked`, asking());
    ok(`${c.id}: line shown from move 1 (${i} moves)`, inOrder(positions(seq, i), shown()), shown().length);
    ok(`${c.id}: board shows the question position`, shown().at(-1) === positions(seq, i).at(-1));
    ok(`${c.id}: Skip was offered`, sawSkip);
    ok(`${c.id}: orientation ${c.side}`, boards.filter(o => o.orientation).every(o => o.orientation === c.side));
    ok(`${c.id}: "watch from move 1" text`, /Watch the line from move 1/.test(fbText()) || /Your move/.test(fbText()));
    key(' ');                                   // Space during the question: nothing pending, still asking
    await tick(5);
    ok(`${c.id}: Space at the question does nothing`, asking());
    await answer(seq[i]);
    await until(() => /Review finished/.test(fbText()), 'summary');
    ok(`${c.id}: summary after the answer`, /Review finished/.test(fbText()) && /1 of 1 right/.test(fbText()), fbText().slice(0, 120));
  }

  // 2. option off -> old short context (one move before the question)
  reset(); store.set('o2fromstart', false);
  { const c = white, { k, seq, i } = pick(c, 10); due(c, k.id); O2.refresh();
    O2.reviewCourse(c);
    await until(asking, 'ask');
    const want = positions(seq, i), got = shown();
    ok('option off: no move-1 replay', !got.includes(want[0]) && !got.includes(want[3]), got.length);
    ok('option off: still reaches the question', got.at(-1) === want.at(-1));
    await answer(seq[i]); await until(() => /Review finished/.test(fbText()), 'summary');
  }
  store.set('o2fromstart', true);

  // 3. Skip jumps to the question
  reset();
  { const c = white, { k, seq, i } = pick(c, 14); due(c, k.id); O2.refresh();
    O2.reviewCourse(c);
    await until(() => /Skip to the question/.test(bar()), 'skip');
    click({ pa: 'cont' });
    await until(asking, 'ask');
    ok('skip: reaches the question', asking() && shown().at(-1) === positions(seq, i).at(-1));
    ok('skip: did not play every move', !inOrder(positions(seq, i), shown()));
    await answer(seq[i]); await until(() => /Review finished/.test(fbText()), 'summary');
  }

  // 4. missed move -> guided replay: recap, "Play from move 1", from move 1, nothing pending at the question
  reset();
  { const c = black, { k, seq, i } = pick(c, 10); due(c, k.id, true); O2.refresh();
    O2.reviewCourse(c);
    await until(() => /Play from move 1/.test(bar()), 'recap');
    ok('lapse: recap shown', /o2-recap/.test(fbText()) && /You missed a move/.test(fbText()));
    ok('lapse: phone caption has the move list', /o2-recap/.test($('#o2-cap').innerHTML) && !$('#o2-cap').hidden);
    key(' ');
    await until(asking, 'ask', 6000);
    ok('lapse: guided replay from move 1', inOrder(positions(seq, i), shown()));
    key(' '); await tick(5);
    ok('lapse: Space at the question does nothing', asking());
    ok('lapse: caption cleared at the question', $('#o2-cap').innerHTML === '' && $('#o2-cap').hidden);
    await answer(seq[i]); await until(() => /Review finished/.test(fbText()), 'summary');
  }

  // 5. two asked moves in one line: after the first, the line goes on to the second
  reset();
  { const c = white, x = pick(c, 4, true); due(c, x.k.id); due(c, x.k2.id); O2.refresh();
    O2.reviewCourse(c);
    await until(asking, 'ask 1');
    await answer(x.seq[x.i]);
    ok('two moves: no Hint/Show while the line plays on', !/data-pa="hint"/.test(bar()) && /data-pa="flip"/.test(bar()), bar());
    await until(() => asking() && shown().at(-1) === positions(x.seq, x.j).at(-1), 'ask 2');
    ok('two moves: second question reached', asking() && shown().at(-1) === positions(x.seq, x.j).at(-1));
    ok('two moves: moves in between played', inOrder(positions(x.seq, x.j), shown()));
    await answer(x.seq[x.j]); await until(() => /Review finished/.test(fbText()), 'summary');
    ok('two moves: 2 of 2', /2 of 2 right/.test(fbText()));
  }

  // 6. a wrong answer -> "again" group at the end replays from move 1 (guided)
  reset();
  { const c = white, { k, seq, i } = pick(c, 10); due(c, k.id); O2.refresh();
    O2.reviewCourse(c);
    await until(asking, 'ask');
    const s = seq[i], g = new Chess(s.fen), wrong = g.moves({ verbose: true }).find(m => m.san !== s.san && !(s.n.alts || []).some(a => a.san === m.san));
    const o = [...boards].reverse().find(o => o.movable?.events?.after);
    o.movable.events.after(wrong.from, wrong.to); await tick(5);
    await answer(s);                                  // play the arrow move
    await until(() => /data-pa="cont"/.test(bar()), 'continue');
    boards = [];
    key(' ');
    await until(() => /Play from move 1/.test(bar()), 'again recap');
    ok('again: recap shown', /One more time, from the start/.test(fbText()));
    key(' ');
    await until(asking, 'ask again', 6000);
    ok('again: replayed from move 1', inOrder(positions(seq, i), shown()));
    await answer(s); await until(() => /Review finished/.test(fbText()), 'summary');
  }

  // 7. Back in the middle of a replay: no errors, board stops
  reset(); errors.length = 0;
  { const c = white, { k } = pick(c, 14); due(c, k.id); O2.refresh();
    O2.reviewCourse(c);
    await until(() => shown().length > 4, 'replay running');
    click({ act: 'back' });
    await tick(5); const n = boards.length;
    await tick(80);
    ok('back: replay stopped', boards.filter(o => o.fen).length === boards.slice(0, n).filter(o => o.fen).length, boards.length - n);
    ok('back: no errors', !errors.length, errors.join(' | '));
  }

  // 8. practice of a line also starts from move 1
  reset();
  { const c = black, { k, seq, i } = pick(c, 10); due(c, k.id); progress.o2c[`${c.id}${c.ver === 3 ? "@3" : ""}/${k.id}`].due = t + 30 * DAY; O2.refresh();
    // practise-line is internal; drive it through its button
    click({ act: 'practise-line', c: c.id, l: k.line });
    await until(asking, 'ask');
    ok('practice: from move 1', inOrder(positions(seq, i), shown()));
  }

  const failed = checks.filter(c => !c[1]).length;
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('crash', e); process.exit(1); });
