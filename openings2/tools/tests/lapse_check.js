// Missed-move checks (lapse cap, spreading, sister lines). Run: node openings2/tools/tests/lapse_check.js
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
const Chess = ctx.Chess;
const t = O2.now(), refresh = () => { O2.refresh(); };
// ---- cap: 12 missed moves all due today -> only 5 stay today, the rest go to the next days (5 per day)
reset();
for (let i = 0; i < 12; i++) progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[i]}`] = { lv: 1, due: t - DAY + i * 1000, n: 2, w: 1, s: 0 };
for (let i = 12; i < 20; i++) progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[i]}`] = { lv: 3, due: t - DAY, n: 3, w: 0, s: 3 };   // normal reviews, untouched
refresh();
const due = O2.srs.dueCards();
const lapsedToday = due.filter(x => O2.srs.isLapse(get(x.c, x.id))).length;
ok('only 5 missed moves due today', lapsedToday === 5, lapsedToday);
ok('normal reviews still all due', due.filter(x => !O2.srs.isLapse(get(x.c, x.id))).length === 8);
ok('oldest 5 kept today', [0, 1, 2, 3, 4].every(i => get(c0, ids[i]).due <= O2.endOfDay()));
const m = O2.srs.lapsesByDay();
const days = [...m.entries()].sort();
ok('spread 5 / 5 / 2 over today, +1, +2', JSON.stringify(days.map(d => d[1])) === '[5,5,2]', JSON.stringify(days));
// ---- a new miss goes to the first day with room (today+1 has 5 already -> +2)
let r = O2.srs.answer(c0, ids[30], 'wrong');
ok('new miss skips the full day', Math.round((r.due - t) / DAY) === 2, (r.due - t) / DAY);
ok('note says when', /^✗ Back in 2 days · box 1$/.test(O2.srs.note(r)), O2.srs.note(r));
// ---- right answer clears the lapse
O2.srs.answer(c0, ids[0], 'ok');
ok('ok clears lapse', !O2.srs.isLapse(get(c0, ids[0])));
// ---- few misses: nothing moved
reset();
for (let i = 0; i < 3; i++) progress.o2c[`${c0.id}${c0.ver === 3 ? "@3" : ""}/${ids[i]}`] = { lv: 1, due: t - DAY, n: 1, w: 1, s: 0 };
refresh();
ok('3 misses all stay due', O2.srs.dueCards().length === 3);
r = O2.srs.answer(c0, ids[5], 'wrong');
ok('miss with room -> tomorrow', Math.round((r.due - t) / DAY) === 1 && O2.srs.note(r) === '✗ Back tomorrow · box 1', O2.srs.note(r));
// ---- sister lines: every course has at least one move with a "don't mix it up" partner, and the data is sane
for (const c of courses) {
  let n = 0, bad = 0, sp = 0;
  for (const l of c.lines) {
    const seq = c.seq[l.id];
    seq.forEach((s, i) => {
      if (!s.n.mine) return;
      if (O2.srs.signpost(c, l, i)) sp++;
      for (const x of O2.srs.sisters(c, l, i)) { n++; if (!(x.d >= 1 && x.d <= 4) || x.s2.san === s.san || !new Chess(s.fen).move(x.s2.san, { sloppy: true })) bad++; }
    });
  }
  console.log(`  ${c.id}: ${n} mix-up notes, ${sp} moves with a signpost`);
  ok(`${c.id}: sisters found and consistent`, n > 0 && bad === 0, `${n} ${bad}`);
}
// examples
for (const c of courses) { let k = 0; for (const l of c.lines) { const seq = c.seq[l.id]; seq.forEach((s, i) => { if (k >= 3 || !s.n.mine) return; const x = O2.srs.sisters(c, l, i)[0]; if (x && i > 6 && Math.random() < 0.15) { k++; console.log(`  ${c.id} | ${l.title} | ${s.ply}. ${s.san}  vs  "${x.l2.title}" ${x.s2.san}  (here ${x.hereP} / there ${x.thereP})`); } }); } }
const failed = checks.filter(c => !c[1]).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
