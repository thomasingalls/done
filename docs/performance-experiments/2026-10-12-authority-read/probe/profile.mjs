// Correlate sampled activity with timed final waits. No claim that an open span is disk latency.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {SourceMap} from 'node:module';
const root='/tmp/done-authority-read-20261012';
const maps=new Map();
const resolve=f=>{
 if(!f.url)return {name:f.functionName,source:'',line:0};
 const path=join(root,'diagnostic',new URL(f.url).pathname+'.map');
 if(!existsSync(path))return {name:f.functionName,source:'unmapped',line:0};
 if(!maps.has(path))maps.set(path,new SourceMap(JSON.parse(readFileSync(path))));
 const entry=maps.get(path).findEntry(f.lineNumber,f.columnNumber);
 return {name:entry.name||f.functionName,source:(entry.originalSource??'unmapped').replace(/^.*?(?=(src|account-protocol|node_modules)\/)/,''),line:entry.originalLine+1};
};
for(const name of ['active-sampled','backlog-sampled']){
 const path=join(root,name);if(!existsSync(join(path,'analysis.json')))continue;
 const r=JSON.parse(readFileSync(join(path,'result.json'))),a=JSON.parse(readFileSync(join(path,'analysis.json'))),p=JSON.parse(readFileSync(join(path,'typing.cpuprofile')));
 const nodes=new Map(p.nodes.map(n=>[n.id,n])),parents=new Map();
 for(const node of p.nodes)for(const child of node.children??[])parents.set(child,node.id);
 const chains=new Map();
 const chain=id=>{
  if(!chains.has(id)){const frames=[];for(let i=id;i!==undefined;i=parents.get(i))frames.push(resolve(nodes.get(i).callFrame));chains.set(id,frames);}
  return chains.get(id);
 };
 const category=frames=>{
  const name=frames[0].name;
  if(['(idle)','(program)','(garbage collector)'].includes(name))return name;
  if(frames.some(f=>f.source.includes('react-dom')||f.source.startsWith('src/ui/')))return 'React/UI';
  if(frames.some(f=>f.source.includes('@codemirror')))return 'CodeMirror';
  if(frames.some(f=>f.source.includes('startupStorage')||f.source.includes('contentDatabase')))return 'native-read callbacks';
  if(frames.some(f=>f.source.startsWith('account-protocol/')))return 'protocol';
  return 'other';
 };
 const groups={};let time=p.startTime;
 for(let i=0;i<p.samples.length;i++){
  time+=p.timeDeltas[i];const t=r.profileClock.wallMs+(time-r.profileClock.monotonicUs)/1000;
  for(const row of a.rows){if(!row.final)continue;
   for(const [kind,intervals] of Object.entries(row.intervals))for(const [from,to] of intervals){
    if(t<from||t>=to)continue;
    const g=groups[kind]??={samples:0,categories:{},interiorCategories:{},top:{}};
    const frames=chain(p.samples[i]),label=category(frames),head=frames[0];
    g.samples++;g.categories[label]=(g.categories[label]??0)+1;
    // Exclude samples near either endpoint using the full clock-roundtrip uncertainty.
    if(t-from>r.profileClock.errorMs&&to-t>r.profileClock.errorMs)g.interiorCategories[label]=(g.interiorCategories[label]??0)+1;
    const key=head.source+':'+head.line+' '+head.name;
    const item=g.top[key]??={samples:0,stack:frames.slice(0,8)};item.samples++;
   }
  }
 }
 for(const g of Object.values(groups))g.top=Object.values(g.top).sort((a,b)=>b.samples-a.samples).slice(0,20);
 const data={session:name,clockErrorMs:r.profileClock.errorMs,groups,warning:'Correlated samples, not causal CPU/storage attribution. (program) is unclassified, not idle or disk. Sampling and clock alignment can shift short spans; interior counts are a sensitivity check.'};
 writeFileSync(join(path,'profile-analysis.json'),JSON.stringify(data,null,2)+'\n');
 console.log(name,Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{samples:v.samples,categories:v.categories,interior:v.interiorCategories}])));
}
