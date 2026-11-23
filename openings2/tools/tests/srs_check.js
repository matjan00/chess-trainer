// SRS unit checks for openings2/ui/o2core.js. Run: node openings2/tools/tests/srs_check.js
// Loads o2core.js in a vm with a fake DOM (every element is a no-op proxy) and the real courses2.json, with a controllable clock.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '../../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fakeEl() {
  const fn = function () {};
  const target = { dataset: {}, style: {}, children: [], hidden: false, offsetParent: null };
  const p = new Proxy(fn, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k in target) return target[k];
      if (k === 'querySelectorAll') return () => [];
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

const NOW0 = new Date(2026, 10, 18, 10, 0, 0).getTime();   // 18 Nov 2026 10:00 local
const ctx = {
  console, setTimeout, clearTimeout, Math, Date, JSON, Map, Set, Promise, Object, Array, String, Number, Intl,
  location: { search: '?o2now=' + NOW0 }, localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {} }), requestAnimationFrame: f => setTimeout(f, 0),
  document: { addEventListener() {}, getElementById: () => fakeEl(), querySelector: () => fakeEl(), documentElement: fakeEl(), body: fakeEl() },
  window: { scrollTo() {}, addEventListener() {}, scrollY: 0 },
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
vm.runInContext(read('docs/vendor/chess.min.js') + ';this.Chess = Chess;', ctx);
vm.runInContext(read('openings2/ui/o2core.js') + ';this.O2 = O2;', ctx);
const O2 = ctx.O2;

const data = JSON.parse(read('docs/courses2.json'));
const progress = {};
const stamp = { v: 0 };
const record = (kind, id, value) => { (progress[kind] ||= {})[id] = { ...value, t: ++stamp.v }; };
try {
  O2.init({ root: fakeEl(), data, hooks: { Chessground: () => fakeEl(), record, progress } });
} catch (e) { console.log('init failed', e); process.exit(1); }

const DAY = 86400000;
const courses = O2.courses();
const c0 = courses[0], c1 = courses[1] || courses[0];
const ids = c0.cards.map(k => k.id);
const get = (c, id) => progress.o2c[`${c.id}${c.ver === 3 ? "@3" : ""}/${id}`];
const reset = () => { for (const k of Object.keys(progress)) delete progress[k]; progress.o2c = {}; progress.o2l = {}; progress.o2d = {}; O2.srs.resetLoad(); };
const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };

// ---- interval text
ok('intervalText', [1, 3, 7, 14, 30, 90, 180, 13].map(O2.intervalText).join('|') === '1 day|3 days|1 week|2 weeks|1 month|3 months|6 months|13 days', [1, 3, 7, 14, 30, 90, 180, 13].map(O2.intervalText).join('|'));
ok('BACKLOG exported = 40', O2.srs.BACKLOG === 40);

// ---- fresh learn then ok climbs
reset();
O2.srs.learn(c0, [ids[0]]);
ok('learn: lv 1, due tomorrow', get(c0, ids[0]).lv === 1 && Math.abs(get(c0, ids[0]).due - (O2.now() + DAY)) < 5000);
let r = O2.srs.answer(c0, ids[0], 'ok');
ok('ok climbs 1 -> 2, returns {lv, prevLv, due}', r.lv === 2 && r.prevLv === 1 && get(c0, ids[0]).lv === 2 && r.due === get(c0, ids[0]).due, JSON.stringify(r));
ok('ok at box 2 -> due in 3 days', Math.abs(r.due - (O2.now() + 3 * DAY)) < 5000);
r = O2.srs.answer(c0, ids[0], 'hint');
ok('hint stays at box 2', r.lv === 2 && r.prevLv === 2);
ok('note text for ok/hint/wrong', /^✓ Box 3/.test(O2.srs.note({ lv: 3, prevLv: 2, due: O2.now() + 7 * DAY, result: 'ok' })) &&
  /stays · back in 1 week/.test(O2.srs.note({ lv: 3, prevLv: 3, due: O2.now() + 7 * DAY, result: 'hint' })) &&
  O2.srs.note({ lv: 2, prevLv: 4, due: 0, result: 'wrong' }) === '✗ Back tomorrow · box 2');

