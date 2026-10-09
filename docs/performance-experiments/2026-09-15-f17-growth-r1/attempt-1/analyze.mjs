import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname;
const batch=JSON.parse(readFileSync(join(home,'campaign-batch.json')));assert.equal(batch.length,8,'Require complete fixed campaign');
const sessions=batch.map(b=>({...b,result:JSON.parse(readFileSync(join(home,'results',b.session,'result.json')))}));
assert(sessions.every(s=>s.code===0&&s.drained&&s.result.status==='passed'&&s.result.closed));
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const metric=(s,block,m)=>s.result.rows.find(r=>r.block===block)[m];
const row=s=>({session:s.session,cards:s.result.facts.initial.cards,condition:s.condition,repeat:s.block,earlyUndo:[s.result.facts.earlyStart.undo,s.result.facts.earlyEnd.undo],deepUndo:[s.result.facts.deepStart.undo,s.result.facts.deepEnd.undo],earlyStructs:s.result.facts.earlyStart.structs,deepStructs:s.result.facts.deepStart.structs,earlyHistoryBytes:s.result.facts.earlyStart.historyBytes,deepHistoryBytes:s.result.facts.deepStart.historyBytes,earlyP50:metric(s,'early','p50'),deepP50:metric(s,'deep','p50'),earlyP95:metric(s,'early','p95'),deepP95:metric(s,'deep','p95'),withinSessionMedianRatio:metric(s,'deep','p50')/metric(s,'early','p50')});
const comparisons=[];
for(const days of [20,40]){
 const pairs=[0,1].map(block=>{const retain=sessions.find(s=>s.days===days&&s.condition==='retain'&&s.block===block),clear=sessions.find(s=>s.days===days&&s.condition==='clear'&&s.block===block);return {repeat:block,retain:retain.session,clear:clear.session,p50Ratio:metric(retain,'deep','p50')/metric(clear,'deep','p50'),p95Ratio:metric(retain,'deep','p95')/metric(clear,'deep','p95')};});
 comparisons.push({kind:'retained-over-cleared',seededCards:days*15,pairs,p50Ratio:median(pairs.map(p=>p.p50Ratio)),p95Ratio:median(pairs.map(p=>p.p95Ratio))});
}
for(const condition of ['retain','clear']){
 const pairs=[0,1].map(block=>{const small=sessions.find(s=>s.days===20&&s.condition===condition&&s.block===block),large=sessions.find(s=>s.days===40&&s.condition===condition&&s.block===block);return {repeat:block,small:small.session,large:large.session,p50Ratio:metric(large,'deep','p50')/metric(small,'deep','p50'),p95Ratio:metric(large,'deep','p95')/metric(small,'deep','p95')};});
 comparisons.push({kind:'600-over-300',condition,pairs,p50Ratio:median(pairs.map(p=>p.p50Ratio)),p95Ratio:median(pairs.map(p=>p.p95Ratio))});
}
const cells=[];for(const days of [20,40])for(const condition of ['retain','clear']){const rows=sessions.filter(s=>s.days===days&&s.condition===condition);cells.push({seededCards:days*15,condition,earlyP50:median(rows.map(s=>metric(s,'early','p50'))),deepP50:median(rows.map(s=>metric(s,'deep','p50'))),earlyP95:median(rows.map(s=>metric(s,'early','p95'))),deepP95:median(rows.map(s=>metric(s,'deep','p95')))});}
const result={note:'Descriptive session-level engineering comparisons. Keys are dependent; two repeats per cell do not establish population confidence. Clear intervention removes history/retention together; accelerated setup does not simulate sustained CPU4 load. No strict complexity or release-budget claim.',sessions:sessions.map(row),cells,comparisons};
writeFileSync(join(home,'analysis.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
