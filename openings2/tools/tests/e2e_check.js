// Replays every line of docs/courses2.json with the bundled chess.js; checks legality and card refs.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../../../docs/vendor/chess.min.js'),'utf8');
const Chess=new Function(src+';return Chess;')();
const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../docs/courses2.json'),'utf8'));
let bad=0;
for(const c of d.courses){
  const cardByNode={};for(const k of c.cards)cardByNode[k.node]=k;
  let lines=0,plies=0,mineNodes=0,missingCard=0,illegal=0,badNode=0,keyMis=0,lineRefMis=0,cardBadFen=0;
  const lineIds=new Set(c.lines.map(l=>l.id));
  const chLines=new Set(c.chapters.flatMap(x=>x.lines));
  let orphanLines=0;for(const l of c.lines)if(!chLines.has(l.id))orphanLines++;
  for(const l of c.lines){lines++;const g=new Chess();
    for(const id of l.nodes){const n=c.nodes[id];if(!n){badNode++;break;}
      if(g.fen().split(' ').slice(0,4).join(' ')!==n.k && n.k && !g.fen().startsWith(n.k)) keyMis++;
      const m=g.move(n.san,{sloppy:true});plies++;
      if(!m){illegal++;console.log('ILLEGAL',c.id,l.id,n.san);break;}
      if(m.from+m.to+(m.promotion||'')!==n.uci)illegal++;
      if(n.mine){mineNodes++;if(!cardByNode[id]){missingCard++;console.log('NOCARD',c.id,l.id,id,n.san);}}
    }
    if(l.to&&!lineIds.has(l.to))lineRefMis++;
  }
  for(const k of c.cards){if(!c.nodes[k.node])badNode++;try{const g=new Chess(k.fen);if(!g.move(k.san,{sloppy:true}))cardBadFen++;}catch(e){cardBadFen++}
    for(const L of k.lines)if(!lineIds.has(L))lineRefMis++;}
  let tp=0;for(const t of c.traps||[])for(const id of t.nodes)if(!c.nodes[id])tp++;
  let mg=0;for(const m of c.models||[]){const g=new Chess();for(const s of m.moves)if(!g.move(s,{sloppy:true})){mg++;break;}}
  console.log(JSON.stringify({course:c.id,lines,plies,mineNodes,cards:c.cards.length,nodes:Object.keys(c.nodes).length,traps:(c.traps||[]).length,models:(c.models||[]).length,illegal,missingCard,badNode,keyMis,lineRefMis,cardBadFen,trapBadNode:tp,modelIllegal:mg,orphanLines}));
  bad+=illegal+missingCard+badNode+lineRefMis+cardBadFen+tp+mg;
}
console.log(bad?'FAIL':'PASS',bad);
