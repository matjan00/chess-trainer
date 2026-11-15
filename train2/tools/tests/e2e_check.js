// Script check for docs/train2.json, puzzles2.json, mine2.json (node train2/tools/tests/e2e_check.js)
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../../../docs/');
const Chess=new Function(fs.readFileSync(D+'vendor/chess.min.js','utf8')+';return Chess;')();
const T=JSON.parse(fs.readFileSync(D+'train2.json','utf8')),P=JSON.parse(fs.readFileSync(D+'puzzles2.json','utf8')),M=JSON.parse(fs.readFileSync(D+'mine2.json','utf8'));
const errs=[];const E=(m)=>{errs.length<60&&console.log('ERR',m);errs.push(m)};
const mv=(g,u)=>g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});
const okFen=(f)=>{const v=new Chess().validate_fen?.(f);return !v||v.valid;};
const legalFen=f=>{try{const g=new Chess(f);return g.fen().split(' ')[0]===f.split(' ')[0];}catch{return false}};
const puzIds=new Set(P.rows.map(r=>r[0]));
if(puzIds.size!==P.rows.length)E('puzzle ids dup');
let pz=0;for(const r of P.rows){pz++;const g=new Chess(r[1]);if(!legalFen(r[1])){E('puz fen '+r[0]);continue}
 for(const u of r[2].split(' ')){if(!mv(g,u)){E('puz illegal '+r[0]+' '+u);break}}
 for(const gi of r[4])if(!P.groups[gi])E('puz group '+r[0]);
if(r[6]&&r[6]!==0){const ms=r[2].split(' ');const g2=new Chess(r[1]);const poss=[];for(const u of ms){poss.push(g2.fen());mv(g2,u)}for(const u of String(r[6]).split(' '))if(!poss.some(f=>mv(new Chess(f),u)))E('puz alt '+r[0]);}}
const all={card:new Set(),lesson:new Set(),judge:new Set(),play:new Set()};
const cnt={courses:T.courses.length,chapters:0,lessons:0,steps:0,ex:0,cards:0,judges:0,plays:0,sets:0,mineSteps:0,exMoves:0};
for(const c of T.courses){
 const dup=(set,id,k)=>{const key=c.id+'.'+id;if(set.has(key))E('dup '+k+' '+key);set.add(key)};
 cnt.chapters+=c.chapters.length;
 const inCh=new Set();for(const ch of c.chapters)for(const l of ch.lessons){if(!c.lessons[l])E('chapter ref lesson missing '+c.id+'/'+l);inCh.add(l)}
 for(const [id,l] of Object.entries(c.lessons)){cnt.lessons++;dup(all.lesson,id,'lesson');if(l.id!==id)E('lesson id mismatch '+id);if(!inCh.has(id))E('orphan lesson '+c.id+'/'+id);
  for(const s of l.steps){cnt.steps++;
   if(s.t==='ex'){cnt.ex++;if(!legalFen(s.fen))E('ex fen '+c.id+'/'+id+' '+s.id);const g=new Chess(s.fen);for(const m of s.moves){cnt.exMoves++;const r=mv(g,m.uci);if(!r||(m.san&&r.san!==m.san&&r.san.replace(/[+#]/,'')!==m.san.replace(/[+#]/,'')))E('ex move '+c.id+'/'+id+' '+s.id+' '+m.uci+'/'+m.san)}}
   else if(s.t==='card'){if(!c.cards[s.id])E('dead card ref '+c.id+'/'+id+' '+s.id)}
   else if(s.t==='judge'){if(!c.judges[s.id])E('dead judge ref '+c.id+'/'+id+' '+s.id)}
   else if(s.t==='play'){if(!c.plays[s.id])E('dead play ref '+c.id+'/'+id+' '+s.id)}
   else if(s.t==='set'){cnt.sets++;for(const p of s.ids)if(!puzIds.has(p))E('dead puzzle ref '+c.id+'/'+id+' '+p)}
   else if(s.t==='mine'){cnt.mineSteps++}
   else E('unknown step '+s.t);}}
 for(const [id,k] of Object.entries(c.cards)){cnt.cards++;dup(all.card,id,'card');if(!legalFen(k.fen)){E('card fen '+c.id+'.'+id);continue}
  const g=new Chess(k.fen);if(k.last&&k.last.length>=4){/* last move already played */}
  const side=g.turn();if(k.side&&k.side[0]!==side)E('card side '+c.id+'.'+id+' '+k.side+' vs '+side);
  if(!k.sol||!k.sol.length)E('card no sol '+id);else{const g2=new Chess(k.fen);for(const u of k.sol)if(!mv(g2,u)){E('card sol illegal '+c.id+'.'+id+' '+u);break}}
  for(const u of (k.ok||[]).concat(k.slow||[],Object.keys(k.also||{}),Object.keys(k.wrong||{})))if(!mv(new Chess(k.fen),u))E('card alt illegal '+c.id+'.'+id+' '+u);}
 for(const [id,k] of Object.entries(c.judges)){cnt.judges++;dup(all.judge,id,'judge');if(!legalFen(k.fen)){E('judge fen '+id);continue}
  const g=new Chess(k.fen);const r=typeof k.mv==='string'&&/^[a-h][1-8][a-h][1-8]/.test(k.mv)?mv(g,k.mv):g.move(k.mv,{sloppy:true});if(!r)E('judge mv illegal '+c.id+'.'+id+' '+k.mv);
  else if(k.refute){for(const s of k.refute)if(!g.move(s,{sloppy:true})){E('judge refute illegal '+c.id+'.'+id+' '+s);break}}}
 for(const [id,k] of Object.entries(c.plays)){cnt.plays++;dup(all.play,id,'play');if(!legalFen(k.fen))E('play fen '+c.id+'.'+id);else{const g=new Chess(k.fen);if(g.game_over())E('play start game over '+id);if(k.side&&k.side[0]!==g.turn())console.log('NOTE play engine moves first (side '+k.side+', turn '+g.turn()+') '+c.id+'.'+id)}}
 // unused cards/judges/plays
 const used=new Set(Object.values(c.lessons).flatMap(l=>l.steps.filter(s=>['card','judge','play'].includes(s.t)).map(s=>s.t+s.id)));
 for(const k of ['cards','judges','plays']){const t=k.slice(0,-1);for(const id of Object.keys(c[k]))if(!used.has(t+id))console.log('NOTE unreferenced',t,c.id+'.'+id)}
}
const mc=M.cards,ids=new Set();let mcLegal=0;
for(const k of mc){if(ids.has(k.id))E('mine dup '+k.id);ids.add(k.id);if(!legalFen(k.fen)){E('mine fen '+k.id);continue}const g=new Chess(k.fen);let okk=true;for(const u of k.sol)if(!mv(g,u)){E('mine sol illegal '+k.id+' '+u);okk=false;break}if(okk)mcLegal++;if(k.group&&!P.groups.find(x=>x.id===k.group))E('mine group '+k.id)}
for(const k of M.judges){if(ids.has(k.id))E('mine dup '+k.id);ids.add(k.id);if(!legalFen(k.fen))E('mine judge fen '+k.id)}
for(const k of M.plays){if(ids.has(k.id))E('mine dup '+k.id);ids.add(k.id);if(!legalFen(k.fen))E('mine play fen '+k.id);else if(new Chess(k.fen).game_over())E('mine play over '+k.id)}
console.log(JSON.stringify(cnt));console.log('puzzles',pz,'groups',P.groups.length,'mine cards',mc.length,'judges',M.judges.length,'plays',M.plays.length,'sol legal',mcLegal);
console.log(errs.length?'FAIL '+errs.length:'PASS');
