// Elapsed spans, not CPU time. Parser intervals are unioned so nested calls never double count.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [directory, dist] = process.argv.slice(2);
const r=JSON.parse(readFileSync(join(directory,'result.json'),'utf8'));
const round=x=>Math.round(x*10)/10;
const measure=xs=>({n:xs.length,total:round(xs.reduce((a,b)=>a+b,0)),median:round([...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]??0),max:round(Math.max(0,...xs))});
const maps=new Map();
const resolveStack=stack=>String(stack??'').split('\n').map(line=>line.replace(/http:\/\/localhost:53771(\/[^\s)]+\.js):(\d+):(\d+)/g,(all,path,l,c)=>{
 const file=join(dist,path+'.map');if(!existsSync(file))return all;
 if(!maps.has(file))maps.set(file,new SourceMap(JSON.parse(readFileSync(file,'utf8'))));
 const at=maps.get(file).findEntry(Number(l)-1,Number(c)-1);
 return at.originalSource?at.originalSource.replace(/^.*?(?=(src|account-protocol)\/)/,'')+':'+(at.originalLine+1):all;
}));
const begin=r.samples[0].at,end=r.samples.at(-1).at+r.samples.at(-1).frame;
const spans=r.stalls.spans.filter(s=>s.at>=begin&&s.at+s.ms<=end);
const finals=r.stalls.finals.filter(f=>f.at>=begin&&f.end<=end).map(f=>{
 const inside=(name,start,stop)=>spans.filter(s=>s.name===name&&s.at>=start-.1&&s.at+s.ms<=stop+.1).reduce((n,s)=>n+s.ms,0);
 return {...f,queue:f.acquired-f.at,authority:f.checked-f.acquired,apply:f.applied-f.applyAt,
  read:inside('authority.read',f.acquired,f.checked),equal:inside('authority.equal',f.acquired,f.checked),
  canonical:inside('final.canonical',f.applyAt,f.applied),projectionApply:inside('final.projectionApply',f.applyAt,f.applied),
  projectionCheck:inside('admittedWorkspace.ts.verifyProjection',f.applyAt,f.applied),publish:inside('final.publish',f.applyAt,f.applied)};
});
const union=xs=>{
 xs.sort((a,b)=>a[0]-b[0]);let total=0,stop=-Infinity;
 for(const [a,b] of xs){total+=Math.max(0,b-Math.max(a,stop));stop=Math.max(stop,b);}return total;
};
const parser=s=>/^(recovery|admission|contentDelivery|contentCheckpoint|inboundTransport)\.ts\.(parse|decode|encode|unhex|hex|lp)/.test(s.name)||s.name==='joinedAccount.ts.parseJoined';
const longTasks=r.tasks.filter(t=>t.at>=begin&&t.at+t.ms<=end).sort((a,b)=>b.ms-a.ms).map(t=>{
 const overlap=s=>Math.max(0,Math.min(t.at+t.ms,s.at+s.ms)-Math.max(t.at,s.at));
 const relevant=spans.filter(s=>overlap(s)>0),seen={};
 for(const s of relevant)seen[s.name]=(seen[s.name]??0)+overlap(s);
 return {...t,parserUnionLowerBound:round(union(relevant.filter(parser).map(s=>[Math.max(t.at,s.at),Math.min(t.at+t.ms,s.at+s.ms)]))),
  stages:Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([name,ms])=>({name,overlap:round(ms)}))};
});
const counters={};for(const [k,v] of Object.entries(r.after.work))counters[k]=v-(r.before.work[k]??0);
const results={condition:r.mode,phase:r.phase,window:{begin,end,ms:round(end-begin)},guardrails:{undoRedo:r.undoRedo,converged:r.converged,coldReplay:r.coldReplay,errors:r.errors},
 frames:measure(r.samples.map(s=>s.frame)),framesOver50:r.samples.filter(s=>s.frame>50).length,
 finalStages:Object.fromEntries(['queue','authority','read','equal','apply','canonical','projectionApply','projectionCheck','publish'].map(k=>[k,measure(finals.map(f=>f[k]))])),
 finals:finals.map(f=>Object.fromEntries(Object.entries(f).map(([k,v])=>[k,round(v)]))),
 fullJoinedCallers:spans.filter(s=>s.name==='joinedAccount.ts.readJoinedAccount').map(s=>({ms:round(s.ms),stack:resolveStack(s.stack)})),
 parserLongest:spans.filter(parser).sort((a,b)=>b.ms-a.ms).slice(0,15),
 longTasks,counters,stats:r.stalls.stats,
 warnings:['Attribution build overhead is unmeasured. Async stage durations overlap; do not add them.','Spans shorter than 1 ms are aggregated only; task parser coverage is a lower bound.','These are diagnostic sessions, not comparative timing or release evidence.']};
writeFileSync(join(directory,'analysis.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({condition:results.condition,phase:results.phase,finalStages:results.finalStages,longTasks:longTasks.slice(0,3)},null,2));
