// tiny CDP helper for the o3 e2e (node, global WebSocket/fetch)
const fs = require('fs');
const OUT = __dirname;
exports.connect = async function (port = 9333, url) {
  let tabs = await (await fetch(`http://localhost:${port}/json`)).json();
  let t = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const [res, rej] = pend.get(d.id); pend.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('CONSOLE ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, [res, rej]); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = {
    send, sleep, errors,
    async goto(u) { await send('Page.navigate', { url: u }); await sleep(2500); },
    async ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 200)); return r.result.value; },
    async shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); },
    async rect(sel) { return api.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||!e.offsetParent&&getComputedStyle(e).position!=="fixed")return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,l:r.x,t:r.y}})()`); },
    async clickXY(x, y, touch) {
      if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(40); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
      await sleep(250);
    },
    async click(sel, touch) { await api.ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})`); await sleep(120); const r = await api.rect(sel); if (!r) throw new Error('no element ' + sel); await api.clickXY(r.x, r.y, touch); },
    async clickText(txt, touch, scope = 'button,a,[role=button],.btn,li,div') {
      const r = await api.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(scope)})].filter(e=>e.offsetParent&&e.children.length<6&&(e.innerText||'').trim().toLowerCase().includes(${JSON.stringify(txt.toLowerCase())}));els.sort((a,b)=>a.innerText.length-b.innerText.length);const e=els[0];if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      if (!r) throw new Error('no text ' + txt); await sleep(150);
      const r2 = await api.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(scope)})].filter(e=>e.offsetParent&&e.children.length<6&&(e.innerText||'').trim().toLowerCase().includes(${JSON.stringify(txt.toLowerCase())}));els.sort((a,b)=>a.innerText.length-b.innerText.length);const r=els[0].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await api.clickXY(r2.x, r2.y, touch);
    },
    // board square -> pixel center via the visible cg-board
    async sqXY(sq) {
      return api.ev(`(()=>{const bs=[...document.querySelectorAll('cg-board')].filter(b=>b.offsetParent&&b.getBoundingClientRect().width>200);const b=bs[0];const r=b.getBoundingClientRect();const o=b.closest('.cg-wrap')?.classList.contains('orientation-black')||!!b.closest('.orientation-black');const f='abcdefgh'.indexOf(${JSON.stringify(sq)}[0]),rk=+${JSON.stringify(sq)}[1]-1;const s=r.width/8;const col=o?7-f:f,row=o?rk:7-rk;return {x:r.x+(col+.5)*s,y:r.y+(row+.5)*s}})()`);
    },
    async move(from, to, touch) { const a = await api.sqXY(from), b = await api.sqXY(to); await api.clickXY(a.x, a.y, touch); await api.clickXY(b.x, b.y, touch); },
    async text() { return api.ev('document.body.innerText'); },
    close() { ws.close(); },
  };
  return api;
};
exports.home = async c => { for (let i = 0; i < 3; i++) { if (await c.rect('[data-act=course][data-c=caro]')) return; if (await c.rect('[data-act=home]')) await c.click('[data-act=home]'); await c.sleep(500); } };
