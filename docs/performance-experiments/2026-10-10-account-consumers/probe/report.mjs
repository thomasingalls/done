// Numeric summaries of completed or partial disposable probes; no fixture/credential loading.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const pct = (xs,p) => [...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p/100)-1];
const stats = xs => ({ n:xs.length, p50:pct(xs,50), p95:pct(xs,95), max:Math.max(...xs) });
const diff = (a,b) => Object.fromEntries(Object.entries(b ?? {}).map(([k,v])=>[k,v-(a?.[k] ?? 0)]));
function arrivals(data) {
 const out=[];
 for(let i=0;i<data.keys.length;i++) {
  const want=data.armed.baseLength+i+1;
  let previous=data.armed.baseLength+i,last;
  for(const x of data.lengths) {
   if(x.t<data.keys[i].t-1) { previous=x.len; continue; }
   if(previous<want && x.len>=want) last=x.t;
   previous=x.len;
  }
  if(last!==undefined) out.push(last-data.keys[i].t);
 }
 return stats(out);
}
const output=[];
for(const directory of process.argv.slice(2)) {
 const file=readdirSync(directory).find(x=>x.endsWith('.summary.json'));
 const summary=read(join(directory,file));
 const mode=file.replace('.summary.json','');
 const blocks=summary.blocks.filter(x=>x.diagnosticBefore).map(b=>{
  const { data }=read(join(directory,`${mode}-${b.name}.raw.json`));
  const work=diff(b.diagnosticBefore.ledger?.work,b.diagnosticAfter.ledger?.work);
  const native=diff(b.diagnosticBefore.native,b.diagnosticAfter.native);
  const perPosition=Object.fromEntries(Object.entries({...work,...native}).map(([k,v])=>[k,work.positions?v/work.positions:null]));
  return {name:b.name,prior:b.typedBefore,keys:b.keys,textComplete:b.textComplete,stable:arrivals(data),gaps:stats(data.keys.slice(1).map((k,i)=>k.t-data.keys[i].t)),main:b.trace?.allMainThreadMsPerKey,input:b.trace?.inputTasks,paint:b.keyToNextPaintMs,work,native,perPosition};
 });
 const points=blocks.filter(x=>x.main),mx=points.reduce((s,x)=>s+x.prior,0)/points.length,my=points.reduce((s,x)=>s+x.main.p50,0)/points.length;
 const slope=points.length>1?points.reduce((s,x)=>s+(x.prior-mx)*(x.main.p50-my),0)/points.reduce((s,x)=>s+(x.prior-mx)**2,0):null;
 output.push({directory,mode,started:summary.started,finished:summary.finished,typed:summary.typed,notes:summary.notes,blocks,slope,maintenance:summary.blocks.filter(x=>x.name.endsWith('-maintenance')).map(x=>({typed:x.typed,coldOpenMs:x.coldOpenMs,warmHeapBytes:x.warmHeapBytes,reopenedHeapBytes:x.reopenedHeapBytes,audits:x.diagnostic?.ledger?.audits,mismatches:x.diagnostic?.ledger?.mismatches,compaction:x.diagnostic?.ledger?.timings?.compaction})),census:summary.blocks.filter(x=>x.census)});
}
console.log(JSON.stringify(output,null,2));