// ---- softer lapse
reset();
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[1]}`] = { lv: 6, due: O2.now() - 1000, n: 5, w: 0, s: 4 };
r = O2.srs.answer(c0, ids[1], 'wrong');
let s = get(c0, ids[1]);
ok('lapse: box 6 wrong -> 4, due tomorrow, w=1, s=0, n=6', s.lv === 4 && s.w === 1 && s.s === 0 && s.n === 6 && Math.abs(s.due - (O2.now() + DAY)) < 5000, JSON.stringify(s));
ok('lapse result prevLv 6', r.prevLv === 6 && r.lv === 4);
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[2]}`] = { lv: 1, due: O2.now() - 1000, n: 1, w: 0, s: 1 };
O2.srs.answer(c0, ids[2], 'wrong');
ok('lapse never below box 1', get(c0, ids[2]).lv === 1);
O2.srs.answer(c0, ids[3], 'wrong');   // brand new card
ok('wrong on a fresh card stays box 1', get(c0, ids[3]).lv === 1);
r = O2.srs.answer(c0, ids[1], 'pwrong');
ok('practice wrong: schedule level unchanged, result.practice', r.practice && get(c0, ids[1]).lv === 4);

// ---- old progress format reads fine
reset();
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[4]}`] = { lv: 3, due: O2.now() + 2 * DAY, n: 4, w: 1, s: 2, t: 123 };
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[5]}`] = { lv: 1, due: O2.now() - DAY };           // minimal old card
ok('old progress: get + isDue', O2.srs.get(c0, ids[4]).lv === 3 && !O2.srs.isDue(O2.srs.get(c0, ids[4])) && O2.srs.isDue(O2.srs.get(c0, ids[5])));
const old = O2.srs.dueCards().length;
ok('old progress: dueCards sees the overdue one', old === 1, old);
r = O2.srs.answer(c0, ids[4], 'ok');
ok('old progress: answer keeps format {lv,due,n,w,s}', Object.keys(get(c0, ids[4])).sort().join() === 'due,lv,n,s,t,w' && get(c0, ids[4]).n === 5);

// ---- spreading
reset();
// card at box 4 answered ok -> box 5 (IV 30): window round(27)..round(33) = 27..33
const t = O2.now();
// unknown card ids are ignored by the loader (it iterates real cards), so crowd with real cards of the other course/cards
const pool = c0.cards.map(k => k.id).filter(id => id !== ids[10]);
let pi = 0; const place = (d, n) => { for (let i = 0; i < n; i++) progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${pool[pi++]}`] = { lv: 3, due: t + d * DAY, n: 1, w: 0, s: 1 }; };
for (let d = 27; d <= 33; d++) place(d, d === 29 ? 0 : 3);          // every day busy except day 29
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[10]}`] = { lv: 4, due: t - 1000, n: 3, w: 0, s: 2 };
O2.srs.resetLoad();
ok('pickDays(box 5) chooses the empty day 29', O2.srs.pickDays(t, 5) === 29, O2.srs.pickDays(t, 5));
r = O2.srs.answer(c0, ids[10], 'ok');
ok('answer schedules on day 29 (in window)', Math.abs(r.due - (t + 29 * DAY)) < 5000 && r.lv === 5);
// now days all equal except 29 now has 1 -> ties go to closest to 30
const dd = O2.srs.pickDays(t, 5);
ok('window stays within 27..33', dd >= 27 && dd <= 33, dd);
for (let k = 0; k < 40; k++) { reset(); O2.srs.resetLoad(); const x = O2.srs.pickDays(t, 7); if (x < 162 || x > 198) { ok('box 7 window 162..198', false, x); break; } }
reset(); O2.srs.resetLoad();
const exact = [3, 4, 5, 6, 7].map(l => O2.srs.pickDays(t, l));
ok('empty schedule picks exactly IV (7,14,30,90,180 for boxes 3-7)', exact.join() === '7,14,30,90,180', exact.join());
ok('IV levels: lv3->7d lv4->14d', O2.srs.pickDays(t, 3) === 7 && O2.srs.pickDays(t, 4) === 14, [3, 4].map(l => O2.srs.pickDays(t, l)));
ok('short intervals untouched (box 2 = 3d)', O2.srs.pickDays(t, 2) === 3 && O2.srs.pickDays(t, 1) === 1);

