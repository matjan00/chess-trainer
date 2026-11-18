/* ============================================================================================
   W2 core: the new Watch tab (Watch next, Continue watching, Yours, 3 course shelves, Browse) and the video player.
   Spec: watch2/PLAN.md. Plain script, no imports; everything lives inside the W2 object, so it can be pasted into the
   app's module script (placeholder W2_JS) next to O2 and T2 without name clashes. See watch2/INTEGRATION.md.

   W2.init({ root, data, hooks })
     root   the #w2 element from w2.html
     data   { tube: TUBE }             tube.json ({videos, topics, creators, ...}); a video with no length just shows "Playlist"
     hooks  record, progress           required, as for O2/T2 (progress.vid is read and written: kind 'vid', same fields as before:
                                       w watched, l saved for later, o last opened, p/d position/length in seconds, v/vi playlist
                                       video; NEW optional field k = the one-line key idea)
            store                      optional {get,set} with the 'ct.' prefix (remembers short/long, hide watched; saves progress)
            needs()                    -> [{topic, title, why}] what the games need most (the app's watchNeeds)
            courses()                  -> [{id, title}] the opening courses (O2.courses())
            courseGames(id)            -> number of games played in that course (optional)
            goTrain(courseId)          open Train on that course ('convert' 'think' 'tactics' 'endgames')   (optional)
            goOpenings(courseId)       open Openings on that course                                          (optional)
            onChange()                 called after the player recorded progress or closed (refresh Today)   (optional)
            agoWords(seconds)          optional "3 days ago" formatter
   Entry points: W2.refresh() (tab opened / progress synced), W2.openVideo(id), W2.isOpen(), W2.close(),
   W2.todayPick() -> {kind:'resume'|'next', id, v, need} | null, W2.renderToday(box), W2.KINDS = ['vid'].
   ============================================================================================ */
