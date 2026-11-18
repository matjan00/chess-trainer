/* ============================================================================================
   T2 core: the new Train tab (home, course page, lesson player, card trainer, SRS, puzzle stream, daily session)
   Spec: train2/BLUEPRINT.md sections 5 and 7. Plain script, no imports; everything lives inside the T2 object,
   so it can be pasted into the app's module script (placeholder T2_JS) next to O2 without name clashes.
   Built in the style of openings2/ui/o2core.js (same hooks, same SRS ladder, same look).

   INTEGRATION (for T9)
   1. Markup: inline ui/t2.html inside the Train view (placeholder T2_HTML); CSS: ui/t2.css (placeholder T2_CSS).
   2. Data: fetch train2.json, puzzles2.json, mine2.json (each may be missing: pass null and that block hides).
      Add T2.KINDS (t2c t2l t2x t2k t2p t2d) to the app's KINDS. Old kinds (puz, solved, pun, chk, eg, tr, trh) are
      read, never rewritten (except tr/trh, which continue as today).
   3. Call once, after progress/sync are set up:
        T2.init({
          root: document.getElementById('t2'),        // the element from t2.html
          data: { train: TRAIN2, puzzles: PUZZLES2, mine: MINE2 },
          hooks: {
            Chessground, record, progress,              // required (as for O2)
            store, sfx, confetti,                       // optional, as for O2 (store = {get,set} with the 'ct.' prefix)
            games: GAMES,                               // analysis.json games (optional)
            engine,                                     // engine.go(fen,{movetime}) -> {best, score} (optional: "Show why")
            myRating: MY_RATING,                        // chess.com rapid rating: puzzle-rating start value (optional)
            openGame: url => {},                        // open one of his games (optional; else the url opens in a new tab)
            analyse: (fen, gameUrl) => {},             // open the explore board (optional, "More" menu)
            onChange: () => {},                         // called after T2 records progress (refresh Today; optional)
          }
        });
   4. Entry points: T2.show('home'|'course'|'stats'|'themes', arg) when the tab opens; T2.startDaily() for Today;
      T2.todayTasks() -> [{nm, ct, done, go}] (Reviews · 10 new puzzles · 5 Think-first · Lesson or play-out of the day);
      T2.dueSummary() -> {n, mins}; T2.refresh() after sync merged new progress; T2.GLOSSARY rows [id, title, text]
      to append to the app's GLOSSARY (comments link words with <button class="gl" data-term=id>).
      Old hashes #tactics #middle #endgame #drills: open Train with T2.show('home').
   5. Extension points for T7 (t2play.js, t2stats.js):
        T2.setPlayout(async (play, ctx) => ({ok, aborted}))  runs a play-out in the player (ctx: {lesson, course, ui, back});
                                                         T2 then schedules t2x and counts it (do not record t2x yourself).
        T2.setScreen('stats' | 'themes', el => {})          renders those screens (core has simple fallbacks).
        T2.addSection({id, label, render(course, el)})      adds a course-page tab.  T2.addHomeBlock(el => {})  fills #t2-home-extra.
        T2.ui: begin, head, fb, actions, cont, toast, board(fen, side, onMove), rich, esc (the player, for play-outs).
        Read access: T2.srs (get, answer, isDue, playResult, judgeResult, cardInfo ...), T2.puzzles(), T2.mine(), T2.courses(),
        T2.groups(), T2.groupAccuracy(), T2.rating(), T2.startStream({group}), T2.posKey, T2.now.
   6. Spaced reviews (Today tab): T2.forecast(days = 7) -> [{day:'YYYY-MM-DD', t:<start of day ms>, n, mins, items:[{label, n}]}], index 0 = today
      (overdue and old own-game cards included, same as dueCards; only cards the trainer can serve). mins = round(min(n, 20) * 25 / 60), 1 at least when n > 0.
      items are grouped by source ("Missed puzzles", "Your mistakes", or the course title), biggest first. T2.srs.BACKLOG (40): with more reviews due
      than that, starting a NEW lesson first shows "Review now / Learn anyway". T2.intervalText(days): 1 -> "1 day", 7 -> "1 week", 180 -> "6 months".
      T2.srs.last() = the schedule of the latest answer {what, lv, from, due, days, result}; T2.nextReview() -> {t, n, mins} | null.
   Clock: T2.now() honours ?t2now=<ms> or localStorage ct.t2now (time travel for tests; it keeps ticking from it).
   ============================================================================================ */