// ---- forecast
reset();
const e = O2.endOfDay();
const lineOf = k => c0.lineById.get(k.line)?.title;
const ks = c0.cards.slice(0, 6);
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ks[0].id}`] = { lv: 2, due: t - 3 * DAY, n: 1, w: 0, s: 1 };   // overdue -> day 0
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ks[1].id}`] = { lv: 2, due: t + 1000, n: 1, w: 0, s: 1 };         // today
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ks[2].id}`] = { lv: 2, due: e + 1000, n: 1, w: 0, s: 1 };        // tomorrow
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ks[3].id}`] = { lv: 2, due: t + 3 * DAY, n: 1, w: 0, s: 1 };
progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ks[4].id}`] = { lv: 2, due: t + 30 * DAY, n: 1, w: 0, s: 1 };    // out of range
const f = O2.forecast();
ok('forecast: 7 entries', f.length === 7 && O2.forecast(3).length === 3 && O2.forecast(14).length === 14);
ok('forecast: day 0 counts overdue + today = 2, mins >= 1', f[0].n === 2 && f[0].mins === 1, JSON.stringify(f[0]));
ok('forecast: tomorrow 1, day+3 1, empty days 0 with mins 0', f[1].n === 1 && f[3].n === 1 && f[2].n === 0 && f[2].mins === 0 && f[2].items.length === 0);
ok('forecast: total in range 4, far card excluded', f.reduce((a, x) => a + x.n, 0) === 4);
ok('forecast: shape', /^\d{4}-\d{2}-\d{2}$/.test(f[0].day) && f[0].t === new Date(2026, 10, 18).getTime() && f[1].t === new Date(2026, 10, 19).getTime() && f[1].day === '2026-11-19', f[1].day);
const it = f[0].items[0];
ok('forecast: item fields', it && it.course === c0.title && it.courseId === c0.id && 'line' in it && 'lineId' in it && it.n >= 1, JSON.stringify(it));
ok('forecast: items sum to n and sorted desc', f[0].items.reduce((a, x) => a + x.n, 0) === f[0].n && f[0].items.every((x, i, a) => !i || a[i - 1].n >= x.n));
ok('forecast: n matches dueCards for day 0', f[0].n === O2.srs.dueCards().length);
// mins formula: ~11 s a move (line replayed from move 1), +15 s for a missed move; capped at 60 cards
reset();
c0.cards.slice(0, 100).forEach(k => { progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${k.id}`] = { lv: 1, due: t - 1, n: 1, w: 0, s: 1 }; });
const f2 = O2.forecast(1)[0];
ok('forecast: mins capped at 60 cards (11 min)', f2.n === Math.min(100, c0.cards.length) && f2.mins === Math.max(1, Math.round(Math.min(f2.n, 60) * 11 / 60)), JSON.stringify([f2.n, f2.mins]));
reset();
c0.cards.slice(0, 10).forEach((k, i) => { progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${k.id}`] = i < 4 ? { lv: 1, due: t - 1, n: 2, w: 1, s: 0 } : { lv: 2, due: t - 1, n: 2, w: 0, s: 2 }; });
ok('dueSummary: 10 due, 4 missed -> round((10*11 + 4*15)/60) = 3 min', O2.dueSummary().n === 10 && O2.dueSummary().mins === 3, JSON.stringify(O2.dueSummary()));

// ---- line info: next + minLv
reset();
const ln = c0.lineById.get(c0.order[0]);
ln.mine.forEach((m, i) => { progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${m.id}`] = { lv: 2 + (i % 2), due: t + (5 - (i % 3)) * DAY, n: 1, w: 0, s: 1 }; });
progress.o2l[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ln.id}`] = { done: 1 };
const li = O2.srs.lineInfo(c0, ln);
ok('lineInfo: minLv and earliest next', li.minLv === 2 && li.next === Math.min(...ln.mine.map(m => get(c0, m.id).due)), JSON.stringify(li));

// ---- rendering smoke test: course page (Learn + Review tabs) and home render without throwing
let rendered = true; try { for (const tb of ['learn', 'review']) { ctx.localStorage.getItem = k => (k === 'ct.o2tab.' + c0.id ? JSON.stringify(tb) : null); O2.show('course', c0.id); } O2.show('home'); } catch (err) { rendered = false; console.log(err); }
ok('home + course Learn/Review tabs render', rendered);

const bad = checks.filter(c => !c[1]).length;
console.log(`\n${checks.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
