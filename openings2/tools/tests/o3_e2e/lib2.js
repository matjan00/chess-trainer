const {connect,home}=require('./cdp.js');
exports.connect=connect;exports.home=home;
const state=async c=>c.ev(String.raw`(()=>{const p=document.querySelector('#o2-player');if(!p||p.hidden)return null;const vis=e=>e.offsetParent;return {text:p.innerText.split(/\n+/).join(' | ').replace(/^.*?\| H \| ⌂ \|/,'').slice(0,700),btns:[...p.querySelectorAll('button')].filter(vis).map(b=>b.innerText.trim().replace(/\n/g,' ')).join(' ; ')}})()`);
exports.state=state;
// own moves of a line as [from,to] using the compiled data
exports.ownMoves=(line,course)=>line.nodes.map(i=>course.nodes[i]).filter(n=>n.mine).map(n=>[n.uci.slice(0,2),n.uci.slice(2,4),n.san]);
exports.clickBtn=async(c,txt,touch)=>{
  const r=await c.ev(`(()=>{const b=[...document.querySelectorAll('#o2-player button, #o2-player [data-act]')].find(b=>b.offsetParent&&b.innerText.trim().toLowerCase().startsWith(${JSON.stringify(txt.toLowerCase())}));if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(!r){await c.sleep(700);return;} await c.sleep(100);
  const r2=await c.ev(`(()=>{const b=[...document.querySelectorAll('#o2-player button, #o2-player [data-act]')].find(b=>b.offsetParent&&b.innerText.trim().toLowerCase().startsWith(${JSON.stringify(txt.toLowerCase())}));if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(r2)await c.clickXY(r2.x,r2.y,touch);
};
// drive a learn session to the end. opts: {touch, log, wrongOnce:{...}}
exports.driveLearn=async(c,course,line,opts={})=>{
  const mv=exports.ownMoves(line,course);const own=line.nodes.map(i=>course.nodes[i]).filter(n=>n.mine);
  const rname=id=>course.rules.find(r=>r.id===id)?.name;
  let i=0,guard=0,seen=new Set(),phase=1;const log=opts.log||(()=>{});
  while(guard++<400){
    await c.sleep(opts.fast?500:900);
    const s=await exports.state(c);if(!s){log('NO PLAYER');return {ended:'no-player'};}
    const T=s.text;{const toks=T.split(' | ').map(x=>x.trim()).filter(Boolean);let n=0;for(const x of toks){if(/^(Hint|Show|Skip|Flip|Continue|Start|QUESTION|YOUR|SAME|✓|NOT|[A-Z]{4,})/.test(x))break;n++;}if(n>0&&/QUESTION|YOUR MOVE|YES, LOOK/.test(T))i=Math.max(0,(n-1)/2|0);}
    const head=(T.match(/(STEP \d OF \d[^|]*|QUESTION \d[^|]*|LINE LEARNED|[A-Z][A-Z ·.'!?:,-]{8,})/)||[''])[0];
    const key=head+'#'+i;if(!seen.has(key)){seen.add(key);if(opts.probe)await opts.probe(head,T);log(`[i=${i}] ${head} :: ${T.slice(0,160)} || ${s.btns.slice(-120)}`);}
    if(/STEP 2 OF 2/.test(T)&&phase===1&&/MOVE 1 /.test(T)===false){}
    if(/QUESTION 1/.test(T)){const t=own[i]?.trig;const sq=await c.sqXY(t.clue[0]);await c.clickXY(sq.x,sq.y,opts.touch);continue;}
    if(/QUESTION 2/.test(T)){const t=own[i]?.trig;const nm=rname(t.rule);await c.ev(`[...document.querySelectorAll('[data-q2]')].find(b=>b.innerText.trim()==${JSON.stringify(nm)}).scrollIntoView({block:'center'})`);await c.sleep(100);const r=await c.ev(`(()=>{const b=[...document.querySelectorAll('[data-q2]')].find(b=>b.innerText.trim()==${JSON.stringify(nm)});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await c.clickXY(r.x,r.y,opts.touch);continue;}
    if(/LINE LEARNED|Line learned/i.test(T)){log('END: '+T.slice(0,300)+' || '+s.btns);return {ended:'learned',text:T,btns:s.btns,i};}
    if((/YOUR MOVE|YOUR TURN|PLAY/.test(T)||(/✓ RIGHT/.test(T)&&/Hint/.test(s.btns)))&&mv[i]&&!/ContinueSpace|^Continue/.test(s.btns.split(' ; ').slice(-4).join(' ; '))){
      if(opts.onMove)await opts.onMove(i,mv[i],s);
      await c.move(mv[i][0],mv[i][1],opts.touch);i++;continue;}
    const m=s.btns.match(/(Continue|Start|Next|Got it|Learn from memory|Finish|Done|Review|Practice)[^;]*/);
    if(m){ if(/STEP 2 OF 2|memory/i.test(T+s.btns))i=0; await exports.clickBtn(c,m[1],opts.touch);continue;}
    log('STUCK '+T.slice(0,300)+' || '+s.btns);return {ended:'stuck',text:T,btns:s.btns};
  }
  return {ended:'guard'};
};
// drive a review session over one line; stopAfter = number of own moves to play then return (session left open)
exports.driveReview=async(c,course,line,opts={})=>{
  const mv=exports.ownMoves(line,course);const own=line.nodes.map(i=>course.nodes[i]).filter(n=>n.mine);
  const log=opts.log||(()=>{});let i=0,guard=0,q1=0,q1at=[],seen=new Set();const wrong=opts.wrongAt||{};
  while(guard++<300){
    await c.sleep(opts.fast?600:1000);
    if(opts.stopAfter!=null&&i>=opts.stopAfter)return {ended:'stopped',i,q1,q1at};
    const s=await exports.state(c);if(!s)return {ended:'no-player',i,q1,q1at};
    const T=s.text;{const toks=T.split(' | ').map(x=>x.trim()).filter(Boolean);let n=0;for(const x of toks){if(/^(Hint|Show|Skip|Flip|Continue|Start|QUESTION|YOUR|SAME|✓|NOT|[A-Z]{4,})/.test(x))break;n++;}if(n>0)i=Math.max(0,(n-1)/2|0);}
    if(/Watch the line from move 1/.test(T)){log('replay-from-move-1 intro seen');await c.sleep(2500);continue;}
    const head=(T.match(/(QUESTION \d[^|]*|RULE[^|]*|[A-Z][A-Z ·.'!?:,-]{7,})/)||[''])[0];
    const key=head+'#'+i;if(!seen.has(key)){seen.add(key);if(opts.probe)await opts.probe(head,T);log(`[i=${i}] ${T.slice(Math.max(0,T.indexOf(head)),T.indexOf(head)+170)} || ${s.btns.slice(-90)}`);}
    if(/QUESTION 1/.test(T)){q1++;q1at.push(i);const t=own[i]?.trig;if(!t){log('Q1 BUT NO TRIG at '+i);}const sq=await c.sqXY(t.clue[0]);await c.clickXY(sq.x,sq.y,opts.touch);continue;}
    if(/QUESTION 2/.test(T)){log('Q2 in review?!');return {ended:'q2',i,q1,q1at};}
    if(/SESSION|ALL DONE|Review done|Well done|session complete|Nothing/i.test(T)&&!/YOUR MOVE/.test(T)){return {ended:'done',text:T,btns:s.btns,i,q1,q1at};}
    if(/YOUR MOVE|YOUR TURN|YES, LOOK/.test(T)&&!/Continue/.test(s.btns.split(' ; ').slice(-4).join(' ; '))){
      if(i>=mv.length){return {ended:'overrun',i};}
      const w=wrong[i];if(w){await c.move(w[0],w[1],opts.touch);await c.sleep(900);log('  wrong move '+w+' -> '+(await exports.state(c)).text.slice(-400));return {ended:'wrong',i,q1,q1at};}
      await c.move(mv[i][0],mv[i][1],opts.touch);i++;continue;}
    const m=s.btns.match(/(Continue|Next|Got it|Finish|Done|Again|Close)[^;]*/);
    if(m){await exports.clickBtn(c,m[1],opts.touch);continue;}
    log('STUCK '+T.slice(0,300)+' || '+s.btns);return {ended:'stuck',text:T,btns:s.btns,i,q1,q1at};
  }
  return {ended:'guard'};
};
// generic review driver: follows whichever line the position belongs to (lines given), plays the course move; opts.trap(hist,nextNode,line)->[from,to] to play something else once
exports.driveAny=async(c,course,lineIds,opts={})=>{
  const lines=lineIds.map(id=>course.lines.find(l=>l.id===id));const log=opts.log||(()=>{});let guard=0,q1=0,done=new Set(),lastSig='',stuck=0;
  const sans=l=>l.nodes.map(i=>course.nodes[i]);
  while(guard++<400){
    await c.sleep(opts.fast?600:1000);
    const s=await exports.state(c);if(!s)return {ended:'no-player',q1};
    const T=s.text;
    if(/Watch the line from move 1/.test(T)){await c.sleep(2500);continue;}
    const toks=T.split(' | ').map(x=>x.trim()).filter(Boolean);const hist=[];for(const x of toks){if(/^(Hint|Show|Skip|Flip|Continue|Start|QUESTION|YOUR|SAME|✓|NOT|[A-Z]{4,})/.test(x))break;hist.push(x.replace(/^\d+\./,''));}
    const sig=T.slice(0,400);if(sig===lastSig){stuck++;}else{stuck=0;lastSig=sig;}
    if(stuck>8){log('STUCK '+T.slice(0,400)+' || '+s.btns.slice(-120));return {ended:'stuck',q1,text:T,btns:s.btns};}
    const cand=lines.filter(l=>{const ns=sans(l);return hist.every((h,k)=>ns[k]&&ns[k].san.replace(/[+#]/g,'')===h.replace(/[+#]/g,''));});
    const nextOf=l=>sans(l)[hist.length];
    if(/QUESTION 1/.test(T)){q1++;log(`Q1 at hist=${hist.length}`);const l=cand.find(l=>nextOf(l)?.trig)||cand[0];const t=nextOf(l).trig;const sq=await c.sqXY(t.clue[0]);await c.clickXY(sq.x,sq.y,opts.touch);continue;}
    if(/FINISHED|REVIEW FINISHED/i.test(T))return {ended:'finished',text:T,q1};
    if((/YOUR MOVE|YES, LOOK/.test(T)||(/✓ RIGHT/.test(T)&&/Hint/.test(s.btns)))&&!/Continue/.test(s.btns.split(' ; ').slice(-4).join(' ; '))){
      const l=cand[0];if(!l){log('NO LINE for '+hist.join(' '));return {ended:'noline',q1,hist};}
      const nx=nextOf(l);
      if(opts.trap){const w=opts.trap(hist,nx,l);if(w){log('WRONG-MOVE '+w+' at '+hist.join(' '));await c.move(w[0],w[1],opts.touch);await c.sleep(1000);const s2=await exports.state(c);log('  -> '+s2.text.slice(-500)+' || '+s2.btns.slice(-100));await c.shot(opts.trapShot||'trap');return {ended:'trap',q1,s2};}}
      await c.move(nx.uci.slice(0,2),nx.uci.slice(2,4),opts.touch);continue;}
    const m=s.btns.match(/(Continue|Next|Got it|Finish|Done|Again|Close)[^;]*/);
    if(m){await exports.clickBtn(c,m[1],opts.touch);continue;}
  }
  return {ended:'guard',q1};
};
