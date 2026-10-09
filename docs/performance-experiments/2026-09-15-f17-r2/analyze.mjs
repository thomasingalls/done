import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname;
const sessions=readdirSync(join(home,'results')).map(n=>JSON.parse(readFileSync(join(home,'results',n,'result.json')))).filter(r=>!r.profiling);
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2};
const result={note:'Descriptive summaries of fresh sessions; keystrokes within a session are dependent. No significance or population confidence claims.',rows:[],contrasts:[]};
for(const phase of ['ablation','unicode','editor','editor-unicode']){
 const rows=sessions.filter(r=>r.session.replace(/-\d+$/,'')===phase);
 if(!rows.length)continue;
 for(const variant of [...new Set(rows.map(r=>r.name))])for(const block of ['shallow','deeper']){
  const x=rows.filter(r=>r.name===variant).map(r=>({session:r.session,...r.rows.find(v=>v.block===block)}));
  result.rows.push({phase,variant,block,p50:median(x.map(v=>v.p50)),p95:median(x.map(v=>v.p95)),individual:x.map(({samples,...v})=>v)});
 }
 const variants=[...new Set(rows.map(r=>r.name))];
 const target=phase.startsWith('editor')?'editor':'all';
 for(const comparator of variants.filter(v=>v!==target))for(const block of ['shallow','deeper']){
  const paired=[];
  for(const r of rows.filter(r=>r.name===target)){
   const a=r.rows.find(x=>x.block===block),b=rows.find(x=>x.name===comparator&&x.session===r.session)?.rows.find(x=>x.block===block);
   if(b)paired.push({session:r.session,p50Ratio:a.p50/b.p50,p95Ratio:a.p95/b.p95});
  }
  result.contrasts.push({phase,target,comparator,block,paired,targetMedianGainPct:100*(1-median(paired.map(p=>p.p50Ratio))),targetP95GainPct:100*(1-median(paired.map(p=>p.p95Ratio)))});
 }
}
writeFileSync(join(home,'analysis.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