const W2 = (() => {
  'use strict';
  const KINDS = ['vid'];
  const SHORT = 900, NEXT_MAX = 1200;                 // "Up to 15 min" and the Watch next length cap (20 min), in seconds
  const KIND_NAME = { lesson: 'Lesson', play: 'Speedrun', course: 'Course' };
  // what to practise after a video: topic -> [Train course id (from train2.json), label]
  const PAIR = { convert: ['convert', 'Win the won game'], thinking: ['think', 'Think first'], tactics: ['tactics', 'Tactics ABC'], endgame: ['endgames', 'Essential endgames'] };
  const H = {
    record: null, progress: null,
    store: { get(k, d) { try { const v = localStorage.getItem('ct.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch {} } },
    needs: () => [], courses: () => [], courseGames: () => 0, goTrain: null, goOpenings: null, onChange: null, agoWords: null,
  };
  let ROOT = null, HOME = null, PLAYER = null, TUBE = { videos: [] }, VIDS = [], VID_BY = {};
  const S = { len: 'short', hide: true, topic: '', more: false, yours: '', yoursAll: false, browse: false, course: null, open: null, pos: null, heard: false };
  const $ = (s, r = PLAYER) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const fmtLen = t => { if (!t) return ''; const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const lenWords = t => t >= 3600 ? `${Math.floor(t / 3600)} h ${Math.round(t % 3600 / 60)} min` : `${Math.max(1, Math.round(t / 60))} min`;
  function ago(s) {
    if (H.agoWords) return H.agoWords(s);
    const d = Math.floor((Date.now() / 1000 - s) / 86400);
    return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  }

  /* ---------------------------------------------------------------- progress ('vid' kind, same format as before) */
  const vp = () => H.progress.vid || (H.progress.vid = {});
  const seen = id => !!vp()[id]?.w;
  const later = id => !!vp()[id]?.l;
  const when = id => vp()[id]?.o || vp()[id]?.t || 0;
  const unfinished = id => { const x = vp()[id]; return !!x && !x.w && (x.p || 0) >= 30; };   // more than half a minute in, not marked watched
  const history = () => Object.keys(vp()).filter(id => VID_BY[id] && (vp()[id].o || vp()[id].w)).sort((a, b) => when(b) - when(a));
  const resumeId = () => history().find(unfinished);
  function bar(v) {
    const x = vp()[v.id]; if (!x || x.w) return '';
    let pct = 0;
    if (v.pl && v.cnt && x.vi != null) pct = (x.vi + (x.d ? (x.p || 0) / x.d : 0)) / v.cnt * 100;   // the series bar needs v.cnt (playlist size) in tube.json
    else if (x.p && x.d) pct = x.p / x.d * 100;
    return pct > 0 ? `<span class="w2-vbar"><i style="width:${Math.min(100, Math.round(pct))}%"></i></span>` : '';
  }
  const series = v => { const x = vp()[v.id]; return v.pl && x && x.vi != null && !x.w ? `video ${x.vi + 1}${v.cnt ? ` of ${v.cnt}` : ''}` : ''; };
  const stopped = id => { const x = vp()[id], v = VID_BY[id]; return `${v.pl && x.vi != null ? `video ${x.vi + 1}${v.cnt ? ` of ${v.cnt}` : ''}, ` : ''}${fmtLen(Math.round(x.p))}${x.d ? ` of ${fmtLen(Math.round(x.d))}` : ''}`; };
  function rec(id, change) {
    const { t, ...cur } = vp()[id] || {};
    H.record('vid', id, { w: 0, l: 0, ...cur, ...change });
    H.store.set('progress', H.progress);
  }

  /* ---------------------------------------------------------------- picking */
  const isShort = v => !v.pl && v.kind !== 'course' && v.len > 0 && v.len <= SHORT;
  const score = (v, topic) => v.r * (v.lvl === 2 ? 1 : v.lvl === 1 ? .4 : .7) * (topic && v.top[0] === topic ? 1.6 : 1) * (seen(v.id) ? .05 : 1);
  const pick = (test, topic) => VIDS.filter(test).sort((a, b) => score(b, topic) - score(a, topic));
  const needs = () => { try { return H.needs() || []; } catch { return []; } };
  // Watch next: the first need that has an unwatched level-2 single video of up to 20 minutes (never a course or a playlist)
  function nextPick() {
    const skip = resumeId(), ok = v => !seen(v.id) && v.id !== skip && v.lvl === 2 && !v.pl && v.kind !== 'course' && v.len > 0 && v.len <= NEXT_MAX;
    for (const n of needs()) {
      const v = pick(x => ok(x) && x.top.includes(n.topic), n.topic)[0];
      if (v) return { kind: 'next', id: v.id, v, need: n };
    }
    return null;
  }
  // what to do after this video: its opening course, else the Train course for its main topic
  function practise(v) {
    const c = (H.courses() || []).find(c => v.op.includes(c.id));
    if (c && H.goOpenings) return { to: 'op', id: c.id, label: c.title };
    const t = v.top.find(t => PAIR[t]);
    if (t && H.goTrain) return { to: 'train', id: PAIR[t][0], label: PAIR[t][1] };
    return null;
  }
  function go(p) {
    if (!p) return;
    close();
    if (p.to === 'op') H.goOpenings(p.id); else H.goTrain(p.id);
  }

  /* ---------------------------------------------------------------- the tab */
  const thumb = (v, id) => `<span class="w2-vth"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(id || v.th || v.id)}/hq2.jpg">${bar(v)}${v.pl ? '<span class="w2-vlen">Playlist</span>' : v.len ? `<span class="w2-vlen">${fmtLen(v.len)}</span>` : ''}</span>`;
  function card(v) {
    const k = vp()[v.id]?.k, sr = series(v);
    return `<button class="w2-vc${seen(v.id) ? ' watched' : ''}" data-vid="${esc(v.id)}">${thumb(v)}<span class="w2-vt">${esc(v.t)}</span><span class="w2-vm">${esc(v.ch)}${v.y ? ` · ${v.y}` : ''}${sr ? ` · ${sr}` : ''}</span><span class="w2-vm"><b>${plural(v.n, 'recommendation')}</b> on Reddit</span>${k ? `<span class="w2-vk">“${esc(k)}”</span>` : ''}</button>`;
  }
  const bigCard = (cls, v, eyebrow, line, body, acts, thumbId) => `<div class="card w2-big ${cls}"><button class="w2-vc" data-vid="${esc(v.id)}" aria-label="${esc(v.t)}">${thumb(v, thumbId)}</button><div><span class="eyebrow">${eyebrow}</span><h3>${esc(v.t)}</h3><div class="small muted">${line}</div>${body}<div class="w2-bigacts">${acts}</div></div></div>`;
  function render() {
    if (!HOME) return;
    if (!VIDS.length) { HOME.innerHTML = '<h2>Watch</h2><p class="w2-empty">No videos yet. They arrive with the next update.</p>'; return; }
    let h = '<h2>Watch</h2><p class="muted w2-sub">One good video, then practise it.</p>';
    const rid = resumeId();
    if (rid) {
      const v = VID_BY[rid];
      h += bigCard('', v, `Continue watching · ${ago(when(rid) / 1000)}`, `${esc(v.ch)} · you stopped at ${stopped(rid)}`, '', `<button class="btn primary" data-vid="${esc(v.id)}">Resume</button>`, vp()[rid].v);
    }
    const np = nextPick();
    if (np) {
      const v = np.v, pr = practise(v);
      h += bigCard('next', v, `Watch next · ${esc(np.need.title.toLowerCase())}`, `${esc(v.ch)} · ${lenWords(v.len)} · ${plural(v.n, 'recommendation')} on Reddit`, np.need.why ? `<p>${esc(np.need.why)}</p>` : '',
        `<button class="btn primary" data-vid="${esc(v.id)}">Watch</button>${pr ? `<span class="small muted" style="align-self:center">Then practise: ${esc(pr.label)}</span>` : ''}`);
    } else if (!rid) h += '<p class="w2-empty">No short video to suggest right now. Browse below.</p>';
    HOME.innerHTML = h + yoursHtml() + coursesHtml() + browseHtml();
  }
  function yoursHtml() {
    const hist = history().map(id => VID_BY[id]), lat = VIDS.filter(v => later(v.id) && !seen(v.id));
    if (!hist.length && !lat.length) return '';
    const mode = S.yours === 'hist' && hist.length || S.yours === 'later' && lat.length ? S.yours : lat.length ? 'later' : 'hist';
    const list = mode === 'later' ? lat : hist, shown = S.yoursAll ? list : list.slice(0, 8);
    return `<section><div class="w2-sh"><h3>Yours</h3><div class="seg" role="group" aria-label="Your videos"><button data-yours="later" aria-pressed="${mode === 'later'}">Saved (${lat.length})</button><button data-yours="hist" aria-pressed="${mode === 'hist'}">History (${hist.length})</button></div></div>
      <div class="w2-row">${shown.map(card).join('')}</div>${list.length > shown.length ? `<button class="btn" data-act="yoursall">Show all ${list.length}</button>` : ''}</section>`;
  }
  function coursesHtml() {
    const cs = H.courses() || []; if (!cs.length) return '';
    let h = '<section><div class="w2-sh"><h3>Your courses</h3></div>';
    for (const c of cs) {
      const all = pick(v => v.op.includes(c.id)), list = all.filter(v => !(S.hide && seen(v.id))), n = all.length, open = S.course === c.id, g = H.courseGames(c.id) || 0;
      h += `<button class="card w2-crow" data-course="${esc(c.id)}" aria-expanded="${open}"><span><b>${esc(c.title)}</b><span class="small muted"> · ${n === 0 ? 'no videos yet' : n < 4 ? `only ${plural(n, 'video')} found` : plural(n, 'video')}${g ? ` · you played it in ${plural(g, 'game')}` : ''}</span></span><span class="small muted">${open ? 'Hide' : 'Show'}</span></button>`;
      if (open) h += `<div class="w2-cbody">${list.length ? `<div class="w2-row">${list.slice(0, 4).map(card).join('')}</div>` : '<p class="w2-empty">Nothing new here.</p>'}${n > 4 ? `<button class="btn" data-seeall="op:${esc(c.id)}">See all ${n}</button>` : ''}</div>`;
    }
    return h + '</section>';
  }
  function browseHtml() {
    let h = `<section><div class="w2-sh"><h3>Browse all ${VIDS.length}</h3><button class="btn" data-act="browse" aria-expanded="${S.browse}">${S.browse ? 'Hide' : 'Show'}</button></div>`;
    if (!S.browse) return h + '</section>';
    const test = S.topic.startsWith('op:') ? v => v.op.includes(S.topic.slice(3)) : S.topic.startsWith('ch:') ? v => v.ch === S.topic.slice(3) : S.topic ? v => v.top.includes(S.topic) : () => true;
    const lenOk = v => S.len === 'all' || (S.len === 'short' ? isShort(v) : !isShort(v));
    const all = pick(v => test(v) && lenOk(v) && !(S.hide && seen(v.id))), shown = S.more ? all : all.slice(0, 24);
    const topics = Object.entries(TUBE.topics || {}), cs = H.courses() || [];
    const chip = (k, nm) => `<button data-chip="${esc(k)}" aria-pressed="${k === S.topic}">${esc(nm)}</button>`;
    const creators = (TUBE.creators || []).map(([ch]) => ch);
    if (S.topic.startsWith('ch:') && !creators.includes(S.topic.slice(3))) creators.push(S.topic.slice(3));
    h += `<div class="w2-tools"><div class="seg" role="group" aria-label="Length"><button data-len="short" aria-pressed="${S.len === 'short'}">Up to 15 min</button><button data-len="long" aria-pressed="${S.len === 'long'}">Long courses</button></div>
      <label><input type="checkbox" id="w2-hide"${S.hide ? ' checked' : ''}> Hide watched</label></div>
      <div class="w2-lbl">Topic</div><div class="w2-chips">${chip('', 'All')}${topics.map(([k, nm]) => chip(k, nm)).join('')}${cs.map(c => chip('op:' + c.id, c.title)).join('')}</div>
      <div class="w2-lbl">Teacher</div><div class="w2-chips">${creators.map(ch => chip('ch:' + ch, ch)).join('')}</div>
      <div class="small muted" style="margin-top:10px">${plural(all.length, 'video')}. Picked from Reddit threads where players asked for videos.</div>
      ${all.length ? `<div class="w2-grid">${shown.map(card).join('')}</div>` : '<p class="w2-empty">Nothing here with these filters.</p>'}
      ${all.length > shown.length ? `<button class="btn w2-more" data-act="more">Show all ${all.length}</button>` : ''}`;
    return h + '</section>';
  }
  function onHome(e) {
    const t = e.target.closest('[data-vid],[data-yours],[data-course],[data-seeall],[data-chip],[data-len],[data-act]'); if (!t) return;
    const d = t.dataset;
    if (d.vid) return openVideo(d.vid);
    if (d.yours) { S.yours = d.yours; S.yoursAll = false; }
    else if (d.course) S.course = S.course === d.course ? null : d.course;
    else if (d.seeall) { S.browse = true; S.topic = d.seeall; S.len = 'all'; S.more = false; }
    else if (d.chip != null) { S.topic = d.chip; S.more = false; }
    else if (d.len) { S.len = d.len; S.more = false; H.store.set('wlen2', S.len); }
    else if (d.act === 'browse') S.browse = !S.browse;
    else if (d.act === 'more') S.more = true;
    else if (d.act === 'yoursall') S.yoursAll = true;
    render();
    if (d.seeall) HOME.querySelector('[data-act="browse"]')?.scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- the player (moved here from app.html) */
  function openVideo(id) {
    const v = VID_BY[id]; if (!v) return;
    S.open = id;
    // start where you stopped (a few seconds back), and in a playlist on the video you were on
    const x = vp()[id] || {}, back = !x.w && x.p >= 30 ? Math.floor(x.p - 5) : 0;
    const src = v.pl ? (x.v && !x.w ? `${x.v}?list=${v.pl}&start=${back}&` : `videoseries?list=${v.pl}&`) : `${id}?start=${back}&`;
    S.pos = { p: x.p || 0, d: x.d || 0, v: x.v, vi: x.vi, saved: Date.now() };
    $('#w2-frame').innerHTML = navigator.onLine
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${src}rel=0&autoplay=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${esc(v.t)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : '<div class="off">Videos need an internet connection.</div>';
    rec(id, { o: Date.now() });
    listen();
    const topicNames = v.top.map(t => TUBE.topics?.[t]).filter(Boolean);
    $('#w2-peyebrow').textContent = [KIND_NAME[v.kind], ...topicNames].filter(Boolean).join(' · ');
    $('#w2-pt').textContent = v.t;
    $('#w2-pmeta').textContent = `${v.ch}${v.y ? ` · ${v.y}` : ''}${v.pl ? ' · playlist' : v.len ? ` · ${lenWords(v.len)}` : ''} · recommended ${plural(v.n, 'time')} on Reddit`;
    $('#w2-pwhy').textContent = v.why || '';
    $('#w2-pyt').href = v.pl ? `https://www.youtube.com/playlist?list=${v.pl}` : `https://www.youtube.com/watch?v=${id}`;
    $('#w2-prd').href = `https://www.reddit.com/${v.rd}`; $('#w2-prd').hidden = !v.rd;
    $('#w2-keyin').value = vp()[id]?.k || '';
    buttons();
    PLAYER.hidden = false;
    $('#w2-pclose').focus({ preventScroll: true });
  }
  function buttons() {
    const id = S.open; if (!id) return;
    const w = seen(id), pr = practise(VID_BY[id]);
    $('#w2-pwatched').setAttribute('aria-pressed', w); $('#w2-pwatched').textContent = w ? 'Watched ✓' : 'Mark as watched';
    $('#w2-plater').setAttribute('aria-pressed', later(id)); $('#w2-plater').textContent = later(id) ? 'Saved for later ✓' : 'Watch later';
    const b = $('#w2-ppractise'); b.hidden = !pr; b.textContent = pr ? `Now practise: ${pr.label}` : ''; b.classList.toggle('primary', w);   // never forced; the main button once watched
    $('#w2-key').hidden = !w;
  }
  function setField(field) { const id = S.open; rec(id, { [field]: vp()[id]?.[field] ? 0 : 1 }); buttons(); }
  function saveKey() {
    const id = S.open; if (!id) return;
    const k = $('#w2-keyin').value.trim().slice(0, 140);
    if (k === (vp()[id]?.k || '')) return;
    rec(id, { k });
  }
  // The YouTube player reports where it is (postMessage "infoDelivery") once we tell it we're listening.
  // The position is saved every 30 seconds and when the player closes; 90% of a single video counts as watched.
  function listen() {
    const f = $('#w2-frame iframe'); if (!f) return;
    let tries = 0;
    const hello = () => { if (S.heard || !f.isConnected || tries++ > 20) return; f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); setTimeout(hello, 500); };
    S.heard = false;
    f.addEventListener('load', hello);
  }
  function savePos(force) {
    const id = S.open, q = S.pos; if (!id || !q || !q.p) return;
    if (!force && Date.now() - q.saved < 30000) return;
    q.saved = Date.now();
    const v = VID_BY[id], done = !v.pl && q.d && q.p >= q.d * .9;
    rec(id, { p: Math.round(q.p), d: Math.round(q.d), ...(v.pl ? { v: q.v, vi: q.vi } : {}), ...(done ? { w: 1 } : {}) });
    if (done) buttons();
  }
  function onInfo(info) {   // one "infoDelivery" message from the YouTube player (the dev page's fake player calls this too)
    if (!info || !S.open) return;
    S.heard = true;
    const q = S.pos;
    if (info.videoData?.video_id && info.videoData.video_id !== q.v) {   // the playlist moved on to another video
      if (q.v && VID_BY[S.open].pl) { q.p = 0; q.d = 0; }
      q.v = info.videoData.video_id;
    }
    if (typeof info.playlistIndex === 'number') q.vi = info.playlistIndex;
    if (typeof info.duration === 'number' && info.duration > 0) q.d = info.duration;
    if (typeof info.currentTime === 'number' && info.currentTime > 0) { q.p = info.currentTime; savePos(false); }
  }
  function close() {
    if (!PLAYER || PLAYER.hidden) return;
    saveKey(); savePos(true);
    PLAYER.hidden = true; $('#w2-frame').innerHTML = ''; S.open = null;   // removing the frame stops the video
    if (ROOT.offsetParent !== null) render();
    H.onChange?.();
  }

  /* ---------------------------------------------------------------- Today */
  function todayPick() {
    const rid = resumeId();
    return rid ? { kind: 'resume', id: rid, v: VID_BY[rid], need: null } : nextPick();
  }
  function renderToday(box) {
    const p = todayPick();
    box.hidden = !p;
    if (!p) return null;
    const v = p.v;
    box.innerHTML = p.kind === 'resume'
      ? `<span class="w2-vth"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(vp()[p.id].v || v.th || v.id)}/hq2.jpg">${bar(v)}</span><div><span class="eyebrow">Continue watching</span><h3>${esc(v.t)}</h3><div class="small muted">${esc(v.ch)} · you stopped at ${stopped(p.id)}</div></div>`
      : `<span class="w2-vth"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(v.th || v.id)}/hq2.jpg"><span class="w2-vlen">${fmtLen(v.len)}</span></span><div><span class="eyebrow">Watch next · ${esc(p.need.title.toLowerCase())}</span><h3>${esc(v.t)}</h3><div class="small muted">${esc(v.ch)} · ${lenWords(v.len)} · recommended ${plural(v.n, 'time')} on Reddit</div></div>`;
    box.onclick = () => openVideo(p.id);
    return p;
  }

  /* ---------------------------------------------------------------- init */
  function init({ root, data, hooks }) {
    Object.assign(H, hooks || {});
    ROOT = root; HOME = root.querySelector('#w2-home');
    PLAYER = document.getElementById('w2-player');
    document.body.appendChild(PLAYER);   // the player must work from Today too, so it lives outside the (hidden) tab
    TUBE = data?.tube || { videos: [] }; VIDS = TUBE.videos || []; VID_BY = Object.fromEntries(VIDS.map(v => [v.id, v]));
    vp();
    S.len = H.store.get('wlen2', 'short'); S.hide = H.store.get('whide2', true);
    HOME.addEventListener('click', onHome);
    HOME.addEventListener('change', e => { if (e.target.id === 'w2-hide') { S.hide = e.target.checked; H.store.set('whide2', S.hide); render(); } });
    $('#w2-pwatched').onclick = () => setField('w');
    $('#w2-plater').onclick = () => setField('l');
    $('#w2-ppractise').onclick = () => { const id = S.open; if (id) go(practise(VID_BY[id])); };
    $('#w2-keysave').onclick = () => { saveKey(); $('#w2-keysave').textContent = 'Saved ✓'; setTimeout(() => { $('#w2-keysave').textContent = 'Save'; }, 1500); };
    $('#w2-keyin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#w2-keysave').click(); });
    $('#w2-pclose').onclick = close;
    PLAYER.onclick = e => { if (e.target === PLAYER) close(); };
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) savePos(true); });
    addEventListener('message', e => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || !S.open) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      onInfo(m?.info);
    });
    render();
  }
  return { init, KINDS, refresh: () => { if (HOME && (!PLAYER || PLAYER.hidden)) render(); }, openVideo, close, isOpen: () => !!PLAYER && !PLAYER.hidden, todayPick, renderToday, onInfo, practise: id => practise(VID_BY[id]) };
})();
