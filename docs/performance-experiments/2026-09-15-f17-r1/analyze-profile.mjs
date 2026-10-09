import {readFileSync,writeFileSync} from 'node:fs';
import {SourceMap} from 'node:module';
import {join,resolve} from 'node:path';
const home=import.meta.dirname,variant=process.argv[2],session=process.argv[3],out=join(home,'results',session+'-'+variant),maps=new Map();
function source(frame){
if(!frame.url?.startsWith('http://127.0.0.1:')||!frame.url.endsWith('.js'))return {function:frame.functionName,source:frame.url};
const p=join(home,'builds',variant,new URL(frame.url).pathname+'.map');
let m=maps.get(p);if(!m){m=new SourceMap(JSON.parse(readFileSync(p)));maps.set(p,m)}
const e=m.findEntry(frame.lineNumber,frame.columnNumber);
return {function:e.name??frame.functionName,source:e.originalSource,line:e.originalLine+1};
}
const alloc=JSON.parse(readFileSync(join(out,'allocation.json'))),rows=[];
function visit(node){const row={id:node.id,...source(node.callFrame),selfBytes:node.selfSize,children:node.children.map(c=>c.id)};rows.push(row);for(const c of node.children)visit(c)}visit(alloc.head);
const byid=new Map(rows.map(r=>[r.id,r]));
function inclusive(id){const r=byid.get(id);return r.inclusiveBytes=r.selfBytes+r.children.reduce((n,c)=>n+inclusive(c),0)}inclusive(alloc.head.id);
const cpu=JSON.parse(readFileSync(join(out,'cpu.json'))),cr=cpu.nodes.map(n=>({id:n.id,...source(n.callFrame),selfUs:0,children:n.children??[]})),cm=new Map(cr.map(r=>[r.id,r]));
for(let i=0;i<cpu.samples.length;i++)cm.get(cpu.samples[i]).selfUs+=cpu.timeDeltas[i];
function ci(id){const r=cm.get(id);return r.inclusiveUs=r.selfUs+r.children.reduce((n,c)=>n+ci(c),0)}ci(cpu.nodes[0].id);
const result={note:'One sampled diagnostic session; CPU and allocation profiling overlap. Inclusive rows overlap; bytes are estimates including collected objects, not retained memory. GC sample time is incomplete attribution.',allocation:rows.sort((a,b)=>b.selfBytes-a.selfBytes),cpu:cr.sort((a,b)=>b.selfUs-a.selfUs),summary:{sampledAllocationBytes:rows.reduce((n,r)=>n+r.selfBytes,0),gcMs:cr.filter(r=>r.function==='(garbage collector)').reduce((n,r)=>n+r.selfUs/1000,0)}};
writeFileSync(join(out,'mapped.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({summary:result.summary,topAllocation:result.allocation.slice(0,12),topCpu:result.cpu.slice(0,12)},null,2));
