import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname;
const batches=['comparison','unicode'].flatMap(mode=>JSON.parse(readFileSync(join(home,`${mode}-batch.json`))));
assert.equal(batches.length,6);
const results=batches.map(b=>{
 assert.equal(b.code,0);assert(b.drained&&!b.timedOut);
 const r=JSON.parse(readFileSync(join(home,'results',`${b.session}-${b.variant}`,'result.json')));
 assert.equal(r.status,'passed');assert.equal(r.closed,true);assert.deepEqual(r.errors,[]);
 assert.equal(r.rows.length,2);assert.equal(r.setupMarkerPresent,true);assert.equal(r.setupEmojiPresent,r.unicode);
 for(const row of r.rows){assert.equal(row.samples.length,40);assert(row.samples.every(n=>Number.isFinite(n)&&n>=0));}
 return r;
});
const median=xs=>{const s=[...xs].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const pairs=[];
for(const session of ['comparison-0','comparison-1','unicode-0'])for(const block of ['shallow','deeper']){
 const s=results.find(r=>r.session===session&&r.name==='selected').rows.find(r=>r.block===block);
 const c=results.find(r=>r.session===session&&r.name==='candidate').rows.find(r=>r.block===block);
 pairs.push({session,block,selected:{p50:s.p50,p95:s.p95},candidate:{p50:c.p50,p95:c.p95},medianRatio:c.p50/s.p50,p95Ratio:c.p95/s.p95});
}
const ordinary=['shallow','deeper'].map(block=>{
 const ps=pairs.filter(p=>p.block===block&&!p.session.includes('unicode'));
 return {block,selectedMedian:median(ps.map(p=>p.selected.p50)),candidateMedian:median(ps.map(p=>p.candidate.p50)),medianPairedRatio:median(ps.map(p=>p.medianRatio)),medianPairedP95Ratio:median(ps.map(p=>p.p95Ratio))};
});
const analysis={sessions:6,measuredKeys:480,warmupKeys:624,comparisons:pairs,ordinary,results:results.map(r=>({name:r.name,session:r.session,browser:r.browser,rows:r.rows.map(({samples,...row})=>row),checks:r.checks,undoSettledMs:r.undoSettledMs,redoSettledMs:r.redoSettledMs}))};
writeFileSync(join(home,'analysis.json'),JSON.stringify(analysis,null,2)+'\n');console.log(JSON.stringify(analysis,null,2));
