// SRS checks for t2core.js in a fake browser (node train2/tools/tests/srs_check.js). No server, no DOM: only the scheduling logic.
const fs = require('fs'), path = require('path');
const UI = path.join(__dirname, '../../ui/');
const Chess = new Function(fs.readFileSync(path.join(__dirname, '../../../vendor/pwa/chess.min.js'), 'utf8') + ';return Chess;')();

const DAY = 86400000;
const T0 = new Date(2026, 10, 18, 12, 0, 0).getTime();          // Wed 18 Nov 2026, noon (local)
const ls = { 'ct.t2now': String(T0) };
const seen = {};   // last innerHTML written / HTML inserted
const el = new Proxy(function () {}, { get: (t, k) => k === 'dataset' ? {} : k === 'classList' ? { add() {}, remove() {} } : k === Symbol.toPrimitive ? () => '' : k === 'insertAdjacentHTML' ? (w, h) => { seen.inserted = h; } : el,
  set: (t, k, v) => { if (k === 'innerHTML') seen.html = v; return true; }, apply: () => el });
const root = { dataset: {}, addEventListener() {}, querySelector: () => el, querySelectorAll: () => [] };
Object.assign(globalThis, {
  Chess, window: { scrollTo() {}, scrollY: 0, open() {} }, document: { addEventListener() {} }, location: { search: '' },
  localStorage: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } }, matchMedia: () => ({ matches: false }),
});
const T2 = new Function(fs.readFileSync(UI + 't2core.js', 'utf8') + ';return T2;')();

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const data = {
  train: { courses: [{ id: 'endgames', title: 'Endgames', chapters: [{ id: 'ch', title: 'Ch', lessons: ['l1'] }],
    lessons: { l1: { id: 'l1', title: 'L1', steps: [{ t: 'card', id: 'k1' }, { t: 'card', id: 'k2' }] } },
    cards: { k1: { fen: START, sol: ['e2e4'] }, k2: { fen: START, sol: ['d2d4'] } } }] },
  puzzles: { groups: [{ id: 'fork', name: 'Forks' }], rows: [['p1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 'e7e5 g1f3 b8c6', 1400, [0], 'why', ''], ['p2', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 'd7d5 d2d4 g8f6', 1400, [0], 'why', '']] },
  mine: { cards: [{ id: 'fix/g1-5', type: 'fix', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', sol: ['e7e5'] },
                  { id: 'fix/g2-9', type: 'fix', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', sol: ['d7d5'] }] },
};
const progress = {};
const record = (kind, id, v) => { (progress[kind] ||= {})[id] = { ...v, t: Date.now() }; };
T2.init({ root, data, hooks: { Chessground: () => ({ set() {}, destroy() {} }), record, progress } });

let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const now = () => T2.now();
const reset = () => { for (const k of Object.keys(progress)) delete progress[k]; progress.t2c = {}; progress.t2d = {}; T2.refresh(); };
const put = (id, s) => { progress.t2c[id] = { n: 3, w: 0, s: 2, ...s }; };
const near = (a, b) => Math.abs(a - b) < 5000;
const dayOff = (t, d) => Math.round((t - now()) / DAY) === d || Math.abs((t - now()) / DAY - d) < 0.01;

// ---- intervalText
eq([1, 3, 7, 14, 30, 90, 180, 5, 29].map(T2.intervalText), ['1 day', '3 days', '1 week', '2 weeks', '1 month', '3 months', '6 months', '5 days', '29 days'], 'intervalText');
eq(T2.srs.BACKLOG, 40, 'BACKLOG');

// ---- softer lapse
reset(); put('ls/endgames.k1', { lv: 6, due: now() - DAY });
eq(T2.srs.answer('ls/endgames.k1', 'wrong'), 'reset', 'wrong returns reset');
let c = progress.t2c['ls/endgames.k1'];
eq([c.lv, c.w, c.s], [4, 1, 0], 'lv 6 wrong -> 4, w+1, s 0');
ok(near(c.due, now() + DAY), 'due tomorrow after lapse');
ok(/^✗ Back tomorrow · box 4$/.test(T2.srs.note(T2.srs.last())), 'wrong note: ' + T2.srs.note(T2.srs.last()));
put('ls/endgames.k1', { lv: 2, due: now() - DAY }); T2.srs.answer('ls/endgames.k1', 'wrong'); eq(progress.t2c['ls/endgames.k1'].lv, 1, 'lv 2 wrong -> 1 (never below 1)');
put('ls/endgames.k1', { lv: 1, due: now() - DAY }); T2.srs.answer('ls/endgames.k1', 'wrong'); eq(progress.t2c['ls/endgames.k1'].lv, 1, 'lv 1 wrong -> 1');
reset(); eq(T2.srs.answer('pz/p1', 'wrong'), 'new-card', 'fresh wrong'); eq(progress.t2c['pz/p1'].lv, 1, 'fresh card wrong stays box 1');

// ---- clean new puzzle is never scheduled; notes
reset(); eq(T2.srs.answer('pz/p2', 'ok'), 'seen', 'clean first solve is seen'); ok(!progress.t2c['pz/p2'], 'not scheduled'); eq(T2.srs.note(T2.srs.last()), '', 'no note for seen');

// ---- retire still works
reset(); put('pz/p1', { lv: 4, due: now() - 1 }); eq(T2.srs.answer('pz/p1', 'ok'), 'retired', 'pz retires at box 4'); eq(progress.t2c['pz/p1'].lv, 9, 'retired lv');
eq(T2.srs.note(T2.srs.last()), "✓ Learned for good, it won't come back", 'retired note');
put('pz/p1', { lv: 3, due: now() - 1 }); eq(T2.srs.answer('pz/p1', 'ok'), 'up', 'pz box 3 climbs'); eq(progress.t2c['pz/p1'].lv, 4, 'to 4');
put('mine/fix/g1-5', { lv: 5, due: now() - 1 }); eq(T2.srs.answer('mine/fix/g1-5', 'ok'), 'retired', 'mine retires at box 5');
put('ls/endgames.k1', { lv: 7, due: now() - 1 }); eq(T2.srs.answer('ls/endgames.k1', 'ok'), 'up', 'lesson card never retires'); eq(progress.t2c['ls/endgames.k1'].lv, 7, 'stays at top box');

// ---- notes for up / hint
reset(); put('ls/endgames.k1', { lv: 2, due: now() - 1 }); T2.srs.answer('ls/endgames.k1', 'ok');
let sc = T2.srs.last(); eq([sc.what, sc.lv, sc.days], ['up', 3, 7], 'up to box 3, nominal 7');
ok(/^✓ Box 3 · back in 1 week \(\d+ \w{3}\)$/.test(T2.srs.note(sc)), 'up note: ' + T2.srs.note(sc));
put('ls/endgames.k1', { lv: 3, due: now() - 1 }); eq(T2.srs.answer('ls/endgames.k1', 'hint'), 'stay', 'hint stays');
ok(/^Box 3 · stays · back in 1 week \(/.test(T2.srs.note(T2.srs.last())), 'hint note: ' + T2.srs.note(T2.srs.last()));

// ---- spreading: window 6..8 for a 7-day interval, least loaded day wins, ties -> closest, then earlier
const fill = (counts) => { reset(); let i = 0; for (const [d, n] of Object.entries(counts)) for (let k = 0; k < n; k++) put('ls/endgames.f' + (i++), { lv: 3, due: now() + d * DAY }); put('ls/endgames.k1', { lv: 2, due: now() - 1 }); T2.refresh(); };
const chosen = () => { T2.srs.answer('ls/endgames.k1', 'ok'); return Math.round((progress.t2c['ls/endgames.k1'].due - now()) / DAY); };
fill({ 6: 2, 7: 3, 8: 1 }); eq(chosen(), 8, 'least loaded day (8)');
fill({ 6: 1, 7: 3, 8: 2 }); eq(chosen(), 6, 'least loaded day (6)');
fill({ 6: 0, 7: 5, 8: 0 }); eq(chosen(), 6, 'tie 6/8 -> earlier');
fill({}); eq(chosen(), 7, 'empty -> the target day');
fill({ 7: 1 }); eq(chosen(), 6, 'only target loaded -> neighbour');
fill({ 5: 0, 6: 4, 7: 4, 8: 4, 9: 0 }); eq(chosen(), 7, 'outside the window is ignored');
// the map follows our own answers: three cards in a row do not all land on one day
reset(); for (const k of ['k1', 'k2', 'x3', 'x4', 'x5', 'x6']) put('ls/endgames.' + k, { lv: 2, due: now() - 1 });
const days = []; for (const k of ['k1', 'k2', 'x3', 'x4', 'x5', 'x6']) { T2.srs.answer('ls/endgames.' + k, 'ok'); days.push(Math.round((progress.t2c['ls/endgames.' + k].due - now()) / DAY)); }
ok(days.every(d => d >= 6 && d <= 8), 'window respected ' + days);
const cnt = d => days.filter(x => x === d).length; ok(Math.max(cnt(6), cnt(7), cnt(8)) === 2, 'six cards spread 2/2/2: ' + days);
// 180 days: window 162..198
reset(); put('ls/endgames.k1', { lv: 6, due: now() - 1 }); T2.srs.answer('ls/endgames.k1', 'ok'); const d180 = Math.round((progress.t2c['ls/endgames.k1'].due - now()) / DAY); ok(d180 === 180, 'empty load keeps 180: ' + d180);
// short intervals are never moved
reset(); put('ls/endgames.k1', { lv: 1, due: now() - 1 }); T2.srs.answer('ls/endgames.k1', 'ok'); ok(near(progress.t2c['ls/endgames.k1'].due, now() + 3 * DAY), '3 days stays exactly 3');

// ---- forecast + legacy
reset();
progress.t2d['2026-11-01'] = { rev: 1 };                      // anchor = 1 Nov
progress.solved = { 'g1-5': { t: 1 }, 'g2-9': { t: 1 } };       // old fixed-mistake records -> legacy cards (due 1 Nov + hash%14 days)
put('pz/p1', { lv: 2, due: now() - 3 * DAY });                 // overdue
put('pz/p2', { lv: 2, due: now() + 2 * DAY });
put('ls/endgames.k1', { lv: 2, due: now() + 2 * DAY + 1000 });
put('ls/endgames.k2', { lv: 9, due: 0 });                      // retired: never counted
put('pz/nope', { lv: 2, due: now() });                         // no such puzzle: cannot be served, not counted
put('ls/nocourse.k1', { lv: 2, due: now() });
T2.refresh();
const f = T2.forecast(7);
eq(f.length, 7, 'forecast length'); eq(T2.forecast().length, 7, 'default 7'); eq(T2.forecast(3).length, 3, 'forecast(3)');
eq([f[0].day, f[1].day, f[6].day], ['2026-11-18', '2026-11-19', '2026-11-24'], 'forecast day keys');
eq(f[0].t, new Date(2026, 10, 18).getTime(), 'forecast t is start of day');
eq(Object.keys(f[0]).sort(), ['day', 'items', 'mins', 'n', 't'], 'entry shape');
const legacy = T2.mine().cards.map(m => 'mine/' + m.id).map(id => T2.srs.get(id)).filter(x => x?.legacy);
eq(legacy.length, 2, 'two legacy cards');
const due0 = T2.srs.dueCards();
eq(f[0].n, due0.length, 'day 0 count equals dueCards');
const total = f.reduce((a, e) => a + e.n, 0);
// all live cards fall inside the 7 days (legacy dates are within 14 days of 1 Nov = before 15 Nov: overdue today)
eq(total, 5, 'total = overdue pz + 2 legacy + 2 in two days');
eq(f[0].items.map(i => [i.label, i.n]), [['Your mistakes', 2], ['Missed puzzles', 1]], 'day 0 items (n desc)');
eq(f[2].items.map(i => i.label).sort(), ['Endgames', 'Missed puzzles'], 'course title label');
eq(f[0].mins, Math.max(1, Math.round(3 * 25 / 60)), 'mins'); eq(f[1].n, 0, 'empty day n'); eq(f[1].mins, 0, 'empty day mins 0'); eq(f[1].items, [], 'empty day items');
// legacy cards still due (the real dueCards path)
ok(due0.some(x => x.id.startsWith('mine/')), 'legacy cards are due');
// big day: capped minutes
reset(); for (let i = 0; i < 30; i++) put('pz/p' + (i % 2 ? 1 : 2) + '', { lv: 2, due: now() - 1 }); // same ids overwrite: 2 cards only
eq(T2.forecast(1)[0].n, 2, 'dedupe by id');
// lesson info: weakest box + next date
reset(); put('ls/endgames.k1', { lv: 3, due: now() + 5 * DAY }); put('ls/endgames.k2', { lv: 5, due: now() + 2 * DAY });
progress.t2l = { 'endgames/l1': { st: 2 } };
const li = T2.srs.lessonInfo(T2.courses()[0], T2.courses()[0].lessons.l1);
eq([li.low, Math.abs(li.next - (now() + 2 * DAY)) < 5000], [3, true], 'lesson lowest box and next review');
// nextReview
const nr = T2.nextReview(); eq([nr.n, nr.t], [1, new Date(2026, 10, 20).getTime()], 'nextReview (day 20 has 1 card)');
reset(); eq(T2.nextReview(), null, 'nextReview none');

// ---- UI strings: course lesson list, backlog notice
reset(); put('ls/endgames.k1', { lv: 3, due: now() + 5 * DAY }); put('ls/endgames.k2', { lv: 5, due: now() + 2 * DAY }); progress.t2l = { 'endgames/l1': { st: 2 } };
T2.show('course', 'endgames');
const lh = seen.html;
ok(/Back (Fri|Sat|Sun|Mon|Tue|Wed|Thu) \d+ \w{3}/.test(lh), 'lesson list shows next date'); ok((lh.match(/<i class="on">/g) || []).length === 3 && lh.includes('Lowest box 3 of 7'), 'lesson list shows 3 of 7 dots');
put('ls/endgames.k1', { lv: 3, due: now() - 1 }); T2.refresh(); T2.show('course', 'endgames'); ok(seen.html.includes('Due today'), 'lesson list: Due today');
put('ls/endgames.k1', { lv: 3, due: now() + DAY - 1000 }); put('ls/endgames.k2', { lv: 3, due: now() + DAY - 1000 }); T2.show('course', 'endgames'); ok(seen.html.includes('Back tomorrow'), 'lesson list: Back tomorrow');
// backlog guard: 41 due cards and a lesson not started -> notice, no lesson
reset(); delete progress.t2l; for (let i = 0; i < 41; i++) put('ls/endgames.b' + i, { lv: 2, due: now() - 1 });
progress.t2c = {}; data.train.courses[0].cards = {}; // (cards of the course itself are not needed: use many puzzle-like legacy ids instead)
data.train.courses[0].cards = {}; for (let i = 0; i < 41; i++) data.train.courses[0].cards['b' + i] = { fen: START, sol: ['e2e4'] };
T2.courses()[0].cards = data.train.courses[0].cards; T2.courses()[0].lessonOf.clear(); for (let i = 0; i < 41; i++) { put('ls/endgames.b' + i, { lv: 2, due: now() - 1 }); T2.courses()[0].lessonOf.set('b' + i, T2.courses()[0].lessons.l1); }
T2.refresh(); eq(T2.srs.dueCards().length, 41, '41 due');
seen.inserted = null; T2.test.gate(T2.courses()[0], T2.courses()[0].lessons.l1, true);
ok(seen.inserted && seen.inserted.includes("You have 41 reviews waiting. Clear them first so they don't pile up.") && seen.inserted.includes('Review now') && seen.inserted.includes('Learn anyway'), 'backlog notice shown');
progress.t2l = { 'endgames/l1': { st: 1 } }; seen.inserted = null; T2.test.gate(T2.courses()[0], T2.courses()[0].lessons.l1, true);
ok(!seen.inserted, 'a started lesson is not blocked (it starts instead)');

console.log(`srs_check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