const T2 = (() => {
  'use strict';
  const DAY = 86400000;
  const KINDS = ['t2c', 't2l', 't2x', 't2k', 't2p', 't2d'];
  const IV = (typeof O2 !== 'undefined' && O2?.srs?.IV) || [0, 1, 3, 7, 14, 30, 90, 180];   // the Openings ladder (shared)
  const MAXLV = 7, MATURE = 4, RETIRED = 9, CAP = 20, BACKLOG = 40;
  const DAILY = { puz: 10, think: 5, newMine: 3 };
  const COURSE_ORDER = ['tactics', 'think', 'convert', 'endgames'];
  const COURSE_INFO = {
    tactics: { title: 'Tactics ABC', sub: '15 motifs: learn, practise, review', w: 3 },
    think: { title: 'Think first', sub: 'Safe or blunder? Punish it or not? What is the threat?', w: 2 },
    convert: { title: 'Win the won game', sub: 'Turn winning positions into wins', w: 3 },
    endgames: { title: 'Essential endgames', sub: 'The endings every player must know', w: 2 },
  };
  const H = {
    Chessground: null, record: null, progress: null,
    store: { get(k, d) { try { const v = localStorage.getItem('ct.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch {} } },
    sfx: { on: false, play() {} }, confetti() {}, games: null, engine: null, myRating: 1400, openGame: null, analyse: null, onChange: null,
  };
  let ROOT = null, DRAFT = false;
  let COURSES = [];                    // train2.json courses, prepared
  let PUZ = null;                      // {groups, rows:[{id,fen,moves,rating,g:[idx],why,alt}], byId}
  let MINE = null;                     // {cards, judges, plays, stats, cardById, judgeById, playById}
  const EXT = { playout: null, screens: {} };
  const sections = [], homeBlocks = [];

  /* ---------------------------------------------------------------- small helpers */
  const $ = (s, r = ROOT) => r.querySelector(s);
  const $$ = (s, r = ROOT) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const plural = (n, w, pl = w + 's') => `${n} ${n === 1 ? w : pl}`;
  const pct = x => `${Math.round(x * 100)}%`;
  const posKey = fen => fen.split(' ').slice(0, 3).join(' ') + ' -';
  const BRUSH = { g: 'green', r: 'red', b: 'blue', y: 'yellow' };
  const parseShape = s => { const m = /^(?:([rgby]):)?([a-h][1-8])(?:-([a-h][1-8]))?$/.exec(s || ''); return m ? (m[3] ? { orig: m[2], dest: m[3], brush: BRUSH[m[1] || 'g'] } : { orig: m[2], brush: BRUSH[m[1] || 'g'] }) : null; };
  const shapes = arr => (arr || []).map(x => typeof x === 'string' ? parseShape(x) : x).filter(Boolean);
  const toDests = chess => { const d = new Map(); for (const m of chess.moves({ verbose: true })) { if (!d.has(m.from)) d.set(m.from, []); d.get(m.from).push(m.to); } return d; };
  const uciMove = (chess, u) => u ? chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }) : null;
  const mvUci = mv => mv.from + mv.to + (mv.promotion || '');
  const sameMove = (a, b) => !!a && !!b && a.slice(0, 4) === b.slice(0, 4) && (a[4] || 'q') === (b[4] || 'q');
  const sanOf = (fen, u) => { try { const m = uciMove(new Chess(fen), u); return m ? m.san : u; } catch { return u; } };
  const sideOf = fen => fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const other = s => s === 'white' ? 'black' : 'white';
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  /** "13...Kd7 14. O-O-O Bxf1" or ["1...Nd2", "2.Qxd2"] -> ['Kd7', 'O-O-O', 'Bxf1'] */
  const sanList = x => (Array.isArray(x) ? x.join(' ') : String(x || '')).split(/\s+/).map(t => t.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, '')).filter(t => t && !/^\d+\.*$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = rnd() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const dateText = unix => unix ? new Date(unix * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  /* ---------------------------------------------------------------- clock (time travel: ?t2now=<ms> or ct.t2now) */
  let ovRaw = null, ovT0 = 0;
  function now() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('t2now'); } catch {}
    if (v == null) { try { v = localStorage.getItem('ct.t2now'); } catch {} }
    if (v == null || v === '' || v === 'null' || isNaN(+v)) { ovRaw = null; return Date.now(); }
    if (v !== ovRaw) { ovRaw = v; ovT0 = Date.now(); }
    return +v + (Date.now() - ovT0);
  }
  const startOfDay = (t = now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const endOfDay = (t = now()) => { const d = new Date(t); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const dayKey = (t = now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const keyTime = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  function whenText(t) {
    const e = endOfDay();
    if (t <= e) return 'today';
    if (t <= e + DAY) return 'tomorrow';
    const d = Math.ceil((t - e) / DAY);
    if (d < 7) return `in ${d} days`;
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  /* ---------------------------------------------------------------- glossary (BLUEPRINT X2 jargon) */
  const GLOSSARY = [
    ['zugzwang', 'Zugzwang', 'Having to move when every move makes your position worse. Passing would be best, but in chess you must move.', /\bzugzwang\b/i],
    ['opposition', 'Opposition', 'The kings stand on the same line with one square between them. The side that does NOT have to move "has the opposition" and the other king must give way.', /\bopposition\b/i],
    ['tempo', 'Tempo', 'One move of time. Gaining a tempo means making a useful move while your opponent has to react.', /\btempo(?:s|i)?\b/i],
    ['zwischenzug', 'In-between move', 'Instead of the expected move (often a recapture), you first play a stronger move, usually a check or a threat. Also called zwischenzug or intermezzo.', /\b(?:zwischenzug|intermezzo|in-between move)\b/i],
    ['deflection', 'Deflection', 'Forcing an enemy piece away from a square or a piece it has to guard.', /\bdeflect(?:ion|s|ed)?\b/i],
    ['decoy', 'Decoy', 'Luring an enemy piece (often the king) onto a bad square, usually with a sacrifice.', /\bdecoy(?:s|ed)?\b/i],
    ['battery', 'Battery', 'Two pieces lined up on the same line, like a queen behind a bishop, so they attack together.', /\bbatter(?:y|ies)\b/i],
    ['outflank', 'Outflanking', 'Walking your king round the side of the enemy king to reach the squares in front of your pawn.', /\boutflank(?:s|ing|ed)?\b/i],
    ['keysquares', 'Key squares', 'Squares in front of a pawn: if your king reaches one, the pawn promotes whatever the defender does.', /\bkey squares?\b/i],
    ['cutoff', 'Cut-off', 'Using a rook along a rank or file to stop the enemy king from crossing it.', /\bcut(?:-| )off\b/i],
    ['prophylaxis', 'Prophylaxis', 'A move that stops your opponent\'s plan before it starts.', /\bprophyla(?:xis|ctic)\b/i],
    ['desperado', 'Desperado', 'A piece that is lost anyway takes as much as it can before it goes.', /\bdesperado\b/i],
    ['overloaded', 'Overloaded piece', 'A piece with two jobs at once: when it does one, it drops the other.', /\boverload(?:ed|ing)?\b/i],
    ['xray', 'X-ray', 'A piece attacks or defends through another piece standing in its way.', /\bx-ray\b/i],
    ['luft', 'Luft', 'A pawn move in front of the castled king that gives it an escape square, so there is no back-rank mate.', /\bluft\b/i],
    ['fianchetto', 'Fianchetto', 'Developing a bishop on the long diagonal from g2/b2 (or g7/b7) after moving the knight\'s pawn one square.', /\bfianchetto(?:ed)?\b/i],
    ['exchange', 'The exchange', 'Winning the exchange means winning a rook for a bishop or knight.', /\bthe exchange\b/i],
    ['fork', 'Fork', 'One piece attacks two enemy pieces at the same time, so your opponent can save only one of them.', /\bforks?\b/i],
    ['pin', 'Pin', 'A piece cannot move without exposing a more valuable piece (or the king) behind it.', /\bpin(?:s|ned)?\b/i],
    ['skewer', 'Skewer', 'Like a pin the other way round: a valuable piece is attacked, moves away, and the piece behind it is lost.', /\bskewers?\b/i],
  ];
  const GL_IDS = new Map(GLOSSARY.map(g => [g[0], g[0]]));
  const glId = term => { const t = String(term).toLowerCase().replace(/[^a-z]/g, ''); return GL_IDS.get(t) || GLOSSARY.find(g => g[3].test(term))?.[0] || t; };
  /** lesson text -> HTML: {gl:term} glossary buttons, ((moves)) variations, [g:e2-e4] shapes removed, first use of a glossary word linked */
  function rich(text) {
    let s = esc(String(text || '').replace(/\s*\[[rgby]:[a-h][1-8](?:-[a-h][1-8])?\]/g, ''));
    const used = new Set();
    s = s.replace(/\{gl:([^}]+)\}/g, (_, t) => { const id = glId(t); used.add(id); return `<button class="gl" data-term="${esc(id)}">${esc(t)}</button>`; });
    for (const [id, , , re] of GLOSSARY) {
      if (used.has(id)) continue;
      s = s.replace(new RegExp(`(<button[^>]*>[^<]*</button>)|${re.source}`, re.flags), (m, btn) => { if (btn || used.has(id)) return m; used.add(id); return `<button class="gl" data-term="${id}">${m}</button>`; });
    }
    return s.replace(/\(\((.+?)\)\)/g, (_, v) => `<span class="t2-var">${v}</span>`);
  }

  /* ---------------------------------------------------------------- data preparation */
  function prepCourse(c) {
    c.cards ||= {}; c.judges ||= {}; c.plays ||= {}; c.lessons ||= {}; c.chapters ||= [];
    c.order = c.chapters.flatMap(ch => ch.lessons || []).filter(id => c.lessons[id]);
    c.lessonOf = new Map();               // card/judge/play id -> lesson
    for (const id of c.order) {
      const l = c.lessons[id];
      l.cid = c.id;
      l.cards = []; l.judges = []; l.plays = []; l.sets = []; l.mines = []; l.exs = [];
      for (const s of l.steps || []) {
        if (s.t === 'card' && c.cards[s.id]) { l.cards.push(s.id); c.lessonOf.set(s.id, l); }
        if (s.t === 'judge' && c.judges[s.id]) { l.judges.push(s.id); c.lessonOf.set(s.id, l); }
        if (s.t === 'play' && c.plays[s.id]) { l.plays.push(s.id); c.lessonOf.set(s.id, l); }
        if (s.t === 'set') l.sets.push(s);
        if (s.t === 'mine') l.mines.push(s);
        if (s.t === 'ex') l.exs.push(s);
      }
    }
    c.chOf = new Map(); c.chapters.forEach(ch => (ch.lessons || []).forEach(id => c.chOf.set(id, ch)));
    const info = COURSE_INFO[c.id] || {};
    c.w = info.w || 2;
    return c;
  }
  function prepPuzzles(d) {
    if (!d || !Array.isArray(d.rows)) return null;
    const rows = d.rows.map(r => ({ id: String(r[0]), fen: r[1], moves: String(r[2]).split(' '), rating: +r[3] || 1500, g: r[4] || [], why: r[5] || '', alt: r[6] ? String(r[6]).split(' ') : [] }));
    const byId = new Map(rows.map(p => [p.id, p]));
    const byGroup = (d.groups || []).map(() => []);
    rows.forEach(p => p.g.forEach(gi => byGroup[gi]?.push(p)));
    return { groups: d.groups || [], rows, byId, byGroup, sample: !!d.sample };
  }
  function prepMine(d) {
    if (!d) return null;
    const m = { cards: d.cards || [], judges: d.judges || [], plays: d.plays || [], stats: d.stats || null };
    // lead review (T8): an own-game position that a lesson already uses as a card or example is not asked twice (R2)
    const pk = fen => String(fen || '').split(' ').slice(0, 3).join(' '), used = new Set();
    for (const c of COURSES) { for (const k of Object.values(c.cards || {})) used.add(pk(k.fen)); for (const l of Object.values(c.lessons || {})) for (const s of l.steps || []) if (s.t === 'ex') used.add(pk(s.fen)); }
    m.cards = m.cards.filter(c => !used.has(pk(c.fen)));
    m.cards.sort((a, b) => (b.end || 0) - (a.end || 0));
    m.cardById = new Map(m.cards.map(c => [c.id, c]));
    m.judgeById = new Map(m.judges.map(j => [j.id, j]));
    m.playById = new Map(m.plays.map(p => [p.id, p]));
    return m;
  }

  /* ---------------------------------------------------------------- progress helpers */
  const PG = k => H.progress[k] || (H.progress[k] = {});
  function put(kind, id, v) { const { t, ...rest } = v; H.record(kind, id, rest); }
  function dayAdd(d) {
    const k = dayKey(), cur = PG('t2d')[k] || {};
    const { t, ...old } = cur;
    const v = { rev: 0, new: 0, wrong: 0, think: 0, thinkOk: 0, less: 0, play: 0, ms: 0, fw: 0, ...old };
    for (const [x, n] of Object.entries(d)) v[x] = (v[x] || 0) + n;
    put('t2d', k, v);
  }
  const today = () => PG('t2d')[dayKey()] || {};
  let lastAct = Date.now();
  const spent = () => { const t = Date.now(), d = Math.min(120000, t - lastAct); lastAct = t; return d; };
  const changed = () => { try { H.onChange?.(); } catch (e) { console.warn(e); } };
  const play = k => { try { H.sfx?.play?.(k); } catch {} };

  /* ---------------------------------------------------------------- SRS (BLUEPRINT 5) */
  // card ids: pz/<lichessId> · ls/<courseId>.<cardId> · mine/<type>/<gid>-<ply>
  const srcOf = id => id.startsWith('pz/') ? 'pz' : id.startsWith('ls/') ? 'ls' : id.startsWith('mine/') ? 'mine' : '?';
  /** first T2 day: the earliest t2d key (else today). Old solved/pun items are first due on anchor + hash(id) mod 14 days. */
  function anchor() { const ks = Object.keys(PG('t2d')).sort(); return ks.length ? keyTime(ks[0]) : startOfDay(); }
  function legacyState(id) {
    if (!id.startsWith('mine/')) return null;
    const [, type, gp] = id.split('/');
    const old = type === 'fix' ? H.progress.solved?.[gp] : type === 'pun' && H.progress.pun?.[gp]?.ok ? H.progress.pun[gp] : null;
    if (!old) return null;
    return { lv: 2, due: anchor() + (hash(id) % 14) * DAY, n: 1, w: 0, s: 1, legacy: true };
  }
  const cardGet = id => PG('t2c')[id] || legacyState(id) || null;
  const isDue = s => !!s && (s.lv || 0) < RETIRED && s.due <= endOfDay();
  const isMature = s => !!s && (s.lv || 0) >= MATURE;
  const isDifficult = s => !!s && ((s.w || 0) >= 2 || ((s.n || 0) >= 3 && (s.w || 0) / s.n >= 0.34));
  const DATE_FMT = { day: 'numeric', month: 'short' };
  const dateShort = (t, wd = false) => { const d = new Date(t); return (wd ? d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' : '') + d.toLocaleDateString('en-GB', DATE_FMT); };
  /** 1 -> "1 day", 7 -> "1 week", 30 -> "1 month", 180 -> "6 months", else "N days" */
  function intervalText(days) {
    const n = Math.round(days);
    if (n === 7) return '1 week'; if (n === 14) return '2 weeks';
    if (n === 30) return '1 month'; if (n === 90) return '3 months'; if (n === 180) return '6 months';
    return plural(n, 'day');
  }
  /* spreading the load: an interval of 7+ days is moved a little (about +-10%, at least +-1 day) to the lightest day.
     loadMap: day key -> number of t2c cards due that day; built lazily, kept up to date by srsAnswer, dropped on refresh/init */
  let loadMap = null;
  function loads() {
    if (loadMap) return loadMap;
    loadMap = new Map();
    for (const s of Object.values(PG('t2c'))) if ((s.lv || 0) < RETIRED && s.due) { const k = dayKey(s.due); loadMap.set(k, (loadMap.get(k) || 0) + 1); }
    return loadMap;
  }
  const loadAdd = (due, d) => { if (!due) return; const m = loads(), k = dayKey(due); m.set(k, Math.max(0, (m.get(k) || 0) + d)); };
  /** how many days from now: the nominal interval, or for 7+ days the least loaded day of the window (ties: closest to the target, then earlier) */
  function pickDays(iv, t) {
    if (iv < 7) return iv;
    const lo = Math.min(Math.round(iv * 0.9), iv - 1), hi = Math.max(Math.round(iv * 1.1), iv + 1), m = loads();
    let best = iv, bn = Infinity;
    for (let d = lo; d <= hi; d++) {
      const n = m.get(dayKey(t + d * DAY)) || 0;
      if (n < bn || (n === bn && Math.abs(d - iv) < Math.abs(best - iv))) { best = d; bn = n; }
    }
    return best;
  }
  let lastSched = null;
  /** the full answer: {what, lv, from (box before), due, days (nominal interval, 0 when retired/seen), result}; srsAnswer returns just `what` (the last one is also in T2.srs.last()) */
  function srsAnswerFull(id, result, { fast = false, noRev = false } = {}) {
    const t = now(), src = srcOf(id), prev = cardGet(id), fresh = !prev;
    let { lv = 0, n = 0, w = 0, s = 0, due } = prev || {};
    const from = lv;
    n++;
    let what, iv = 1;
    if (result === 'wrong') { lv = fresh || lv >= RETIRED ? 1 : Math.max(1, lv - 2); w++; s = 0; iv = 1; what = fresh ? 'new-card' : 'reset'; }   // softer: two boxes down, still back tomorrow
    else if (fresh) {
      if (src === 'pz' && result === 'ok') { addSeen(id.slice(3)); dayAdd({ ms: spent() }); return (lastSched = { what: 'seen', lv: 0, from: 0, due: 0, days: 0, result }); }   // clean solve: never scheduled
      lv = src === 'mine' && result === 'ok' ? 2 : 1; s = result === 'ok' ? 1 : 0; iv = IV[lv]; what = 'new-card';
    } else if (result === 'ok') {
      const retireAt = src === 'pz' ? 4 : src === 'mine' ? 5 : 99;
      s++;
      if (lv >= retireAt) { lv = RETIRED; iv = 0; what = 'retired'; }
      else { lv = Math.min(MAXLV, Math.max(1, lv + 1)); iv = IV[lv]; what = 'up'; }
    } else { lv = Math.max(1, lv); s++; iv = IV[lv]; what = 'stay'; }
    const days = iv ? pickDays(iv, t) : 0;
    due = iv ? t + days * DAY : 0;
    if (prev && (prev.lv || 0) < RETIRED && prev.due) loadAdd(prev.due, -1);
    if (iv) loadAdd(due, 1);
    put('t2c', id, { lv, due, n, w, s });
    if (src === 'pz') addSeen(id.slice(3));
    dayAdd({ rev: noRev || (fresh && src === 'pz') ? 0 : 1, nm: fresh && src === 'mine' && !noRev ? 1 : 0, wrong: result === 'wrong' ? 1 : 0, fw: fast ? 1 : 0, ms: spent() });
    return (lastSched = { what, lv, from, due, days: iv, result });
  }
  /** result: 'ok' (first try) | 'hint' (right with the hint) | 'wrong' (wrong move or "Show me"). Returns what happened. */
  const srsAnswer = (id, result, o) => srsAnswerFull(id, result, o).what;
  /** the small timing line under an answer ("✓ Box 4 · back in 2 weeks (2 Dec)"); '' for a clean new puzzle */
  function schedNote(sc) {
    if (!sc || sc.what === 'seen') return '';
    if (sc.what === 'retired') return "✓ Learned for good, it won't come back";
    if (sc.result === 'wrong') return `✗ Back tomorrow · box ${sc.lv}`;
    const back = `back in ${intervalText(sc.days)} (${dateShort(sc.due)})`;
    return sc.result === 'hint' ? `Box ${sc.lv} · stays · ${back}` : `✓ Box ${sc.lv} · ${back}`;
  }
  /** lesson cards enter at L1 when the practise step is finished (wrong answers in practice are remembered in w) */
  function srsLearn(ids, wrongIds = new Set()) {
    const t = now();
    for (const id of ids) if (!PG('t2c')[id]) put('t2c', id, { lv: 1, due: t + IV[1] * DAY, n: 1, w: wrongIds.has(id) ? 1 : 0, s: wrongIds.has(id) ? 0 : 1 });
  }
  /** judgements (t2k): wrong -> again once after 3 days */
  function judgeResult(id, ok) {
    const prev = PG('t2k')[id], t = now();
    const again = prev && prev.due;                         // this was the planned re-test
    put('t2k', id, { ok: ok ? 1 : 0, n: (prev?.n || 0) + 1, due: !ok && !again ? t + 3 * DAY : 0 });
    dayAdd({ think: 1, thinkOk: ok ? 1 : 0, ms: spent() });
  }
  const judgeDue = id => { const k = PG('t2k')[id]; return !!k && !!k.due && k.due <= endOfDay(); };
  const judgeSeen = id => !!PG('t2k')[id] || (id.startsWith('chk/') && !!H.progress.chk?.[id.slice(4)]);
  /** play-outs (t2x): fail -> 3 d; pass -> 7 d -> 30 d -> 90 d -> done. Play-outs from his games are one-off. */
  const PLAY_STEPS = [7, 30, 90];
  function playResult(id, ok, { lesson = true } = {}) {
    const prev = PG('t2x')[id] || { ok: 0, n: 0, fails: 0, step: 0 }, t = now();
    let { n = 0, fails = 0, step = 0 } = prev, due;
    n++;
    if (!ok) { fails++; due = t + 3 * DAY; }
    else if (!lesson) { step = PLAY_STEPS.length; due = 0; }
    else { due = step < PLAY_STEPS.length ? t + PLAY_STEPS[step] * DAY : 0; step++; }
    put('t2x', id, { ok: ok || prev.ok ? 1 : 0, n, fails, due, step });
    dayAdd({ play: 1, ms: spent() });
    changed();
  }
  const playDue = id => { const x = PG('t2x')[id]; return !!x && !!x.due && x.due <= endOfDay(); };

  /* ---------------------------------------------------------------- seen set (R3): t2p days ∪ old puz ∪ ct.puzseen */
  let seenCache = null, seenOrder = null;
  function seenSet() {
    if (seenCache) return seenCache;
    const s = new Set(), order = [];
    for (const k of Object.keys(PG('t2p')).sort()) for (const id of String(PG('t2p')[k].ids || '').split(' ').filter(Boolean)) { if (!s.has(id)) { s.add(id); order.push(id); } }
    const old = Object.entries(H.progress.puz || {}).map(([id, v]) => [id, v.t || 0]);
    const ps = H.store.get('puzseen', {}) || {};
    for (const [id, t] of Object.entries(ps)) old.push([id, t || 0]);
    old.sort((a, b) => a[1] - b[1]).forEach(([id]) => { if (!s.has(id)) { s.add(id); order.unshift(id); } });
    seenCache = s; seenOrder = order;
    return s;
  }
  function addSeen(pid) {
    const k = dayKey(), cur = String(PG('t2p')[k]?.ids || '').split(' ').filter(Boolean);
    if (!cur.includes(pid)) put('t2p', k, { ids: [...cur, pid].join(' ') });
    if (seenCache && !seenCache.has(pid)) { seenCache.add(pid); seenOrder.push(pid); }
  }

  /* ---------------------------------------------------------------- puzzle rating (ported from the app's ratePuzzle) */
  const rating = () => Math.round(H.progress.tr?.me?.r ?? H.myRating ?? 1400);
  function ratePuzzle(prating, ok) {
    const cur = H.progress.tr?.me || { r: H.myRating || 1400, n: 0 };
    const exp = 1 / (1 + Math.pow(10, (prating - cur.r) / 400));
    const k = cur.n < 30 ? 32 : 20;
    const r = cur.r + k * ((ok ? 1 : 0) - exp);
    H.record('tr', 'me', { r, n: cur.n + 1 });
    H.record('trh', dayKey(), { r: Math.round(r) });
    return r - cur.r;
  }

  /* ---------------------------------------------------------------- puzzle stream (R3) */
  function groupIndex(id) { return PUZ ? PUZ.groups.findIndex(g => g.id === id) : -1; }
  /** accuracy per theme group: clean solves (seen set) vs missed puzzles (pz/ cards) */
  function groupAccuracy() {
    if (!PUZ) return [];
    const acc = PUZ.groups.map(() => ({ ok: 0, n: 0 }));
    for (const id of seenSet()) { const p = PUZ.byId.get(id); if (p && !PG('t2c')['pz/' + id]) p.g.forEach(g => { acc[g].ok++; acc[g].n++; }); }
    for (const id of Object.keys(PG('t2c'))) if (id.startsWith('pz/')) { const p = PUZ.byId.get(id.slice(3)); if (p) p.g.forEach(g => acc[g].n++); }
    return acc;
  }
  function groupWeights() {
    if (!PUZ) return [];
    const st = MINE?.stats?.tags || {}, share = PUZ.groups.map(() => 0);
    let tot = 0;
    for (const v of Object.values(st)) { const n = (v.last30 || 0) + (v.prev30 || 0); tot += n; const gi = groupIndex(v.group); if (gi >= 0) share[gi] += n; }
    const acc = groupAccuracy();
    const tac = COURSES.find(c => c.id === 'tactics');
    return PUZ.groups.map((g, i) => {
      let w = 1 + 2 * (tot ? share[i] / tot : 0) + (acc[i].n >= 10 ? 1.5 * (1 - acc[i].ok / acc[i].n) : 0);
      if (tac) { const chs = tac.chapters.filter(ch => ch.theme === g.id); if (chs.length && !chs.some(ch => (ch.lessons || []).some(l => PG('t2l')[`tactics/${l}`]?.st >= 1))) w *= 0.5; }
      return w;
    });
  }
  /** puzzles reserved by practice sets that are not finished yet */
  function reservedSet() {
    const r = new Set();
    // lead review (T8): a pool puzzle used as a lesson card or example is never served by the stream (R2/R3)
    for (const c of COURSES) {
      for (const k of Object.values(c.cards || {})) if (String(k.src || '').startsWith('lichess:')) r.add(String(k.src).slice(8));
      for (const l of Object.values(c.lessons || {})) for (const s of l.steps || []) if (s.t === 'ex' && String(s.src || '').startsWith('lichess:')) r.add(String(s.src).slice(8));
    }
    for (const c of COURSES) for (const id of c.order) { const l = c.lessons[id]; if ((PG('t2l')[`${c.id}/${id}`]?.st || 0) >= 2) continue; for (const s of l.sets) (s.ids || []).forEach(x => r.add(String(x))); }
    return r;
  }
  /** pick one puzzle. env: {served:Set (this session), seen(id), card(id), reserved:Set, rating, weights, group (index|null), last (group idx), rnd}
      -> {p, gi, repeat} | null. Never repeats while an unseen puzzle exists in the wanted group(s); the window widens ±150 → ±300 → any. */
  function pickPuzzle(env) {
    const rnd = env.rnd || Math.random, target = env.rating - 50;
    const fresh = p => !env.served.has(p.id) && !env.seen(p.id) && !env.card(p.id) && !env.reserved.has(p.id);
    const groups = env.group != null ? [env.group] : PUZ.groups.map((_, i) => i);
    const open = groups.filter(gi => PUZ.byGroup[gi].some(fresh));
    if (open.length) {
      let gi = open[0];
      if (open.length > 1) {
        const list = open.filter(g => g !== env.last).length ? open.filter(g => g !== env.last) : open;
        const tot = list.reduce((s, g) => s + (env.weights[g] || 1), 0); let x = rnd() * tot;
        gi = list.find(g => (x -= (env.weights[g] || 1)) < 0) ?? list[list.length - 1];
      }
      const pool = PUZ.byGroup[gi].filter(fresh);
      for (const w of [150, 300, Infinity]) {
        const near = pool.filter(p => Math.abs(p.rating - target) <= w);
        if (near.length) return { p: near[rnd() * near.length | 0], gi, repeat: false };
      }
    }
    // truly exhausted: the oldest clean solve comes back (not one served in this session, not a scheduled card)
    const inGroups = p => p.g.some(g => groups.includes(g));
    const order = env.order ? env.order() : [];
    for (const id of order) { const p = PUZ.byId.get(id); if (p && inGroups(p) && !env.served.has(id) && !env.card(id) && !env.reserved.has(id)) return { p, gi: p.g.find(g => groups.includes(g)), repeat: true }; }
    return null;
  }
  function liveEnv(group = null) {
    const seen = seenSet();
    return { served: new Set(), seen: id => seen.has(id), card: id => !!PG('t2c')['pz/' + id], reserved: reservedSet(), rating: rating(),
             weights: groupWeights(), group, last: null,
             order: () => { seenSet(); const r = H.store.get('t2reuse', {}) || {}; return seenOrder.map((id, i) => [id, r[id] ? 1e13 + r[id] : i]).sort((a, b) => a[1] - b[1]).map(x => x[0]); },
             reused: id => { const r = H.store.get('t2reuse', {}) || {}; r[id] = now(); H.store.set('t2reuse', r); } };
  }
  /** R5: simulate n served puzzles with random results on a scratch copy; counts unplanned repeats (must be 0) */
  function simulate(n = 3000, { group = null, seed = 1 } = {}) {
    if (!PUZ) return { error: 'no puzzle data' };
    let x = seed; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const seen = new Set(), order = [], cards = new Set(), everServed = new Set();
    const env = { served: new Set(), seen: id => seen.has(id), card: id => cards.has(id), reserved: new Set(), rating: 1300, weights: PUZ.groups.map(() => 1), group, last: null, rnd, order: () => order };
    let unplanned = 0, planned = 0, served = 0, sessionDup = 0, none = 0;
    for (let i = 0; i < n; i++) {
      if (i % 10 === 0) env.served = new Set();                     // a session = 10 puzzles
      const freshLeft = PUZ.rows.some(p => (group == null || p.g.includes(group)) && !seen.has(p.id) && !cards.has(p.id) && !env.served.has(p.id));
      const r = pickPuzzle(env);
      if (!r) { none++; continue; }
      served++;
      if (env.served.has(r.p.id)) sessionDup++;
      if (everServed.has(r.p.id)) { if (r.repeat && !freshLeft) planned++; else unplanned++; }
      if (r.repeat) { const j = order.indexOf(r.p.id); if (j >= 0) order.splice(j, 1); order.push(r.p.id); }   // a reused puzzle goes to the back
      else if (r.repeat) unplanned++;
      everServed.add(r.p.id); env.served.add(r.p.id); env.last = r.gi;
      if (rnd() < 0.75) { if (!seen.has(r.p.id)) { seen.add(r.p.id); order.push(r.p.id); } }
      else cards.add(r.p.id);                                        // missed: becomes a card, comes back as a review, never via the stream
      env.rating += (rnd() - 0.5) * 20;
    }
    return { served, unplanned, planned, sessionDup, none, pool: PUZ.rows.length };
  }

  /* ---------------------------------------------------------------- items: everything the trainer can ask */
  const courseById = id => COURSES.find(c => c.id === id) || null;
  const groupNames = gs => (gs || []).map(g => PUZ?.groups[g]?.name).filter(Boolean);
  const uniq = a => [...new Set(a.filter(Boolean))];
  const gameChip = m => m.opp ? `Your game vs ${m.opp}${m.end ? ', ' + dateText(m.end) : ''}` : 'Your game';
  let chipG = null;   // group index of the running theme stream (chip shows it instead of the puzzle's first group)
  function itemFor(id) {
    const src = srcOf(id);
    if (src === 'pz') {
      const p = PUZ?.byId.get(id.slice(3)); if (!p) return null;
      return { key: id, kind: 'card', src, fen: p.fen, setup: p.moves[0], sol: p.moves.slice(1), side: other(sideOf(p.fen)), ok: [p.moves[1]], alt: p.alt, slow: [], also: {}, wrong: {}, wrongLine: {},
               why: p.why, rating: p.rating, groups: p.g, chip: `Puzzle · ${groupNames(chipG != null && p.g.includes(chipG) ? [chipG] : p.g)[0] || 'tactics'} · rated ${p.rating}` };
    }
    if (src === 'ls') {
      const [cid, ...rest] = id.slice(3).split('.'), kid = rest.join('.');
      const c = courseById(cid), k = c?.cards[kid]; if (!k) return null;
      const l = c.lessonOf.get(kid);
      return { key: id, kind: 'card', src, fen: k.fen, side: k.side || sideOf(k.fen), last: k.last, sol: k.sol || [], ok: uniq([k.sol?.[0], ...(k.ok || []), ...Object.keys(k.also || {})]),
               slow: k.slow || [], also: k.also || {}, wrong: k.wrong || {}, wrongLine: k.wrongLine || {}, why: k.why, tag: k.tag, chip: `Lesson: ${l?.title || c.title}`, course: c, lesson: l };
    }
    if (src === 'mine') {
      const m = MINE?.cardById.get(id.slice(5)); if (!m) return null;
      return { key: id, kind: m.type === 'thr' ? 'thr' : 'card', src, type: m.type, fen: m.fen, side: m.side || sideOf(m.fen), last: m.last, sol: m.sol || [], ok: uniq([m.sol?.[0], ...(m.ok || [])]),
               slow: [], also: {}, wrong: {}, wrongLine: {}, why: m.why, played: m.played, refute: sanList(m.refute), threat: m.threat, url: m.url, opp: m.opp, end: m.end, moveNo: m.moveNo,
               chip: gameChip(m), groups: m.group != null ? [groupIndex(m.group)].filter(g => g >= 0) : [] };
    }
    return null;
  }
  function judgeItem(id) {
    if (id.startsWith('chk/')) {
      const j = MINE?.judgeById.get(id); if (!j) return null;
      return { key: id, kind: j.who === 'opp' ? 'punq' : 'judge', decoy: j.who === 'opp', who: j.who, fen: j.fen, mv: j.mv, san: j.san || sanOf(j.fen, j.mv), verdict: j.verdict,
               refute: sanList(j.refute), why: j.why, url: j.url, opp: j.opp, end: j.end, chip: gameChip(j), side: j.who === 'opp' ? other(sideOf(j.fen)) : sideOf(j.fen) };
    }
    if (id.startsWith('ls/')) {
      const [cid, ...rest] = id.slice(3).split('.'), jid = rest.join('.');
      const c = courseById(cid), j = c?.judges[jid]; if (!j) return null;
      const l = c.lessonOf.get(jid);
      const mv = /^[a-h][1-8][a-h][1-8]/.test(j.mv || '') ? j.mv : (() => { try { const m = new Chess(j.fen).move(j.mv || j.san, { sloppy: true }); return m ? mvUci(m) : null; } catch { return null; } })();
      if (!mv) return null;
      return { key: id, kind: 'judge', who: 'me', fen: j.fen, mv, san: j.san || sanOf(j.fen, mv), verdict: j.verdict, refute: sanList(j.refute), why: j.why, chip: `Lesson: ${l?.title || c.title}`, side: sideOf(j.fen) };
    }
    return null;
  }
  /** a pun card asked as "Punish it or not?" */
  const punqItem = id => { const it = itemFor(id); return it ? { ...it, kind: 'punq', decoy: false } : null; };

  /* ---------------------------------------------------------------- what is due, what is next */
  function dueCards() {
    const out = [], e = endOfDay();
    for (const [id, s] of Object.entries(PG('t2c'))) if (isDue(s) && itemFor(id)) out.push({ id, due: s.due });
    if (MINE) for (const m of MINE.cards) { const id = 'mine/' + m.id; if (PG('t2c')[id]) continue; const s = legacyState(id); if (s && s.due <= e) out.push({ id, due: s.due }); }
    const sod = startOfDay();                               // most overdue first, then shuffled across sources
    const over = out.filter(x => x.due < sod).sort((a, b) => a.due - b.due);
    const rest = shuffle(out.filter(x => x.due >= sod));
    return [...over, ...rest];
  }
  function dueJudges() { return Object.keys(PG('t2k')).filter(id => judgeDue(id) && judgeItem(id)); }
  function newMineCards(types = ['fix', 'tq'], n = DAILY.newMine) {
    if (!MINE) return [];
    return MINE.cards.filter(m => types.includes(m.type) && !cardGet('mine/' + m.id)).slice(0, n).map(m => 'mine/' + m.id);
  }
  /** own-game cards that entered the reviews today (first answer today) */
  const newMineToday = () => today().nm || 0;
  function dueSummary() { const n = dueCards().length; return { n, mins: Math.max(1, Math.round(Math.min(n, CAP) * 25 / 60)) }; }
  /** every card the trainer can serve with its due time: [id, due] (t2c not retired + old own-game cards still on their legacy date) */
  function liveCards() {
    const out = [];
    for (const [id, s] of Object.entries(PG('t2c'))) if ((s.lv || 0) < RETIRED && itemFor(id)) out.push([id, s.due]);
    if (MINE) for (const m of MINE.cards) { const id = 'mine/' + m.id; if (PG('t2c')[id]) continue; const s = legacyState(id); if (s) out.push([id, s.due]); }
    return out;
  }
  const srcLabel = id => { const src = srcOf(id); return src === 'pz' ? 'Missed puzzles' : src === 'mine' ? 'Your mistakes' : (itemFor(id)?.course?.title || 'Lessons'); };
  const minsFor = n => n > 0 ? Math.max(1, Math.round(Math.min(n, CAP) * 25 / 60)) : 0;
  /** Today strip: `days` entries, index 0 = today (overdue included) */
  function forecast(days = 7) {
    const sod = startOfDay(), d0 = new Date(sod), ends = [], out = [];
    for (let i = 0; i < days; i++) {
      const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i).getTime();
      ends.push(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i + 1).getTime());
      out.push({ day: dayKey(t), t, n: 0, mins: 0, items: [], by: new Map() });
    }
    for (const [id, due] of liveCards()) {
      let d = 0; while (d < days && due > ends[d]) d++;
      if (d >= days) continue;
      const e = out[d], lab = srcLabel(id); e.n++; e.by.set(lab, (e.by.get(lab) || 0) + 1);
    }
    for (const e of out) { e.mins = minsFor(e.n); e.items = [...e.by].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)); delete e.by; }
    return out;
  }
  /** the first day after today with cards due: {t: start of that day, n, mins} | null */
  function nextReview() {
    const e = endOfDay(), by = new Map();
    for (const [, due] of liveCards()) if (due > e) { const k = dayKey(due); by.set(k, (by.get(k) || 0) + 1); }
    if (!by.size) return null;
    const k = [...by.keys()].sort()[0], n = by.get(k);
    return { t: keyTime(k), n, mins: minsFor(n) };
  }
  function nextDueAfterToday() {
    let best = Infinity; const e = endOfDay();
    for (const s of Object.values(PG('t2c'))) if ((s.lv || 0) < RETIRED && s.due > e && s.due < best) best = s.due;
    return best === Infinity ? null : best;
  }
  /* lessons */
  const lkey = (c, l) => `${c.id}/${l.id}`;
  const lstate = (c, l) => PG('t2l')[lkey(c, l)] || null;
  const lessonCardIds = (c, l) => l.cards.map(k => `ls/${c.id}.${k}`);
  function lessonInfo(c, l) {
    const st = lstate(c, l), ids = lessonCardIds(c, l), ss = ids.map(id => PG('t2c')[id]);
    const due = ss.filter(isDue).length, mature = ss.filter(isMature).length;
    const finished = (st?.st || 0) >= 2;
    const state = !st ? 'new' : due ? 'due' : finished && mature === ids.length ? 'known' : 'learning';
    const egOld = c.id === 'endgames' && H.progress.eg?.[l.id]?.ok;
    const live = ss.filter(x => x && (x.lv || 0) < RETIRED);
    const low = live.length ? Math.min(...live.map(x => x.lv || 1)) : 0, next = live.length ? Math.min(...live.map(x => x.due)) : null;
    return { st: st?.st || 0, finished, due, mature, cards: ids.length, state, egOld, setN: st?.n || 0, low, next };
  }
  function courseInfo(c) {
    let total = 0, mature = 0, due = 0, learning = 0;
    for (const k of Object.keys(c.cards)) { const s = PG('t2c')[`ls/${c.id}.${k}`]; total++; if (isMature(s)) mature++; else if (s) learning++; if (isDue(s)) due++; }
    const finished = c.order.filter(id => (lstate(c, c.lessons[id])?.st || 0) >= 2).length;
    return { total, mature, learning, fresh: total - mature - learning, due, finished, lessons: c.order.length };
  }
  const nextLesson = c => c.order.map(id => c.lessons[id]).find(l => (lstate(c, l)?.st || 0) < 2) || null;
  /** the lesson he is in the middle of (started, not finished), most recent first */
  function continueLesson() {
    let best = null;
    for (const c of COURSES) for (const id of c.order) { const l = c.lessons[id], s = lstate(c, l); if (s && s.st < 2 && (!best || (s.t || 0) > best.t)) best = { c, l, t: s.t || 0 }; }
    return best;
  }
  /** lesson of the day (BLUEPRINT 5): first week fixed order, then lowest finished share / weight; every third day a play-out from his games */
  function lessonOfDay() {
    const days = Math.floor((startOfDay() - anchor()) / DAY);
    const unconverted = (MINE?.plays || []).filter(p => p.id.startsWith('cv/') && !PG('t2x')[p.id]?.ok).sort((a, b) => (b.end || 0) - (a.end || 0));
    if (days % 3 === 2 && unconverted.length) return { kind: 'playout', play: unconverted[0] };
    const cs = COURSES.filter(c => nextLesson(c));
    if (!cs.length) return unconverted.length ? { kind: 'playout', play: unconverted[0] } : null;
    if (days < 7) for (const id of ['think', 'convert', 'tactics', 'endgames']) { const c = cs.find(x => x.id === id); if (c && (lstate(c, c.lessons[c.order[0]])?.st || 0) < 2) return { kind: 'lesson', c, l: c.lessons[c.order[0]] }; }
    const score = c => { const i = courseInfo(c); return (i.lessons ? i.finished / i.lessons : 1) / c.w; };
    const c = cs.slice().sort((a, b) => score(a) - score(b))[0];
    return { kind: 'lesson', c, l: nextLesson(c) };
  }
  /* daily blocks (BLUEPRINT 5): done-state from today's totals */
  function dailyPlan() {
    const d = today(), due = dueCards().length, nm = newMineCards().length;
    const newLeft = Math.max(0, Math.min(nm, DAILY.newMine - newMineToday()));
    const revN = Math.min(CAP, due + newLeft);
    const revDone = revN === 0;
    const puzDone = !PUZ || (d.new || 0) >= DAILY.puz;
    const thinkDone = !MINE || (d.think || 0) >= DAILY.think;
    const lessDone = (d.less || 0) > 0 || (d.play || 0) > 0;
    const puzN = Math.max(0, DAILY.puz - (d.new || 0)), thinkN = Math.max(0, DAILY.think - (d.think || 0));
    const mins = Math.round(((revDone ? 0 : revN * 25) + (puzDone ? 0 : puzN * 50) + (thinkDone ? 0 : thinkN * 40)) / 60);
    return { revN, puzN, thinkN, revDone, puzDone, thinkDone, lessDone, mins: Math.max(1, mins), allDone: revDone && puzDone && thinkDone };
  }
  function todayTasks() {
    const p = dailyPlan(), d = today(), lod = lessonOfDay();
    return [
      { nm: 'Reviews', ct: p.revN ? `${plural(p.revN, 'card')} due · about ${Math.max(1, Math.round(p.revN * 25 / 60))} min` : (d.rev ? `${d.rev} reviewed today` : 'Nothing due'), done: p.revDone,
        go: () => runDaily(['rev']) },
      { nm: '10 new puzzles', ct: PUZ ? `${Math.min(d.new || 0, DAILY.puz)}/${DAILY.puz} · picked for your weak spots` : 'Puzzles arrive with the next update', done: p.puzDone, go: () => runDaily(['puz']) },
      { nm: '5 Think-first', ct: MINE ? `${Math.min(d.think || 0, DAILY.think)}/${DAILY.think} · stop and check before you move` : 'Arrives with the next update', done: p.thinkDone, go: () => runDaily(['think']) },
      { nm: lod?.kind === 'playout' ? 'Play-out of the day' : 'Lesson of the day', ct: lod ? (lod.kind === 'playout' ? `Win it again: your game vs ${lod.play.opp || '?'}` : `${lod.c.title}: ${lod.l.title} · about 5 min`) : 'All lessons finished',
        done: p.lessDone, go: () => lod?.kind === 'playout' ? startPlayout(lod.play, { mine: true }) : lod ? startLessonGated(lod.c, lod.l, false) : show('home') },
    ];
  }

  /* ---------------------------------------------------------------- toasts, rings, mini boards */
  let toastTimer = 0;
  function toast(html, ms = 2600) {
    const t = $('#t2-toast'); t.innerHTML = html; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }
  let minis = [];
  function clearMinis() { minis.forEach(m => { try { m.destroy(); } catch {} }); minis = []; }
  function drawMinis(scope) {
    for (const node of $$('[data-mini]', scope)) {
      const [fen, orient, lm] = [node.dataset.mini, node.dataset.orient || 'white', node.dataset.last];
      try { minis.push(H.Chessground(node, { fen, orientation: orient, viewOnly: true, coordinates: false, lastMove: lm ? [lm.slice(0, 2), lm.slice(2, 4)] : undefined, drawable: { enabled: false } })); } catch (e) { console.warn(e); }
    }
  }
  function ring(frac, label) {
    const r = 22, C = 2 * Math.PI * r;
    return `<svg class="t2-ring" viewBox="0 0 56 56" role="img" aria-label="${esc(label)}"><circle cx="28" cy="28" r="${r}" class="bg"/>${frac > 0 ? `<circle cx="28" cy="28" r="${r}" class="fg" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 28 28)"/>` : ''}<text x="28" y="32" text-anchor="middle">${Math.round(frac * 100)}%</text></svg>`;
  }
  const stateBar = i => `<div class="t2-statebar" title="${i.mature} mature, ${i.learning} learning, ${i.fresh} new"><i class="m" style="flex:${i.mature}"></i><i class="l" style="flex:${i.learning}"></i><i class="n" style="flex:${i.fresh}"></i></div>`;
  function spark(vals, w = 120, h = 32) {
    if (vals.length < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), sp = Math.max(1, mx - mn);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / sp * (h - 6)).toFixed(1)}`).join(' ');
    return `<svg class="t2-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  /* ================================================================ screens */
  const SCREENS = ['home', 'course', 'stats', 'themes', 'player'];
  let screen = 'home', curCourse = null;
  function show(which, arg) {
    if (which === 'course' && arg) curCourse = courseById(arg) || curCourse;
    if (which !== 'player') { stopPlayer(); try { cg?.set({ drawable: { autoShapes: [] } }); } catch {} }
    screen = which;
    for (const w of SCREENS) $('#t2-' + w).hidden = w !== which;
    if (which === 'home') renderHome();
    if (which === 'course') renderCourse(curCourse);
    if (which === 'stats' || which === 'themes') renderExtScreen(which, arg);
    window.scrollTo({ top: 0 });
  }
  function refresh() { seenCache = null; loadMap = null; if (screen === 'home') renderHome(); else if (screen === 'course') renderCourse(curCourse, true); }

  /* ---- A. home */
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function weakSpots(n = 3) {
    const tags = MINE?.stats?.tags; if (!tags) return [];
    const acc = groupAccuracy();
    return Object.entries(tags).filter(([, v]) => v.n).map(([tag, v]) => { const gi = groupIndex(v.group); return { tag, ...v, gi, acc: gi >= 0 ? acc[gi] : null }; })
      .sort((a, b) => (b.per10 || 0) - (a.per10 || 0)).slice(0, n);
  }
  const trend = v => v.prev30 == null || v.last30 == null ? '' : v.last30 < v.prev30 ? ' <span class="t2-good" title="fewer than in the 30 games before">↓</span>' : v.last30 > v.prev30 ? ' <span class="t2-bad" title="more than in the 30 games before">↑</span>' : ' →';
  function renderHome() {
    clearMinis();
    const box = $('#t2-home'), p = dailyPlan(), cont = continueLesson(), d = today();
    const tick = (done, lab) => `<span class="t2-blk${done ? ' on' : ''}"><i aria-hidden="true">${done ? '✓' : ''}</i>${lab}<span class="sr">${done ? ' (done)' : ''}</span></span>`;
    let banner;
    if (!p.allDone) {
      const parts = [p.revDone ? null : plural(p.revN, 'review'), p.puzDone ? null : plural(p.puzN, 'puzzle'), p.thinkDone ? null : `${p.thinkN} Think-first`].filter(Boolean);
      banner = `<div class="card t2-banner"><div><span class="eyebrow">Train today</span><h3>${parts.join(' · ')} · about ${p.mins} min</h3>
        <div class="t2-blocks">${tick(p.revDone, 'Reviews')}${tick(p.puzDone, 'Puzzles')}${tick(p.thinkDone, 'Think first')}${tick(p.lessDone, 'Lesson (optional)')}</div></div>
        <button class="btn primary" data-act="daily">${(d.rev || d.new || d.think) ? 'Continue' : 'Start'}</button></div>`;
    } else {
      const nd = nextDueAfterToday(), lod = lessonOfDay();
      banner = `<div class="card t2-banner done"><div><span class="eyebrow">Train today · done ✓</span><h3>${nd ? `Next review ${whenText(nd)}` : 'Nothing more today'}</h3>
        <div class="t2-blocks">${tick(true, 'Reviews')}${tick(true, 'Puzzles')}${tick(true, 'Think first')}${tick(p.lessDone, 'Lesson (optional)')}</div></div>
        ${lod && !p.lessDone ? `<button class="btn primary" data-act="lod">Learn something new</button>` : PUZ ? `<button class="btn" data-act="puzzles">More puzzles</button>` : ''}</div>`;
    }
    const cards = COURSE_ORDER.map(id => {
      const c = courseById(id), info = COURSE_INFO[id];
      return c ? courseCard(c) : `<div class="card t2-ccard off"><span class="t2-kind">Coming soon</span><h3>${esc(info.title)}</h3><span class="small muted">${esc(info.sub)}</span></div>`;
    }).join('') + COURSES.filter(c => !COURSE_ORDER.includes(c.id)).map(courseCard).join('');
    const ws = weakSpots(), mineNew = MINE ? MINE.cards.filter(m => m.type === 'fix' && !cardGet('mine/' + m.id)).length : 0;
    const trh = Object.entries(H.progress.trh || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([, v]) => v.r);
    const r0 = trh.length > 1 ? trh[trh.length - 1] - trh[0] : 0;
    const cst = cont && lstate(cont.c, cont.l);
    box.innerHTML = `${DRAFT ? '<div class="t2-ribbon">Draft training data: lessons are still being checked</div>' : ''}${PUZ?.sample ? '<div class="t2-ribbon soft">Sample puzzle data (development)</div>' : ''}
      <div class="t2-hhead"><div><h2>Train</h2><p class="muted">Tactics, habits and endgames. Missed things come back; solved things do not.</p></div>
        <div class="t2-rating"><span class="small muted">Puzzle rating</span><b>${rating()}</b>${spark(trh)}${trh.length > 1 ? `<span class="small ${r0 >= 0 ? 't2-good' : 't2-bad'}">${r0 >= 0 ? '+' : ''}${r0}</span>` : ''}</div></div>
      ${banner}
      ${cont ? `<button class="card t2-cont" data-act="learn" data-c="${esc(cont.c.id)}" data-l="${esc(cont.l.id)}"><span class="eyebrow">Continue</span><b>${esc(cont.l.title)}</b><span class="small muted">${esc(cont.c.title)} · ${cst.st >= 1 ? (cst.n ? `practice set ${cst.n}/${cont.l.sets[0]?.ids?.length || '?'}` : 'practise step') : 'learn step'}</span></button>` : ''}
      <div class="t2-cgrid">${cards}</div>
      <div class="t2-quick" role="group" aria-label="Quick starts">
        ${PUZ ? `<button class="btn" data-act="puzzles">Puzzles (mixed)</button><button class="btn" data-act="themes">Practise a theme</button>` : '<span class="small muted">Puzzles arrive with the next update.</span>'}
        ${MINE ? `<button class="btn" data-act="mistakes">My mistakes${mineNew ? ` (${mineNew} new)` : ''}</button>` : ''}
        ${MINE?.plays?.some(x => x.id.startsWith('cv/')) ? `<button class="btn" data-act="playwin">Play out a win</button>` : ''}
        <button class="btn" data-act="stats">Stats</button>
      </div>
      ${ws.length ? `<div class="card t2-weak"><div class="t2-wh"><span class="eyebrow">Your weak spots · from your games</span><button class="btn" data-act="stats">All stats</button></div>
        ${ws.map(w => `<div class="t2-wrow"><div><b>${esc(cap1(w.tag))}</b><div class="small muted">In your games: ${w.n} times (${w.per10} per 10 games)${w.last30 != null ? ` · last 30 games: ${w.last30}${trend(w)}` : ''}</div>
          ${w.acc && w.acc.n ? `<div class="small">In training: ${pct(w.acc.ok / w.acc.n)} of ${w.acc.n}</div>` : ''}</div>
          ${w.gi >= 0 && PUZ ? `<button class="btn" data-act="theme" data-g="${w.gi}">Practise</button>` : ''}</div>`).join('')}</div>` : ''}
      <div id="t2-home-extra"></div>`;
    const extra = $('#t2-home-extra');
    homeBlocks.forEach(fn => { try { fn(extra); } catch (e) { console.warn(e); } });
  }
  function courseCard(c) {
    const i = courseInfo(c), nl = nextLesson(c), info = COURSE_INFO[c.id] || {};
    return `<button class="card t2-ccard" data-act="course" data-c="${esc(c.id)}">
      <div class="t2-crow"><div>${c.draft ? '<span class="t2-kind draft">Draft</span>' : ''}<h3>${esc(c.title || info.title)}</h3><span class="small muted">${esc(c.sub || info.sub || '')}</span></div>${ring(i.total ? i.mature / i.total : 0, `${i.mature} of ${i.total} cards mature`)}</div>
      ${stateBar(i)}
      <div class="t2-meta"><span><b>${i.due}</b> due</span><span><b>${i.finished}</b>/${i.lessons} lessons</span></div>
      <div class="small">${nl ? `Next: <b>${esc(nl.title)}</b>` : 'All lessons finished'}</div></button>`;
  }

  /* ---- B. course page */
  const STATE = { new: 'New', learning: 'Learning', due: 'Due', known: 'Known' };
  const TABS = [['lessons', 'Lessons'], ['review', 'Review'], ['games', 'From your games']];
  function metText(c, l) {
    const st = MINE?.stats; if (!st) return '';
    const n = (st.endings?.[l.id] || []).length;
    if (n) return `You met this in ${plural(n, 'game')}`;
    const ch = c.chOf.get(l.id);
    if (ch?.theme) { const t = Object.values(st.tags || {}).filter(v => v.group === ch.theme).reduce((s, v) => s + (v.n || 0), 0); if (t) return `In your games: ${plural(t, 'mistake')} of this kind`; }
    return '';
  }
  function renderCourse(c, keepScroll) {
    if (!c) return show('home');
    clearMinis();
    const tabs = [...TABS, ...sections.map(s => [s.id, s.label])];
    let tab = H.store.get('t2tab.' + c.id, 'lessons');
    if (!tabs.some(t => t[0] === tab)) tab = 'lessons';
    const i = courseInfo(c), nl = nextLesson(c), y = window.scrollY;
    $('#t2-course').innerHTML = `
      <div class="backrow"><button class="btn" data-act="home">← Train</button></div>
      ${c.draft ? '<div class="t2-ribbon">Draft: this course has not passed all checks yet</div>' : ''}
      <div class="t2-chead">
        <div class="t2-ctitle"><h2>${esc(c.title)}</h2><p class="muted">${rich(c.why || c.sub || '')}</p></div>
        <div class="t2-cstats">${ring(i.total ? i.mature / i.total : 0, 'mature cards')}
          <div><div><b>${i.finished}</b>/${i.lessons} lessons finished</div><div><b>${i.mature}</b> mature · <b>${i.learning}</b> learning · <b>${i.fresh}</b> new</div>${stateBar(i)}</div></div>
      </div>
      <div class="t2-cact">
        ${i.due ? `<button class="btn primary" data-act="review" data-c="${esc(c.id)}">Review ${plural(i.due, 'card')}</button>` : ''}
        ${nl ? `<button class="btn ${i.due ? '' : 'primary'}" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(nl.id)}">${lstate(c, nl) ? 'Continue' : 'Learn next'}: ${esc(nl.title)}</button>` : ''}
      </div>
      <div class="t2-tabs" role="tablist" aria-label="Parts of this course">${tabs.map(([id, lab]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${esc(lab)}</button>`).join('')}</div>
      <div id="t2-tab" role="tabpanel"></div>`;
    const panel = $('#t2-tab');
    if (tab === 'lessons') panel.innerHTML = tabLessons(c);
    else if (tab === 'review') panel.innerHTML = tabReview(c);
    else if (tab === 'games') panel.innerHTML = tabGames(c);
    else { const s = sections.find(s => s.id === tab); try { s.render(c, panel); } catch (e) { console.warn(e); panel.textContent = 'This part could not be shown.'; } }
    drawMinis(panel);
    if (keepScroll) window.scrollTo({ top: y });
  }
  /** "Due today" | "Back tomorrow" | "Back Fri 22 Nov" */
  function nextWhen(t) { const e = endOfDay(); return t <= e ? 'Due today' : t <= e + DAY ? 'Back tomorrow' : `Back ${dateShort(t, true)}`; }
  /** 7 dots: how high the weakest card of the lesson has climbed */
  const boxDots = lv => `<span class="t2-box" role="img" aria-label="Lowest box ${lv} of ${MAXLV}" title="Lowest box ${lv} of ${MAXLV}">${Array.from({ length: MAXLV }, (_, j) => `<i${j < lv ? ' class="on"' : ''}></i>`).join('')}</span>`;
  function tabLessons(c) {
    const nl = nextLesson(c);
    return c.chapters.map(ch => {
      const ls = (ch.lessons || []).map(id => c.lessons[id]).filter(Boolean);
      const done = ls.filter(l => lessonInfo(c, l).finished).length;
      const open = H.store.get(`t2ch.${c.id}.${ch.id}`, true);
      return `<details class="t2-chap" data-ch="${esc(ch.id)}"${open ? ' open' : ''}><summary><span class="t">${esc(ch.title)}</span><span class="small muted">${done}/${ls.length} finished</span>
        <span class="t2-chbar"><i style="width:${ls.length ? done / ls.length * 100 : 0}%"></i></span></summary>
        ${ch.intro ? `<p class="small muted t2-chintro">${rich(ch.intro)}</p>` : ''}
        <div class="t2-lessons">${ls.map(l => {
          const i = lessonInfo(c, l), met = metText(c, l);
          return `<div class="t2-lesson ${i.state}${nl === l ? ' next' : ''}">
            <div class="t2-lmain"><div class="t2-lt">${esc(l.title)}</div>
              <div class="small muted">${esc(l.goal || '')}</div>
              ${i.next != null ? `<div class="t2-lrev"><span class="t2-when${i.next <= endOfDay() ? ' due' : ''}">${esc(nextWhen(i.next))}</span>${boxDots(i.low)}</div>` : ''}
              <div class="t2-lmeta"><span class="status ${i.state}">${STATE[i.state]}${i.state === 'due' ? ` · ${i.due}` : ''}</span><span class="small muted">${plural(i.cards, 'card')}${l.judges.length ? ` · ${plural(l.judges.length, 'judgement')}` : ''}${l.plays.length ? ` · ${plural(l.plays.length, 'play-out')}` : ''}${l.sets.length ? ` · ${l.sets[0].ids?.length || 0}-puzzle set` : ''}</span>
                ${met ? `<span class="small t2-met">${esc(met)}</span>` : ''}${i.egOld ? '<span class="t2-kind">Played before</span>' : ''}</div></div>
            <div class="t2-lbtn">${!i.finished ? `<button class="btn primary" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(l.id)}">${i.st || i.setN ? 'Continue' : 'Learn'}</button>` : ''}
              ${i.due ? `<button class="btn${i.finished ? ' primary' : ''}" data-act="review-lesson" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Review</button>` : ''}
              ${i.finished ? `<button class="btn" data-act="learn" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Again</button>` : ''}
              ${l.plays.length && i.st >= 1 ? `<button class="btn" data-act="lplay" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Play</button>` : ''}</div></div>`;
        }).join('') || '<p class="muted small">No lessons in this chapter yet.</p>'}</div></details>`;
    }).join('') || '<p class="muted">This course has no lessons yet.</p>';
  }
  function tabReview(c) {
    const ids = Object.keys(c.cards).map(k => `ls/${c.id}.${k}`), i = courseInfo(c);
    const diff = ids.map(id => ({ id, s: PG('t2c')[id] })).filter(x => isDifficult(x.s)).sort((a, b) => b.s.w / b.s.n - a.s.w / a.s.n);
    const e = endOfDay(), fc = Array.from({ length: 7 }, () => 0);
    for (const id of ids) { const s = PG('t2c')[id]; if (!s || (s.lv || 0) >= RETIRED) continue; const d = s.due <= e ? 0 : Math.ceil((s.due - e) / DAY); if (d < 7) fc[d]++; }
    const mx = Math.max(1, ...fc);
    const dname = d => d === 0 ? 'Today' : d === 1 ? 'Tmrw' : new Date(now() + d * DAY).toLocaleDateString('en-GB', { weekday: 'short' });
    const lv = Array.from({ length: MAXLV + 1 }, () => 0); ids.forEach(id => lv[Math.min(MAXLV, PG('t2c')[id]?.lv || 0)]++);
    const mxl = Math.max(1, ...lv);
    return `<div class="t2-grid2">
      <div class="card"><span class="eyebrow">Due now</span><h3 class="t2-big">${plural(i.due, 'card')}</h3>
        <p class="small muted">${i.due ? 'Each card is one position: find the move.' : (() => { const nd = nextDueAfterToday(); return nd ? `Next review ${whenText(nd)}.` : 'Finish a lesson first; its cards come back the next day.'; })()}</p>
        ${i.due ? `<div class="controls"><button class="btn primary" data-act="review" data-c="${esc(c.id)}">Start review</button></div>` : ''}</div>
      <div class="card"><span class="eyebrow">Next 7 days</span><div class="t2-fc">${fc.map((n, d) => `<div><span class="n">${n || ''}</span><i style="height:${n / mx * 100}%"></i><span class="d">${dname(d)}</span></div>`).join('')}</div></div>
      <div class="card"><span class="eyebrow">Difficult cards</span>
        ${diff.length ? `<div class="t2-list">${diff.slice(0, 40).map(({ id, s }) => { const it = itemFor(id); return `<button class="t2-drow" data-act="study" data-id="${esc(id)}"><b>${esc(it?.lesson?.title || id)}</b><span class="small">${s.w} wrong of ${s.n}</span></button>`; }).join('')}</div>
          <div class="controls" style="margin-top:10px"><button class="btn primary" data-act="drill" data-c="${esc(c.id)}">Drill these ${diff.length}</button></div>`
          : '<p class="small muted">No difficult cards yet. A card lands here when you miss it twice.</p>'}</div>
      <div class="card"><span class="eyebrow">Cards by level</span><div class="t2-lv">${lv.map((n, j) => `<div><span>${j ? 'L' + j : 'New'}</span><i style="width:${n / mxl * 100}%"></i><b>${n}</b></div>`).join('')}</div>
        <p class="small muted">A card climbs one level for every right answer: back after 1, 3, 7, 14, 30, 90 and 180 days. Level 4 and up is "mature". A miss sends it back to level 1.</p></div>
    </div>`;
  }
  const COURSE_MINE = { tactics: m => m.type === 'fix', think: m => m.type === 'pun' || m.type === 'thr', convert: m => m.type === 'tq', endgames: m => m.type === 'fix' && m.ph === 'endgame' };
  const COURSE_PLAYS = { convert: p => p.id.startsWith('cv/'), endgames: p => p.id.startsWith('eo/') };
  function tabGames(c) {
    if (!MINE) return '<p class="muted">Positions from your games arrive with the next update.</p>';
    const f = COURSE_MINE[c.id] || (() => false), fp = COURSE_PLAYS[c.id];
    const cards = MINE.cards.filter(f), plays = fp ? MINE.plays.filter(fp) : [];
    const desk = matchMedia('(min-width: 900px)').matches;
    const row = m => { const id = 'mine/' + m.id, s = cardGet(id);
      return `<div class="t2-grow">${desk ? `<div class="t2-mini" data-mini="${esc(m.fen)}" data-orient="${m.side}" data-last="${esc(m.last || '')}"></div>` : ''}
        <div class="t2-gt"><b>${esc(gameChip(m))}</b><div class="small muted">${esc(m.moveNo || '')}${m.played ? ` · you played ${esc(m.played)}` : ''}${m.kind ? ` · ${esc(m.kind)}` : ''}</div>
        <div class="small">${s ? ((s.lv || 0) >= RETIRED ? 'Retired ✓' : `Level ${s.lv} · due ${whenText(s.due)}`) : 'New'}</div></div>
        <button class="btn" data-act="one" data-id="${esc(id)}">${s ? 'Practise' : 'Try it'}</button></div>`; };
    const prow = p => { const x = PG('t2x')[p.id];
      return `<div class="t2-grow">${desk ? `<div class="t2-mini" data-mini="${esc(p.fen)}" data-orient="${p.side}"></div>` : ''}<div class="t2-gt"><b>${esc(gameChip(p))}</b><div class="small muted">${esc(p.moveNo || '')} · goal: ${esc(p.goal || 'win')} · in the game: ${esc(p.result || '?')}</div>
        <div class="small">${x ? (x.ok ? 'Done ✓' : `${plural(x.fails, 'try', 'tries')} so far`) : 'Not played yet'}</div></div><button class="btn" data-act="pplay" data-id="${esc(p.id)}">Play it out</button></div>`; };
    if (!cards.length && !plays.length) return '<p class="muted">No positions from your games for this course yet.</p>';
    return `${cards.length ? `<h3 class="t2-h3">Cards from your games (${cards.length})</h3><p class="small muted">Newest games first. Up to ${DAILY.newMine} new ones join your daily reviews each day.</p><div class="t2-list">${cards.slice(0, 200).map(row).join('')}</div>${cards.length > 200 ? `<p class="small muted">and ${cards.length - 200} more</p>` : ''}` : ''}
      ${plays.length ? `<h3 class="t2-h3">Play-outs from your games (${plays.length})</h3><div class="t2-list">${plays.slice(0, 200).map(prow).join('')}</div>` : ''}`;
  }

  /* ---- F/G fallbacks (T7 replaces them through T2.setScreen) */
  function renderExtScreen(which, arg) {
    const el = $('#t2-' + which);
    el.innerHTML = `<div class="backrow"><button class="btn" data-act="home">← Train</button></div><div class="t2-ext"></div>`;
    const box = el.querySelector('.t2-ext');
    if (EXT.screens[which]) { try { EXT.screens[which](box, arg); return; } catch (e) { console.warn(e); } }
    box.innerHTML = which === 'themes' ? themesFallback() : statsFallback();
  }
  function themesFallback() {
    if (!PUZ) return '<p class="muted">Puzzles arrive with the next update.</p>';
    const acc = groupAccuracy(), seen = seenSet(), tags = MINE?.stats?.tags || {};
    return `<h2>Practise a theme</h2><p class="muted">Pick a theme: you get puzzles near your rating that you have not seen.</p><div class="t2-tgrid">${PUZ.groups.map((g, i) => {
      const un = PUZ.byGroup[i].filter(p => !seen.has(p.id) && !PG('t2c')['pz/' + p.id]).length;
      const mine = Object.values(tags).filter(v => v.group === g.id).reduce((s, v) => s + (v.n || 0), 0);
      return `<button class="card t2-theme" data-act="theme" data-g="${i}"><b>${esc(g.name)}</b><span class="small muted">${esc(g.ds || '')}</span>
        <span class="small">${mine ? `Your games: ${mine}× · ` : ''}${acc[i].n ? `${pct(acc[i].ok / acc[i].n)} of ${acc[i].n}` : 'not tried yet'} · ${un} unseen</span></button>`; }).join('')}</div>`;
  }
  function statsFallback() {
    const d = PG('t2d'), ks = Object.keys(d).sort().slice(-14);
    const tot = ks.reduce((a, k) => ({ rev: a.rev + (d[k].rev || 0), wrong: a.wrong + (d[k].wrong || 0) }), { rev: 0, wrong: 0 });
    const ws = weakSpots(8);
    return `<h2>Stats</h2><p class="small muted">The full statistics page arrives with the next part of the rebuild.</p>
      <div class="card"><span class="eyebrow">Training · last 14 days</span><p>${tot.rev ? `${tot.rev} reviews, ${pct(1 - tot.wrong / Math.max(1, tot.rev))} right.` : 'No reviews yet.'} Puzzle rating ${rating()}.</p></div>
      ${ws.length ? `<div class="card"><span class="eyebrow">Your mistakes by kind (your games)</span>${ws.map(w => `<div class="t2-wrow"><div><b>${esc(cap1(w.tag))}</b><div class="small muted">${w.n} times · ${w.per10} per 10 games</div></div></div>`).join('')}</div>` : '<p class="muted">Statistics from your games arrive with the next update.</p>'}
      ${MINE?.stats?.clock ? `<div class="card"><span class="eyebrow">Slow down</span><p>${pct(MINE.stats.clock.fastShare)} of your mistakes are played in under 5 seconds.</p></div>` : ''}`;
  }

  /* ================================================================ C/D. the player (one board for lessons, cards, Think first) */
  let cg = null;
  const CANCEL = Symbol('cancel');
  const P = { gen: 0, chess: null, side: 'white', flipped: false, last: null, shapes: [], expect: null, cont: null, nav: null, choice: null, back: null, mode: '', ctx: null, busy: false };
  function stopPlayer() { P.gen++; P.expect = null; P.cont = null; P.nav = null; P.choice = null; P.busy = false; closeMenu(); }
  function begin(mode, back) {
    stopPlayer();
    const g = P.gen;
    Object.assign(P, { mode, back, shapes: [], last: null, ctx: null, flipped: false });
    for (const w of SCREENS) $('#t2-' + w).hidden = w !== 'player';
    screen = 'player';
    $('#t2-panel').innerHTML = ''; $('#t2-steps').hidden = true; $('#t2-src').textContent = '';
    $('#t2-draft').hidden = !DRAFT;
    window.scrollTo({ top: 0 });
    lastAct = Date.now();
    return () => { if (g !== P.gen) throw CANCEL; };
  }
  async function run(fn) { try { await fn(); } catch (e) { if (e !== CANCEL) { console.error(e); fb(`<b>Something went wrong.</b> <span class="muted">${esc(e.message || e)}</span><div class="controls"><button class="btn" data-act="back">Back</button></div>`, 'wrong'); } } }
  function head(label, title, done = 0, total = 0, chip = '') {
    $('#t2-mode').textContent = label; $('#t2-title').textContent = title; $('#t2-src').textContent = chip || ''; $('#t2-src').hidden = !chip;
    $('#t2-bar').style.width = total ? Math.min(100, done / total * 100) + '%' : '0';
  }
  function fb(html, cls = '') { const f = $('#t2-fb'); f.className = 'card t2-fb ' + cls; f.innerHTML = html; }
  function stepBar(cur, labels) {
    const s = $('#t2-steps'); s.hidden = false;
    s.innerHTML = labels.map((l, i) => `<span class="${i < cur ? 'done' : i === cur ? 'on' : ''}"${i === cur ? ' aria-current="step"' : ''}><i>${i < cur ? '✓' : i + 1}</i>${esc(l)}</span>`).join('');
  }
  const orientation = () => P.flipped ? other(P.side) : P.side;
  function board(fen, side, { last = null } = {}) {
    P.chess = new Chess(fen); P.side = side || sideOf(fen);
    P.last = last ? (typeof last === 'string' ? [last.slice(0, 2), last.slice(2, 4)] : last) : null;
    P.shapes = []; draw();
  }
  const boardSized = () => { const el = $('#t2board'); return !!el && el.clientWidth > 0 && el.clientHeight > 0; };
  let boardRO = null;
  function watchBoard() {
    if (boardRO || typeof ResizeObserver === 'undefined') return;
    const el = $('#t2board'); if (!el) return;
    let was = boardSized();
    boardRO = new ResizeObserver(() => { const now = boardSized(); if (now && !was && P.chess && P.shapes.length) draw(); was = now; });
    boardRO.observe(el);
  }
  function draw() {
    if (!P.chess) return;
    watchBoard();
    const turn = P.chess.turn() === 'w' ? 'white' : 'black', can = !!P.expect && !P.busy;
    const opts = { fen: P.chess.fen(), orientation: orientation(), turnColor: turn, check: P.chess.in_check(), lastMove: P.last || undefined, coordinates: true, animation: { enabled: true, duration: 220 },
      movable: { free: false, color: can ? turn : undefined, dests: can ? toDests(P.chess) : new Map(), showDests: true, events: { after: onUserMove } },
      premovable: { enabled: false }, drawable: { enabled: true, autoShapes: boardSized() ? P.shapes : [] } };
    if (!cg) cg = H.Chessground($('#t2board'), opts); else cg.set(opts);
  }
  function playUci(u) {
    const mv = uciMove(P.chess, u); if (!mv) throw new Error('illegal move in data: ' + u + ' in ' + P.chess.fen());
    P.last = [mv.from, mv.to]; play(mv.captured ? 'capture' : 'move'); draw(); return mv;
  }
  function playSan(san) { const mv = P.chess.move(san, { sloppy: true }); if (!mv) return null; P.last = [mv.from, mv.to]; play(mv.captured ? 'capture' : 'move'); draw(); return mv; }
  function flash() { const b = $('#t2-shell'); b.classList.remove('t2-flash'); void b.offsetWidth; b.classList.add('t2-flash'); }
  const moveLabel = (fen, san) => { const [, t, , , , n] = fen.split(' '); return `${n || 1}${t === 'w' ? '.' : '...'}${san}`; };
  const arrow = (u, brush = 'green') => ({ orig: u.slice(0, 2), dest: u.slice(2, 4), brush });

  /* action bar: mode buttons + Flip + More (keyboard: Space = next, H = hint, S = show, F = flip) */
  function actions(list = []) {
    const b = [...list, ['flip', 'Flip', 'F', false, 'narrow'], ['more', 'More', '', false, 'narrow']];
    $('#t2-actions').innerHTML = b.map(([id, lab, key, pri, cls]) => `<button class="btn${pri ? ' primary' : ''}${cls ? ' ' + cls : ''}" data-pa="${id}">${esc(lab)}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('');
  }
  function cont(label = 'Continue', extra = []) { return new Promise(resolve => { P.cont = resolve; actions([...extra, ['cont', label, 'Space', true]]); }); }
  function doCont(v) { const r = P.cont; if (r) { P.cont = null; r(v ?? 'cont'); } }
  function nav(label, canBack) { return new Promise(resolve => { P.nav = resolve; actions([...(canBack ? [['prev', '◀ Back', '←']] : []), ['next', label + ' ▶', 'Space', true]]); }); }
  function doNav(d) { const r = P.nav; if (r) { P.nav = null; r(d); } }
  /** big answer buttons in the feedback card; resolves with the chosen value */
  function choose(opts, html) {
    return new Promise(resolve => {
      P.choice = v => { P.choice = null; resolve(v); };
      fb(`${html}<div class="t2-choices">${opts.map(([v, lab, cls]) => `<button class="btn ${cls || ''}" data-choice="${esc(v)}">${esc(lab)}</button>`).join('')}</div>`);
    });
  }

  /** ask one move. o: {judge(u, after, mv) -> 'sol'|'also'|'slow'|'wrong', want (uci), onWrong(u, mv, st), arrowAfter (wrongs before the arrow), extraBtn: [id, label]}
      resolves {v, u, mv, wrongs, hinted, shown, fast} after the accepted move has been played on the board */
  function askMove(o) {
    return new Promise(resolve => {
      const st = { wrongs: 0, hinted: false, shown: false, fast: false, t0: Date.now() };
      P.expect = { ...o, st, resolve };
      const btns = [];
      if (o.want) btns.push(['hint', 'Hint', 'H'], ['showmv', 'Show me', 'S']);
      if (o.extraBtn) btns.unshift([o.extraBtn[0], o.extraBtn[1], '', false, 'extra']);
      actions(btns);
      draw();
    });
  }
  function onUserMove(orig, dest) {
    const e = P.expect;
    if (!e || P.busy) return draw();
    const t = new Chess(P.chess.fen());
    const promo = e.want && e.want.slice(0, 4) === orig + dest ? (e.want[4] || 'q') : 'q';
    const mv = t.move({ from: orig, to: dest, promotion: promo });
    if (!mv) return draw();
    const u = mvUci(mv);
    const v = e.judge ? e.judge(u, t, mv) : (sameMove(u, e.want) || t.in_checkmate() ? 'sol' : 'wrong');
    if (v === 'slow') { toast('Still winning, but that wastes time. Find the quickest way.', 3200); return setTimeout(draw, 250); }
    if (v === 'wrong') {
      e.st.wrongs++;
      if (e.st.wrongs === 1) { e.st.firstMs = Date.now() - e.st.t0; if (e.st.firstMs < 4000) e.st.fast = true; }
      play('wrong'); flash();
      if (e.want && e.st.wrongs >= (e.arrowAfter ?? 2)) { e.st.shown = true; P.shapes = [arrow(e.want)]; }
      e.onWrong?.(u, mv, e.st);
      return setTimeout(draw, 260);
    }
    P.expect = null;
    P.chess.move(mv); P.last = [mv.from, mv.to]; play(mv.captured ? 'capture' : 'move');
    P.shapes = []; draw();
    e.resolve({ v, u, mv, ...e.st });
  }
  function hint(full) {
    const e = P.expect; if (!e?.want) return;
    if (full) { e.st.shown = true; P.shapes = [arrow(e.want)]; fb(`<span class="eyebrow">The answer</span><p>Play the arrow move: <b class="t2-san">${esc(sanOf(P.chess.fen(), e.want))}</b>. It counts as a miss, so the card comes back.</p>`, 'wrong'); }
    else { e.st.hinted = true; P.shapes = [{ orig: e.want.slice(0, 2), brush: 'yellow' }]; toast('The circled piece moves.'); }
    draw();
  }

  /* ---- Show why: play the refutation of a wrong move, then return to the position */
  async function showWhy(it, u, fenBefore) {
    if (P.busy) return;
    let line = [];
    const t = new Chess(fenBefore), mv = uciMove(t, u); if (!mv) return;
    const wl = it.wrongLine?.[u] || it.wrongLine?.[Object.keys(it.wrongLine || {}).find(k => sameMove(k, u))];
    if (wl) line = sanList(wl);
    else if (it.played && it.refute?.length && (it.played.replace(/[+#]/g, '') === mv.san.replace(/[+#]/g, ''))) line = [mv.san, ...it.refute];
    else if (H.engine) {
      fb('<span class="eyebrow">Show why</span><p class="small muted">Asking the computer for the best reply…</p>');
      try { const r = await H.engine.go(t.fen(), { movetime: 1000 }); if (r?.best && r.best !== '(none)') line = [mv.san, sanOf(t.fen(), r.best)]; } catch {}
    }
    if (!line.length) { toast('No refutation stored for this move. Try another move.'); return; }
    const e = P.expect; P.busy = true; draw();
    const saved = { fen: P.chess.fen(), last: P.last, shapes: P.shapes };
    const played = [];
    for (const san of line.slice(0, 6)) { await wait(650); if (!P.busy) return; const m = playSan(san); if (!m) break; played.push(m.san); }
    const txt = it.wrong?.[u] || '';
    fb(`<span class="eyebrow" style="color:var(--blunder)">Why not ${esc(mv.san)}</span><p class="t2-san">${esc(played.join(' '))}</p>${txt ? `<p>${rich(txt)}</p>` : ''}<div class="controls"><button class="btn primary" data-pa="whyback">Back to the position</button></div>`, 'wrong');
    P.whyRestore = () => { P.busy = false; P.chess = new Chess(saved.fen); P.last = saved.last; P.shapes = saved.shapes; P.whyRestore = null; draw(); fb('<span class="eyebrow">Your move</span><p>Try again.</p>'); if (e) P.expect = e; };
  }

  /** find-the-move card (puzzle, lesson card, own-game card, punish card). Resolves {result, fast, alsoText}. */
  async function solveCard(it, chk, { prompt, nothingBtn = false } = {}) {
    board(it.fen, it.side, { last: it.last });
    if (it.setup) {
      fb('<span class="eyebrow">Watch your opponent\'s move</span><p class="small muted">Then find the best reply.</p>'); actions([]);
      await wait(700); chk(); playUci(it.setup);
    }
    const R = { wrongs: 0, hinted: false, shown: false, fast: false, alsoText: null, nothing: false };
    const side = it.side === 'white' ? 'White' : 'Black';
    let i = 0;
    while (i < it.sol.length) {
      const want = it.sol[i], lastStep = i >= it.sol.length - 1, first = i === 0, fenBefore = P.chess.fen();
      fb(first ? `<span class="eyebrow">${side} to move</span><p>${prompt || (it.tag === 'hold' ? 'Find the move that holds.' : 'Find the best move.')}</p>${it.sol.length > 1 ? `<p class="small muted">${Math.ceil(it.sol.length / 2)} moves to find; the replies are played for you.</p>` : ''}`
               : `<span class="eyebrow">✓ Keep going</span><p>Find the next move.</p>`, first ? '' : 'right');
      const r = await askMove({
        want, arrowAfter: 2,
        extraBtn: nothingBtn && first ? ['nothing', 'Nothing special'] : null,
        judge: (u, after) => {
          if (sameMove(u, want) || after.in_checkmate()) return 'sol';
          if (lastStep && (it.alt || []).some(a => sameMove(a, u))) return 'sol';
          if (first && it.ok.some(a => sameMove(a, u))) return 'also';
          if ((it.slow || []).some(a => sameMove(a, u))) return 'slow';
          return 'wrong';
        },
        onWrong: (u, mv, st) => {
          const why = first ? (it.wrong[u] || it.wrong[Object.keys(it.wrong).find(k => sameMove(k, u))]) : null;
          const canWhy = first && (why || it.wrongLine?.[u] || (it.played && it.refute?.length) || H.engine);
          fb(`<span class="eyebrow" style="color:var(--blunder)">Not this one: <span class="t2-san">${esc(mv.san)}</span></span>${why ? `<p>${rich(why)}</p>` : ''}
            <p class="small muted">${st.shown ? 'Play the arrow move to go on.' : 'One more try.'}</p>
            ${canWhy && !st.shown ? `<div class="controls"><button class="btn" data-why="${esc(u)}" data-fen="${esc(fenBefore)}">Show why</button></div>` : ''}`, 'wrong');
        },
      });
      chk();
      R.wrongs += r.wrongs; R.hinted ||= r.hinted; R.shown ||= r.shown; R.fast ||= r.fast; if (r.firstMs != null && R.firstMs == null) R.firstMs = r.firstMs;
      if (r.v === 'nothing') { R.nothing = true; break; }
      if (r.v === 'also') { const k = Object.keys(it.also).find(k => sameMove(k, r.u)); R.alsoText = (k && it.also[k]) || 'That works too.'; break; }
      i++;
      if (i < it.sol.length && !P.chess.in_checkmate()) { await wait(450); chk(); playUci(it.sol[i]); i++; }
      if (P.chess.in_checkmate()) break;
    }
    const result = R.wrongs || R.shown || R.nothing ? 'wrong' : R.hinted ? 'hint' : 'ok';
    return { result, fast: R.fast, firstMs: R.firstMs, alsoText: R.alsoText, nothing: R.nothing };
  }
  /** P.expect gets a pseudo-move "nothing" from the extra button */
  function extraBtn(id) { const e = P.expect; if (e && id === 'nothing') { P.expect = null; e.resolve({ v: 'nothing', ...e.st }); } }

  /** Safe or blunder? (his move shown as an arrow) */
  async function solveJudge(it, chk) {
    board(it.fen, it.side);
    P.shapes = [arrow(it.mv, 'blue')]; draw(); actions([]);
    const who = it.who === 'me' ? 'You are about to play' : 'The move';
    const c = await choose([['safe', 'Safe'], ['blunder', 'Blunder']], `<span class="eyebrow">Safe or blunder?</span><p>${who} <b class="t2-san">${esc(moveLabel(it.fen, it.san))}</b> (blue arrow). Check what your opponent gets after it.</p>`);
    chk();
    const ok = c === it.verdict;
    P.shapes = []; playUci(it.mv);
    if (it.verdict === 'blunder') {
      if (ok && it.refute.length) {
        const t = new Chess(P.chess.fen()), m = t.move(it.refute[0], { sloppy: true });
        if (m) {
          fb(`<span class="eyebrow">✓ Right, it is a blunder</span><p>Now show the punishment: play your opponent's best reply.</p>`, 'right');
          await askMove({ want: mvUci(m), arrowAfter: 2, onWrong: (u, mv, st) => fb(`<span class="eyebrow" style="color:var(--blunder)">Not ${esc(mv.san)}</span><p class="small muted">${st.shown ? 'Play the arrow move.' : 'Look for a capture or a check. One more try.'}</p>`, 'wrong') }); chk();
          for (const san of it.refute.slice(1, 4)) { await wait(600); chk(); if (!playSan(san)) break; }
        }
      } else if (it.refute.length) {
        fb(`<span class="eyebrow" style="color:var(--blunder)">It was a blunder</span><p class="small muted">Watch what your opponent does next.</p>`, 'wrong');
        for (const san of it.refute.slice(0, 4)) { await wait(700); chk(); if (!playSan(san)) break; }
      }
    }
    return { result: ok ? 'ok' : 'wrong', choice: c };
  }
  /** Punish it or not? Decoy = a quiet opponent move (right answer: "Nothing special"); real = a pun card */
  async function solvePunq(it, chk) {
    if (!it.decoy) return solveCard(it, chk, { prompt: 'Your opponent just moved. Punish it, or is it nothing special?', nothingBtn: true });
    board(it.fen, it.side); actions([]);
    fb('<span class="eyebrow">Watch your opponent\'s move</span>');
    await wait(600); chk(); playUci(it.mv);
    fb(`<span class="eyebrow">${it.side === 'white' ? 'White' : 'Black'} to move</span><p>Your opponent just played <b class="t2-san">${esc(it.san)}</b>. Punish it, or is it nothing special?</p><p class="small muted">Play the punishing move, or press "Nothing special".</p>`);
    const r = await askMove({ judge: () => 'sol', extraBtn: ['nothing', 'Nothing special'] }); chk();
    if (r.v === 'nothing') return { result: 'ok' };
    return { result: 'wrong', played: r.mv?.san };
  }
  /** What is the threat? step 1: move the opponent's piece; step 2: stop it */
  async function solveThreat(it, chk) {
    const f = it.fen.split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-';
    board(f.join(' '), it.side, { last: it.last });
    fb(`<span class="eyebrow">Step 1 of 2 · What is the threat?</span><p>If it were your opponent's move, what would they play? Move <b>their</b> piece.</p>`);
    const r1 = await askMove({ want: it.threat, arrowAfter: 2, onWrong: (u, mv, st) => fb(`<span class="eyebrow" style="color:var(--blunder)">Not ${esc(mv.san)}</span><p class="small muted">${st.shown ? 'The arrow shows the threat: play it.' : 'Look at what your opponent attacks. One more try.'}</p>`, 'wrong') });
    chk();
    const tSan = r1.mv.san;
    fb(`<span class="eyebrow">${r1.wrongs || r1.shown ? 'That is the threat' : '✓ Right, that is the threat'}</span><p><b class="t2-san">${esc(tSan)}</b>. Now stop it.</p>`, r1.wrongs || r1.shown ? 'wrong' : 'right');
    await wait(1100); chk();
    const r2 = await solveCard({ ...it, last: null, setup: null }, chk, { prompt: `Stop the threat ${tSan}.` });
    const bad = r1.wrongs || r1.shown || r2.result === 'wrong';
    return { result: bad ? 'wrong' : (r1.hinted || r2.result === 'hint') ? 'hint' : 'ok', fast: r1.fast || r2.fast };
  }
  /** one item of any kind */
  function askItem(it, chk) {
    if (it.kind === 'judge') return solveJudge(it, chk);
    if (it.kind === 'punq') return solvePunq(it, chk);
    if (it.kind === 'thr') return solveThreat(it, chk);
    return solveCard(it, chk);
  }
  /** the answer: the full solution as a list of moves (for "Play through the solution" and study) */
  function solutionLine(it) {
    const t = new Chess(it.fen), out = [];
    const push = u => { const m = uciMove(t, u); if (m) out.push({ fen: out.length ? out[out.length - 1].after : it.fen, san: m.san, u, after: t.fen() }); return m; };
    if (it.kind === 'judge' || (it.kind === 'punq' && it.decoy)) { push(it.mv); for (const s of it.refute || []) { const m = t.move(s, { sloppy: true }); if (!m) break; out.push({ san: m.san, u: mvUci(m), after: t.fen() }); } return out; }
    if (it.setup) push(it.setup);
    if (it.kind === 'thr' && it.threat) { /* threat is shown in text */ }
    for (const u of it.sol) if (!push(u)) break;
    return out;
  }
  /** step through an item's solution (Next/Back); used after an answer and from "missed" lists */
  async function stepThrough(it, chk, { intro = '' } = {}) {
    const line = solutionLine(it);
    board(it.fen, it.side, { last: it.setup ? null : it.last });
    const fens = [P.chess.fen()], lasts = [P.last];
    let i = 0;
    const showAt = () => {
      if (i === 0) fb(`<span class="eyebrow">The solution</span>${intro}<p class="small muted">Step through with Next.</p>`);
      else fb(`<span class="eyebrow">Solution · move ${i} of ${line.length}</span><div class="t2-mv"><b class="t2-san">${esc(line.slice(0, i).map(x => x.san).join(' '))}</b></div>${i === line.length && it.why ? `<p>${rich(it.why)}</p>` : ''}`, i === line.length ? 'right' : '');
    };
    showAt();
    while (true) {
      const a = await nav(i < line.length ? 'Next' : 'Done', i > 0); chk();
      if (a === 'prev') { if (i > 0) { i--; P.chess = new Chess(fens[i]); P.last = lasts[i]; fens.length = lasts.length = i + 1; draw(); showAt(); } continue; }
      if (i >= line.length) break;
      playUci(line[i].u); i++; fens.push(P.chess.fen()); lasts.push(P.last); showAt();
    }
  }
  function studyItem(id) {
    const it = itemFor(id) || judgeItem(id); if (!it) return;
    const back = screen === 'course' ? () => show('course', curCourse?.id) : P.back || (() => show('home'));
    run(async () => { const chk = begin('study', back); head('Study', it.lesson?.title || it.chip || 'Position', 0, 0, it.chip); await stepThrough(it, chk); back(); });
  }

  /* ---- More menu */
  function openMenu() {
    const m = $('#t2-menu');
    if (!m.hidden) return closeMenu();
    const items = [];
    if (H.analyse) items.push(['analyse', 'Analyse this position']);
    if (H.sfx && 'on' in H.sfx) items.push(['sound', `Sound: ${H.sfx.on ? 'on' : 'off'}`]);
    items.push(['report', 'Report a problem (copies id + position)']);
    m.innerHTML = items.map(([id, t]) => `<button role="menuitem" data-menu="${id}">${esc(t)}</button>`).join('');
    m.hidden = false; m.querySelector('button')?.focus();
  }
  function closeMenu() { const m = ROOT && $('#t2-menu'); if (m) m.hidden = true; }
  function menuAction(id) {
    closeMenu();
    const fen = P.chess?.fen() || '';
    if (id === 'analyse') H.analyse?.(fen, P.ctx?.url);
    if (id === 'sound') { H.sfx.on = !H.sfx.on; H.store.set('sound', H.sfx.on); }
    if (id === 'report') {
      const txt = `Train problem · item ${P.ctx?.key || '-'} · mode ${P.mode} · FEN ${fen}`;
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Copied. Paste it to Claude with what looks wrong.'), () => toast(esc(txt), 8000));
    }
  }

  /* ================================================================ sessions (reviews, puzzles, Think first, drills) */
  /** keeps the schedule on the result (for the timing note) and counts what moved for the end summary */
  function tally(res, sc, S) {
    res.sched = sc;
    const m = S.mv || (S.mv = { up: 0, back: 0, gone: 0 });
    if (sc.what === 'up') m.up++; else if (sc.what === 'retired') m.gone++; else if (sc.result === 'wrong') m.back++;
  }
  const addMv = (a, b) => { for (const k of ['up', 'back', 'gone']) a[k] += b?.[k] || 0; return a; };
  /** end of a session: what moved + when the next review is */
  function endNotes(mv) {
    const m = mv || {}, parts = [m.up ? `${plural(m.up, 'card')} up a box` : '', m.back ? `${m.back} back to tomorrow` : '', m.gone ? `${m.gone} learned for good` : ''].filter(Boolean);
    const rem = dueCards().length, nx = nextReview();
    let line = '';
    if (rem) line = `${plural(rem, 'review')} still waiting today`;
    else if (nx) { const e = endOfDay(); line = `Next review: ${nx.t < e + DAY ? 'tomorrow (' + dateShort(nx.t, true) + ')' : dateShort(nx.t, true)} · about ${nx.mins} min`; }
    else line = 'Nothing comes back yet.';
    return `${parts.length ? `<p>${parts.join(' · ')}</p>` : ''}<p class="small muted">${line}</p>`;
  }
  /** how: 'review' (scheduled), 'newpz' (stream puzzle: rating + seen/card), 'practice' (nothing recorded) */
  function recordResult(it, res, how, S) {
    if (how === 'practice' || (how === 'lesson' && it.src === 'ls' && it.kind === 'card')) { dayAdd({ fw: res.fast && res.result === 'wrong' ? 1 : 0, ms: spent() }); return; }   // lesson cards enter the SRS together at the end of the practise step
    if (it.kind === 'judge' || (it.kind === 'punq' && it.decoy)) { judgeResult(it.key, res.result === 'ok'); return; }
    if (how === 'newpz') {
      S.rd += ratePuzzle(it.rating, res.result === 'ok');
      tally(res, srsAnswerFull(it.key, res.result, { fast: res.fast, noRev: true }), S); dayAdd({ new: 1 });
      return;
    }
    const think = it.kind === 'thr' || it.kind === 'punq';
    tally(res, srsAnswerFull(it.key, res.result, { fast: res.fast, noRev: think }), S);
    if (think) dayAdd({ think: 1, thinkOk: res.result === 'wrong' ? 0 : 1 });
  }
  function resultHtml(it, res, S) {
    const right = res.result !== 'wrong';
    const top = res.alsoText ? `<span class="eyebrow">✓ That works too</span><p>${rich(res.alsoText)}</p>`
      : right ? `<span class="eyebrow">✓ ${res.result === 'hint' ? 'Right, with a hint' : 'Right'}</span>`
      : `<span class="eyebrow" style="color:var(--blunder)">${res.nothing ? 'There was something here' : it.kind === 'punq' && it.decoy ? 'Nothing to punish here' : 'Missed'}</span>`;
    let note = '';
    const sn = schedNote(res.sched);
    if (sn) note = `<p class="small t2-sched${right ? '' : ' bad'}">${esc(sn)}${!right && S.again ? ' · and once more at the end of this session' : ''}</p>`;
    else if (!right && !S.practice) note = it.kind === 'judge' || it.decoy ? '<p class="small muted">It comes back in 3 days.</p>' : `<p class="small muted">It comes back ${S.again ? 'at the end of this session and again ' : ''}tomorrow.</p>`;
    if (right && it.repeat) note = '<p class="small muted">You have seen all of these: this one was repeated.</p>';
    let nudge = '';
    if (!right && res.fast && !S.nudged && MINE?.stats?.clock) { S.nudged = true; nudge = `<div class="t2-nudge"><b>Slow down.</b> That took ${plural(Math.max(1, Math.round((res.firstMs || 2000) / 1000)), 'second')}. In your games ${pct(MINE.stats.clock.fastShare)} of your mistakes are played in under 5 seconds.</div>`; }
    const verdict = it.kind === 'judge' ? `<p>It was <b>${it.verdict === 'safe' ? 'safe' : 'a blunder'}</b>.</p>` : '';
    return `${top}${verdict}${it.why ? `<p>${rich(it.why)}</p>` : ''}${note}${nudge}`;
  }
  /** o: {label, items:[item] | next(): item|null, total, how, back, practice, again (default true), title(it), summary(S) -> {html, btns}} -> S */
  async function runSession(o, chk) {
    const S = { asked: 0, ok: 0, wrong: [], mv: { up: 0, back: 0, gone: 0 }, rd: 0, r0: rating(), practice: !!o.practice, again: o.again !== false, nudged: false };
    const queue = (o.items || []).slice(), again = [];
    const n0 = queue.length, total = () => o.total ?? n0;
    let k = 0;
    while (true) {
      chk();
      let it = queue.shift();
      if (!it && o.next && S.asked < (o.total ?? Infinity)) it = o.next();
      if (!it) it = again.shift();
      if (!it) break;
      k++;
      P.ctx = it;
      head(`${o.label} · ${it.again ? 'once more' : `${Math.min(S.asked + 1, total())} of ${total()}`}`, o.title ? o.title(it) : (it.lesson?.title || o.label), S.asked, total(), it.chip);
      if (it.repeat) toast('You have seen all of these: repeating the oldest.');
      const res = await askItem(it, chk); chk();
      if (!it.again) {
        recordResult(it, res, o.how || 'review', S);
        S.asked++; if (res.result !== 'wrong') S.ok++; else S.wrong.push(it);
        try { o.onItem?.(S.asked, it, res); } catch (e) { console.warn(e); }
        changed();
        if (res.result === 'wrong' && o.again !== false && it.kind !== 'judge' && !it.decoy) again.push({ ...it, again: true });   // R4: the planned "again at the end"
      }
      if (res.result !== 'wrong') play('right');
      let v;
      do {
        fb(resultHtml(it, res, S), res.result === 'wrong' ? 'wrong' : 'right');
        const extra = [];
        if (it.kind !== 'thr') extra.push(['cont', 'Solution', '', false, 'sol']);
        if (it.url) extra.push(['cont', 'Open the game', '', false, 'game']);
        v = await new Promise(resolve => { P.cont = resolve; actions([...extra.map(([a, l, kk, p, val]) => [a + ':' + val, l, kk, p]), ['cont', 'Next', 'Space', true]]); });
        chk();
        if (v === 'sol') await stepThrough(it, chk, { intro: it.why ? `<p>${rich(it.why)}</p>` : '' });
        if (v === 'game') openGame(it.url);
      } while (v === 'sol' || v === 'game');
    }
    if (o.summary === false) return S;
    head(o.label, 'Session complete', 1, 1);
    play('done');
    const acc = S.asked ? S.ok / S.asked : 0;
    if (acc >= 0.9 && S.asked >= 5) { try { H.confetti?.(); } catch {} }
    const sm = o.summary ? o.summary(S) : {};
    fb(`<span class="eyebrow">${esc(o.label)} · finished</span><h3>${S.ok} of ${S.asked} right · ${pct(acc)}</h3>
      ${S.rd ? `<p>Puzzle rating ${S.rd > 0 ? '+' : ''}${Math.round(S.rd)} → <b>${rating()}</b></p>` : ''}
      ${endNotes(S.mv)}
      ${S.wrong.length ? `<p class="small muted">Missed (tap to study):</p><div class="t2-list">${S.wrong.map(w => `<button class="t2-drow" data-act="study" data-id="${esc(w.key)}"><b>${esc(w.chip || w.key)}</b><span class="small muted">${esc(w.kind === 'judge' ? 'Safe or blunder?' : w.kind === 'punq' ? 'Punish it or not?' : w.kind === 'thr' ? 'What is the threat?' : 'Find the move')}</span></button>`).join('')}</div>` : ''}
      ${sm.html || ''}`, 'right');
    const r = await cont(sm.contLabel || 'Done', sm.btns || []); chk();
    return { ...S, choice: r };
  }
  function openGame(url) { if (!url) return; if (H.openGame) H.openGame(url); else window.open(url, '_blank', 'noopener'); }

  /* ---- builders */
  function streamNext(group = null) {
    const env = liveEnv(group);
    return () => {
      if (!PUZ) return null;
      const r = pickPuzzle(env); if (!r) return null;
      env.served.add(r.p.id); env.last = r.gi;
      if (r.repeat) env.reused?.(r.p.id);
      chipG = group; const it = itemFor('pz/' + r.p.id); chipG = null; if (it) it.repeat = r.repeat;
      return it;
    };
  }
  function reviewItems() {
    const due = dueCards().slice(0, CAP).map(x => itemFor(x.id) || null).filter(Boolean);
    const room = Math.max(0, Math.min(CAP - due.length, DAILY.newMine - newMineToday()));
    const fresh = newMineCards().slice(0, room).map(itemFor).filter(Boolean);
    return [...due, ...fresh].map(it => it.type === 'pun' ? { ...it, kind: 'punq', decoy: false } : it);
  }
  /** Think first: due judgements first, then 60% real (blunder judgements, punish cards, threat cards) / 40% decoys (safe moves, quiet opponent moves) */
  function thinkItems(n = DAILY.think) {
    if (!MINE) return [];
    const out = dueJudges().slice(0, n).map(judgeItem).filter(Boolean);
    const used = new Set(out.map(x => x.key));
    const freshJ = MINE.judges.filter(j => !judgeSeen(j.id));
    const real = shuffle([...freshJ.filter(j => j.who === 'me' && j.verdict === 'blunder').map(j => () => judgeItem(j.id)),
      ...MINE.cards.filter(m => (m.type === 'pun' || m.type === 'thr') && !cardGet('mine/' + m.id)).map(m => () => m.type === 'pun' ? punqItem('mine/' + m.id) : itemFor('mine/' + m.id))]);
    const decoy = shuffle([...freshJ.filter(j => j.who === 'opp' || j.verdict === 'safe').map(j => () => judgeItem(j.id))]);
    while (out.length < n && (real.length || decoy.length)) {
      const pickReal = (Math.random() < 0.6 && real.length) || !decoy.length;
      const it = (pickReal ? real : decoy).shift()();
      if (it && !used.has(it.key)) { used.add(it.key); out.push(it); }
    }
    return out;
  }
  const mineMatch = (m, step) => (!step.type || m.type === step.type) && Object.entries(step.filter || {}).every(([k, v]) => k === 'n' || m[k] === v || (Array.isArray(m[k]) && m[k].includes(v)));

  /* ---- entry points for sessions */
  function startPuzzles(group = null) {
    run(async () => {
      const g = group == null ? null : +group;
      const chk = begin('puzzles', () => show(g == null ? 'home' : 'themes'));
      const label = g == null ? 'Puzzles' : PUZ.groups[g]?.name || 'Puzzles';
      while (true) {
        const S = await runSession({ label, next: streamNext(g), total: 10, how: 'newpz', summary: () => ({ btns: [['cont:more', 'Keep going (10 more)', '', true]] }) }, chk);
        if (S.choice !== 'more') break;
      }
      P.back();
    });
  }
  function startReview(c) {
    run(async () => {
      const chk = begin('review', () => c ? show('course', c.id) : show('home'));
      const items = (c ? dueCards().map(x => x.id).filter(id => id.startsWith(`ls/${c.id}.`)) : dueCards().map(x => x.id)).slice(0, CAP).map(itemFor).filter(Boolean);
      if (!items.length) { fb('<p>Nothing to review right now.</p>'); await cont('Back'); return P.back(); }
      await runSession({ label: c ? `Review · ${c.title}` : 'Review', items }, chk);
      P.back();
    });
  }
  function startLessonReview(c, l) {
    run(async () => {
      const chk = begin('review', () => show('course', c.id));
      const items = lessonCardIds(c, l).filter(id => isDue(PG('t2c')[id])).map(itemFor).filter(Boolean);
      await runSession({ label: `Review · ${l.title}`, items }, chk);
      P.back();
    });
  }
  function startDrill(c) {
    run(async () => {
      const chk = begin('drill', () => show('course', c.id));
      const items = Object.keys(c.cards).map(k => `ls/${c.id}.${k}`).filter(id => isDifficult(PG('t2c')[id])).map(itemFor).filter(Boolean);
      await runSession({ label: 'Difficult cards', items, how: 'practice', practice: true }, chk);
      P.back();
    });
  }
  function startOne(id, backTo) {
    run(async () => {
      const back = backTo || (curCourse && screen === 'course' ? (cc => () => show('course', cc.id))(curCourse) : () => show('home'));
      const chk = begin('one', back);
      const s = cardGet(id), it = id.includes('/pun/') ? punqItem(id) : itemFor(id);
      if (!it) return back();
      await runSession({ label: s ? 'Practise' : 'Your game', items: [it], how: s && !isDue(s) ? 'practice' : 'review', practice: !!s && !isDue(s), again: false }, chk);
      P.back();
    });
  }
  function startMistakes() {
    run(async () => {
      const chk = begin('mistakes', () => show('home'));
      const due = dueCards().map(x => x.id).filter(id => id.startsWith('mine/fix/'));
      const fresh = MINE.cards.filter(m => m.type === 'fix' && !cardGet('mine/' + m.id)).map(m => 'mine/' + m.id);
      const items = [...due, ...fresh].slice(0, 10).map(itemFor).filter(Boolean);
      if (!items.length) { fb('<p>No mistakes to fix right now. New ones arrive after your next games.</p>'); await cont('Back'); return P.back(); }
      await runSession({ label: 'My mistakes', items }, chk);
      P.back();
    });
  }

  /* ---- the daily session (BLUEPRINT 5): Reviews · 10 new puzzles · 5 Think first · lesson of the day */
  const BLOCKS = {
    rev: { name: 'Reviews', run: chk => { const items = reviewItems(); return items.length ? runSession({ label: 'Reviews', items, summary: false }, chk) : null; } },
    puz: { name: '10 new puzzles', run: (chk, forced) => { if (!PUZ) return null; const n = Math.max(0, DAILY.puz - (today().new || 0)) || (forced ? DAILY.puz : 0); return n ? runSession({ label: 'New puzzles', next: streamNext(), total: n, how: 'newpz', summary: false }, chk) : null; } },
    think: { name: '5 Think-first', run: (chk, forced) => { const n = Math.max(0, DAILY.think - (today().think || 0)) || (forced ? DAILY.think : 0); const items = n ? thinkItems(n) : []; return items.length ? runSession({ label: 'Think first', items, summary: false }, chk) : null; } },
  };
  /** opts (Today's session): {session: skip finished blocks even with only, pre: labels of parts already done (step bar), onDone: leave to} */
  function runDaily(only, opts = {}) {
    run(async () => {
      const leave = opts.onDone || (() => show('home')), pre = opts.pre || [];
      const chk = begin('daily', leave);
      const p = dailyPlan();
      const forced = !!only && !opts.session;
      const list = (only || ['rev', 'puz', 'think']).filter(b => forced || !p[{ rev: 'revDone', puz: 'puzDone', think: 'thinkDone' }[b]]);
      const tot = { asked: 0, ok: 0, rd: 0, wrong: [], mv: { up: 0, back: 0, gone: 0 } };
      for (let i = 0; i < list.length; i++) {
        const b = BLOCKS[list[i]];
        stepBar(i + pre.length, [...pre, ...list.map(x => BLOCKS[x].name)]);
        if (i > 0) {
          head('Train today', `Next: ${b.name}`, i, list.length);
          board(new Chess().fen(), 'white'); P.shapes = []; draw();
          fb(`<span class="eyebrow">Part ${i + 1} of ${list.length}</span><h3>${esc(b.name)}</h3><p class="small muted">${list[i] === 'think' ? 'Before you answer, look at every check and capture your opponent gets.' : list[i] === 'puz' ? 'Picked near your puzzle rating, weighted to your weak spots. Take your time: nothing here rewards speed.' : ''}</p>`);
          const v = await cont('Start', [['cont:stop', 'Stop for today']]); chk();
          if (v === 'stop') break;
        }
        const S = await b.run(chk, forced); chk();
        if (S) { tot.asked += S.asked; tot.ok += S.ok; tot.rd += S.rd; tot.wrong.push(...S.wrong); addMv(tot.mv, S.mv); }
        changed();
      }
      // end of the day's session
      $('#t2-steps').hidden = true;
      head('Train today', 'Done for today', 1, 1);
      play('done');
      if (tot.asked >= 5 && tot.ok / tot.asked >= 0.8) { try { H.confetti?.(); } catch {} }
      const lod = lessonOfDay(), pd = Object.keys(PG('t2x')).find(id => playDue(id));
      const r = await (async () => {
        fb(`<span class="eyebrow">Train today · done</span><h3>${tot.asked ? `${tot.ok} of ${tot.asked} right · ${pct(tot.ok / tot.asked)}` : 'Nothing was due'}</h3>
          ${tot.rd ? `<p>Puzzle rating ${tot.rd > 0 ? '+' : ''}${Math.round(tot.rd)} → <b>${rating()}</b></p>` : ''}
          ${endNotes(tot.mv)}
          ${tot.wrong.length ? `<p class="small muted">Missed (tap to study):</p><div class="t2-list">${tot.wrong.map(w => `<button class="t2-drow" data-act="study" data-id="${esc(w.key)}"><b>${esc(w.chip || w.key)}</b></button>`).join('')}</div>` : ''}
          ${lod && !today().less && !today().play ? `<div class="t2-more"><span class="eyebrow">One more thing · 5 min (optional)</span><p><b>${esc(lod.kind === 'playout' ? `Play out a win from your game vs ${lod.play.opp || '?'}` : `${lod.c.title}: ${lod.l.title}`)}</b></p></div>` : ''}
          ${pd ? '<p class="small">A play-out is due for a re-test.</p>' : ''}`, 'right');
        const btns = [];
        if (lod && !today().less && !today().play) btns.push(['cont:lod', lod.kind === 'playout' ? 'Play it out' : 'Start the lesson', '', true]);
        if (pd) btns.push(['cont:pd', 'Due play-out']);
        return cont('Done', btns);
      })(); chk();
      if (r === 'lod') return lod.kind === 'playout' ? startPlayout(lod.play, { mine: true, back: () => show('home') }) : startLessonGated(lod.c, lod.l, false);
      if (r === 'pd') { const ref = playRef(pd); if (ref) return startPlayout(ref.play, { ...ref, back: () => show('home') }); }
      leave();
    });
  }

  /* ================================================================ C. lesson player (Learn · Practise · Test) */
  async function runExample(ex, chk, k, n) {
    board(ex.fen, ex.side || sideOf(ex.fen));
    const moves = ex.moves || [], fens = [P.chess.fen()], lasts = [null], asked = new Set();
    let i = 0;
    const showAt = () => {
      if (i === 0) { P.shapes = []; draw(); return fb(`<span class="eyebrow">Example ${k} of ${n}</span><p>${rich(ex.setting || 'Watch how it is done.')}</p><p class="small muted">${moves.length ? 'Step through with Next.' : ''}</p>`); }
      const m = moves[i - 1];
      fb(`<span class="eyebrow">${m.mine ? 'Your side' : 'Opponent'}</span><div class="t2-mv"><b class="t2-san">${esc(moveLabel(fens[i - 1], m.san))}</b>${m.key ? ' <span class="t2-key">Key move</span>' : ''}${m.nag && m.nag !== '!' ? ` <span class="t2-nag">${esc(m.nag)}</span>` : ''}</div>${m.c ? `<p>${rich(m.c)}</p>` : ''}`);
      P.shapes = shapes(m.shapes); draw();
    };
    showAt();
    while (true) {
      const a = await nav(i < moves.length ? 'Next' : 'Continue', i > 0); chk();
      if (a === 'prev') { if (i > 0) { i--; P.chess = new Chess(fens[i]); P.last = lasts[i]; fens.length = lasts.length = i + 1; showAt(); } continue; }
      if (i >= moves.length) break;
      const m = moves[i];
      if (m.key && m.mine && !asked.has(i)) {
        asked.add(i);
        P.shapes = []; draw();
        fb(`<span class="eyebrow">Your turn</span><p>Find the key move${m.c ? '' : ''}. The arrow appears after one wrong try.</p>`);
        const r = await askMove({ want: m.uci, arrowAfter: 1, onWrong: (u, mv) => fb(`<span class="eyebrow" style="color:var(--blunder)">Not ${esc(mv.san)}</span><p class="small muted">Play the arrow move.</p>`, 'wrong') }); chk();
        if (!r.wrongs && !r.shown) play('right');
      } else { await wait(120); playUci(m.uci); }
      i++; fens.push(P.chess.fen()); lasts.push(P.last); showAt();
    }
    if (ex.keyText) { fb(`<span class="eyebrow">Takeaway</span><h3>${rich(ex.keyText)}</h3>`, 'plan'); await cont('Continue'); chk(); }
  }
  /** starting a NEW lesson while more than BACKLOG reviews wait: ask first. inline: show the notice on the Train page, else in the player */
  function startLessonGated(c, l, inline = true) {
    const n = dueCards().length;
    if (lstate(c, l) || n <= BACKLOG) return startLesson(c, l);
    const msg = `You have ${n} reviews waiting. Clear them first so they don't pile up.`;
    const host = inline ? (screen === 'home' ? $('#t2-home') : screen === 'course' ? $('#t2-course') : null) : null;
    if (host) {
      $$('.t2-backlog').forEach(x => x.remove());
      host.insertAdjacentHTML('afterbegin', `<div class="card t2-backlog" role="status"><p>${esc(msg)}</p><div class="controls"><button class="btn primary" data-act="review-all">Review now</button><button class="btn" data-act="learn-anyway" data-c="${esc(c.id)}" data-l="${esc(l.id)}">Learn anyway</button></div></div>`);
      window.scrollTo({ top: 0 });
      return;
    }
    run(async () => {
      const chk = begin('notice', () => show('home'));
      head('Train', 'Reviews waiting');
      board(new Chess().fen(), 'white'); actions([]);
      const v = await choose([['review', 'Review now', 'primary'], ['learn', 'Learn anyway']], `<span class="eyebrow">Reviews first</span><p>${esc(msg)}</p>`); chk();
      if (v === 'review') startReview(null); else startLesson(c, l);
    });
  }
  function startLesson(c, l) {
    curCourse = c;
    run(async () => {
      const chk = begin('lesson', () => show('course', c.id));
      const st0 = lstate(c, l), wasFinished = (st0?.st || 0) >= 2;
      const steps = ['Learn', 'Practise', ...(l.plays.length ? ['Test'] : [])];
      const title = l.title, label = `${c.title} · Lesson ${c.order.indexOf(l.id) + 1} of ${c.order.length}`;
      // 1. Learn (skipped when he comes back to a lesson whose learn step is done)
      if (!st0 || wasFinished) {
        stepBar(0, steps); head(`${label} · Learn`, title, 0, 3);
        board(l.exs[0]?.fen || new Chess().fen(), l.exs[0]?.side || 'white');
        fb(`<span class="eyebrow">Goal</span><h3>${rich(l.goal || title)}</h3>${l.rule ? `<div class="t2-rule"><span class="eyebrow">The rule</span><p>${rich(l.rule)}</p></div>` : ''}${l.intro ? `<p>${rich(l.intro)}</p>` : ''}
          ${wasFinished ? '<p class="small muted">You finished this lesson already: this is a refresher and does not change your reviews.</p>' : ''}`, 'plan');
        await cont('Start'); chk();
        for (let k = 0; k < l.exs.length; k++) { head(`${label} · Learn`, title, k / Math.max(1, l.exs.length), 3); await runExample(l.exs[k], chk, k + 1, l.exs.length); chk(); }
        if (!st0) put('t2l', lkey(c, l), { st: 1, n: 0 });
      }
      // 2. Practise: cards, judgements, cards from his games, then the practice set (resumable)
      stepBar(1, steps);
      const st1 = lstate(c, l) || { st: 1, n: 0 };
      const inSet = !wasFinished && (st1.n || 0) > 0;
      const S = { asked: 0, ok: 0 };
      if (!inSet) {
        let items = [...l.cards.map(k => itemFor(`ls/${c.id}.${k}`)), ...l.judges.map(j => judgeItem(`ls/${c.id}.${j}`))].filter(Boolean);
        for (const ms of l.mines) items.push(...(MINE?.cards || []).filter(m => mineMatch(m, ms)).slice(0, ms.n || 3).map(m => m.type === 'pun' ? punqItem('mine/' + m.id) : itemFor('mine/' + m.id)).filter(Boolean));
        const wrongIds = new Set(wasFinished ? [] : (st1.iw || []));
        const lessonCards = items.filter(it => it.src === 'ls' && it.kind === 'card');
        const skip = wasFinished ? 0 : Math.min(st1.ik || 0, items.length);
        if (skip) items = items.slice(skip);
        if (items.length) {
          fb(`<span class="eyebrow">Practise</span><h3>Now you find the moves</h3><p class="small muted">${plural(items.length, 'position')}${skip ? ` left (${skip} done already)` : ''}. ${wasFinished ? 'Practice only: your reviews do not change.' : 'Afterwards the cards join your reviews: they come back tomorrow.'}</p>`);
          board(items[0].fen, items[0].side); await cont('Start'); chk();
          // lesson cards: practice (they enter the SRS together below); judgements and own-game cards record as usual
          const R = await runSession({ label: `${label} · Practise`, title: () => title, items: items.map(it => ({ ...it, chip: it.src === 'ls' ? '' : it.chip })), summary: false,
            how: wasFinished ? 'practice' : 'lesson', practice: wasFinished,
            onItem: (k, it, res) => { if (res.result === 'wrong') wrongIds.add(it.key); if (!wasFinished) put('t2l', lkey(c, l), { st: 1, n: 0, ik: skip + k, iw: [...wrongIds] }); } }, chk);
          R.wrong.forEach(w => wrongIds.add(w.key));
          S.asked += R.asked; S.ok += R.ok;
          if (!wasFinished) srsLearn(lessonCards.map(it => it.key), wrongIds);
        } else if (!wasFinished && skip) srsLearn(lessonCards.map(it => it.key), wrongIds);
      }
      for (const set of l.sets) {
        const ids = (set.ids || []).map(String).filter(id => PUZ?.byId.has(id));
        if (!ids.length) continue;
        const start = wasFinished ? 0 : Math.min(st1.n || 0, ids.length);
        if (start >= ids.length) continue;
        fb(`<span class="eyebrow">Practice set</span><h3>${ids.length} puzzles: ${esc(PUZ.groups.find(g => g.id === set.theme)?.name || 'this motif')}</h3><p class="small muted">${start ? `You did ${start} already: carry on from puzzle ${start + 1}.` : 'Graded from easy to harder. You can leave and come back: the set remembers where you are.'}</p>`);
        await cont(start ? 'Carry on' : 'Start'); chk();
        const items = ids.slice(start).map(id => itemFor('pz/' + id)).filter(Boolean);
        await runSession({ label: `${label} · Practice set`, title: () => title, items, total: ids.length - start, how: wasFinished ? 'practice' : 'newpz', practice: wasFinished, again: false, summary: false,
          onItem: k => { if (!wasFinished) put('t2l', lkey(c, l), { st: 1, n: start + k }); } }, chk);
        if (!wasFinished) put('t2l', lkey(c, l), { st: 1, n: ids.length });
      }
      if (!wasFinished) { put('t2l', lkey(c, l), { st: 2, n: 0 }); dayAdd({ less: 1, ms: spent() }); changed(); }
      // 3. Test: the play-out against the engine
      if (l.plays.length) {
        stepBar(2, steps); head(`${label} · Test`, title, 2, 3);
        const pl = c.plays[l.plays[0]];
        board(pl.fen, pl.side);
        fb(`<span class="eyebrow">Test · play it out</span><p>${rich(pl.text || 'Play it out against the computer.')}</p><p class="small muted">Goal: ${esc(pl.goal === 'draw' ? 'hold the draw' : 'win')}.</p>`);
        const v = await cont('Play it now', [['cont:later', 'Later']]); chk();
        if (v !== 'later') return startPlayout(pl, { id: `ls/${c.id}.${l.plays[0]}`, lesson: l, course: c, back: () => show('course', c.id), after: () => lessonFinish(c, l, wasFinished) });
      }
      lessonFinish(c, l, wasFinished);
    });
  }
  function lessonFinish(c, l, wasFinished) {
    run(async () => {
      const chk = begin('lesson', () => show('course', c.id));
      $('#t2-steps').hidden = true;
      const nl = nextLesson(c), n = l.cards.length;
      head(c.title, l.title, 1, 1);
      play('done'); if (!wasFinished) { try { H.confetti?.(); } catch {} }
      board(l.exs[0]?.fen || new Chess().fen(), l.exs[0]?.side || 'white');
      fb(`<span class="eyebrow">Lesson finished</span><h3>${esc(l.title)}</h3>${l.rule ? `<div class="t2-rule"><span class="eyebrow">Remember</span><p>${rich(l.rule)}</p></div>` : ''}
        <p>${wasFinished ? 'Refresher done.' : n ? `${plural(n, 'card')} added to your reviews. They come back tomorrow.` : ''}</p>${nl ? `<p class="small muted">Next: ${esc(nl.title)}</p>` : ''}`, 'right');
      const v = await cont(nl ? 'Next lesson' : 'Back to the course', nl ? [['cont:course', 'Back to the course']] : []); chk();
      if (v !== 'course' && nl) return startLessonGated(c, nl, false);
      show('course', c.id);
    });
  }

  /* ================================================================ E. play-outs (T7 installs the runner with T2.setPlayout) */
  function playRef(id) {
    if (id.startsWith('ls/')) { const [cid, ...r] = id.slice(3).split('.'), pid = r.join('.'), c = courseById(cid), pl = c?.plays[pid]; return pl ? { play: { ...pl, id }, id, course: c, lesson: c.lessonOf.get(pid) } : null; }
    const p = MINE?.playById.get(id); return p ? { play: p, id, mine: true } : null;
  }
  function startPlayout(play, o = {}) {
    const id = o.id || play.id, back = o.back || (() => show(curCourse ? 'course' : 'home', curCourse?.id));
    run(async () => {
      const chk = begin('playout', back);
      head(o.lesson ? `Test · ${o.lesson.title}` : 'Play it out', o.lesson ? o.lesson.title : gameChip(play), 0, 0, o.mine ? gameChip(play) : '');
      let res = null;
      if (EXT.playout) res = await EXT.playout({ ...play, id }, { lesson: o.lesson, course: o.course, ui: UI, back, chk });
      else {
        board(play.fen, play.side);
        fb(`<span class="eyebrow">Play-out</span><p>${rich(play.text || 'Play this position out against the computer.')}</p><p class="small muted">The play-out board arrives with the next part of the rebuild (T7).</p>${H.dev ? '<p class="small">Dev: pretend a result to test the schedule.</p>' : ''}`);
        const v = await cont('Back', H.dev ? [['cont:pass', 'Pretend: won'], ['cont:fail', 'Pretend: failed']] : []);
        res = v === 'pass' ? { ok: true } : v === 'fail' ? { ok: false } : { aborted: true };
      }
      chk();
      if (res && !res.aborted) { playResult(id, !!res.ok, { lesson: !o.mine }); if (res.ok) { try { H.confetti?.(); } catch {} } }
      if (o.after) return o.after(res);
      back();
    });
  }

  /* ================================================================ events */
  function onClick(e) {
    const t = e.target;
    const pa = t.closest('[data-pa]');
    if (pa) {
      const [a, v] = pa.dataset.pa.split(':');
      if (a === 'hint') hint(false);
      if (a === 'showmv') hint(true);
      if (a === 'cont') doCont(v);
      if (a === 'prev') doNav('prev');
      if (a === 'next') doNav('next');
      if (a === 'nothing') extraBtn('nothing');
      if (a === 'whyback') P.whyRestore?.();
      if (a === 'flip') { P.flipped = !P.flipped; draw(); }
      if (a === 'more') openMenu();
      return;
    }
    const ch = t.closest('[data-choice]'); if (ch && P.choice) return P.choice(ch.dataset.choice);
    const wy = t.closest('[data-why]'); if (wy && P.ctx) return showWhy(P.ctx, wy.dataset.why, wy.dataset.fen);
    const mi = t.closest('[data-menu]'); if (mi) return menuAction(mi.dataset.menu);
    if (!t.closest('#t2-menu')) closeMenu();
    const tab = t.closest('[data-tab]'); if (tab && curCourse) { H.store.set('t2tab.' + curCourse.id, tab.dataset.tab); return renderCourse(curCourse, true); }
    const b = t.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const c = courseById(b.dataset.c), l = c?.lessons[b.dataset.l];
    switch (b.dataset.act) {
      case 'home': return show('home');
      case 'course': if (c) curCourse = c; return show(curCourse ? 'course' : 'home', curCourse?.id);
      case 'back': return P.back ? P.back() : show('home');
      case 'daily': return runDaily();
      case 'lod': { const x = lessonOfDay(); if (!x) return; return x.kind === 'playout' ? startPlayout(x.play, { mine: true, back: () => show('home') }) : startLessonGated(x.c, x.l); }
      case 'learn': if (c && l) startLessonGated(c, l); return;
      case 'learn-anyway': if (c && l) startLesson(c, l); return;
      case 'review-all': return startReview(null);
      case 'review': if (c) { curCourse = c; startReview(c); } return;
      case 'review-lesson': if (c && l) startLessonReview(c, l); return;
      case 'lplay': if (c && l && l.plays[0]) { curCourse = c; startPlayout(c.plays[l.plays[0]], { id: `ls/${c.id}.${l.plays[0]}`, lesson: l, course: c, back: () => show('course', c.id) }); } return;
      case 'drill': if (c) startDrill(c); return;
      case 'study': return studyItem(b.dataset.id);
      case 'one': return startOne(b.dataset.id);
      case 'pplay': { const p = MINE?.playById.get(b.dataset.id); if (p) { const cc = curCourse; startPlayout(p, { mine: true, back: () => cc ? show('course', cc.id) : show('home') }); } return; }
      case 'puzzles': return startPuzzles(null);
      case 'theme': return startPuzzles(b.dataset.g);
      case 'themes': return show('themes');
      case 'stats': return show('stats');
      case 'mistakes': return startMistakes();
      case 'playwin': { const p = (MINE?.plays || []).filter(x => x.id.startsWith('cv/') && !PG('t2x')[x.id]?.ok).sort((a, b) => (b.end || 0) - (a.end || 0))[0]; if (p) startPlayout(p, { mine: true, back: () => show('home') }); else toast('All your won positions are converted. New ones arrive after your next games.'); return; }
    }
  }
  function onKey(e) {
    if (!ROOT || ROOT.offsetParent === null || $('#t2-player').hidden) return;
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return closeMenu();
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest?.('button') && e.key === 'Enter') return;
      if (P.cont) { e.preventDefault(); return doCont(); }
      if (P.nav) { e.preventDefault(); return doNav('next'); }
      return;
    }
    if (e.key === 'ArrowRight' && P.nav) { e.preventDefault(); return doNav('next'); }
    if (e.key === 'ArrowLeft' && P.nav) { e.preventDefault(); return doNav('prev'); }
    const k = e.key.toLowerCase();
    if (k === 'h' && P.expect) return hint(false);
    if (k === 's' && P.expect) return hint(true);
    if (k === 'f') { P.flipped = !P.flipped; return draw(); }
  }
  function onToggle(e) { const d = e.target.closest?.('details.t2-chap'); if (d && curCourse) H.store.set(`t2ch.${curCourse.id}.${d.dataset.ch}`, d.open); }

  /* ================================================================ init + API */
  function init({ root, data = {}, hooks = {} }) {
    ROOT = root;
    Object.assign(H, Object.fromEntries(Object.entries(hooks).filter(([, v]) => v != null)));
    if (!H.Chessground || !H.record || !H.progress) throw new Error('T2.init needs hooks.Chessground, hooks.record and hooks.progress');
    for (const k of KINDS) H.progress[k] ||= {};
    const tr = data.train || {};
    COURSES = (tr.courses || []).filter(c => c && c.lessons).map(prepCourse)
      .sort((a, b) => (COURSE_ORDER.indexOf(a.id) + 1 || 99) - (COURSE_ORDER.indexOf(b.id) + 1 || 99));
    DRAFT = !!tr.draft || COURSES.some(c => c.draft);
    PUZ = prepPuzzles(data.puzzles);
    MINE = prepMine(data.mine);
    seenCache = null; loadMap = null;
    if (!ROOT.dataset.t2) {
      ROOT.dataset.t2 = '1';
      ROOT.addEventListener('click', onClick);
      ROOT.addEventListener('toggle', onToggle, true);
      document.addEventListener('keydown', onKey);
    }
    show('home');
    return api;
  }
  const UI = { begin, head, fb, actions, cont, nav, choose, toast, rich, esc, stepBar, askMove,
    board: (fen, side, opts) => board(fen, side, opts), draw, get chess() { return P.chess; }, set shapes(s) { P.shapes = s; draw(); }, get cg() { return cg; }, playUci, playSan, flash, play };
  const api = {
    init, show, refresh, startDaily: () => runDaily(), runDaily, startOne, todayTasks, dueSummary, dailyPlan, now, endOfDay, posKey, KINDS, forecast, nextReview, intervalText, BACKLOG, GLOSSARY: GLOSSARY.map(([id, t, d]) => [id, t, d]),
    courses: () => COURSES, puzzles: () => PUZ, mine: () => MINE, groups: () => PUZ?.groups || [], groupAccuracy, groupWeights, rating,
    setPlayout(fn) { EXT.playout = fn; }, setScreen(name, fn) { EXT.screens[name] = fn; if (screen === name) renderExtScreen(name); },
    addSection(s) { sections.push(s); if (screen === 'course') renderCourse(curCourse, true); },
    addHomeBlock(fn) { homeBlocks.push(fn); if (screen === 'home' && ROOT) renderHome(); },
    startLesson, startPuzzles, startReview, startPlayout, startMistakes, studyItem,
    srs: { get: cardGet, answer: srsAnswer, last: () => lastSched, note: schedNote, BACKLOG, learn: srsLearn, isDue, isMature, isDifficult, dueCards, dueJudges, judgeResult, playResult, playDue, seen: () => seenSet(), lessonInfo, courseInfo, nextLesson, lessonOfDay, IV, MATURE, RETIRED },
    test: { gate: startLessonGated, simulate, move: u => onUserMove(u.slice(0, 2), u.slice(2, 4)), state: () => ({ mode: P.mode, expect: !!P.expect, cont: !!P.cont, nav: !!P.nav, choice: !!P.choice, fen: P.chess?.fen() }), pickPuzzle, liveEnv, thinkItems, reviewItems, itemFor, judgeItem },
    ui: UI, rich, toast,
    get hooks() { return H; },
  };
  return api;
})();
