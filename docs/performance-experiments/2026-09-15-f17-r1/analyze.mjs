import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname;
const rs=readdirSync(join(home,'results')).filter(n=>!n.includes('profile')).map(n=>JSON.parse(readFileSync(join(home,'results',n,'result.json'))));
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2};
const output={notes:'Exploratory session summaries, not confidence intervals or independent keystroke observations. Different corpora are not pooled.',rows:[],contrasts:[]};
for(const phase of ['screen','combine','confirm']){
const rows=rs.filter(r=>r.session.startsWith(phase));
for(const name of [...new Set(rows.map(r=>r.name))])for(const block of ['shallow','deeper']){
const subset=rows.filter(r=>r.name===name);const x=subset.map(r=>r.rows.find(x=>x.block===block));
output.rows.push({phase,name,block,sessions:subset.length,p50:median(x.map(x=>x.p50)),p95:median(x.map(x=>x.p95)),individual:x.map((v,i)=>({session:subset[i].session,p50:v.p50,p95:v.p95}))});
if(name!=='baseline'){
const ratios=subset.map(r=>{const b=rows.find(x=>x.name==='baseline'&&x.session===r.session)?.rows.find(x=>x.block===block),v=r.rows.find(x=>x.block===block);return b?{session:r.session,p50:v.p50/b.p50,p95:v.p95/b.p95}:null}).filter(Boolean);
output.contrasts.push({phase,name,block,pairedRatios:ratios,medianP50GainPercent:100*(1-median(ratios.map(r=>r.p50))),medianP95GainPercent:100*(1-median(ratios.map(r=>r.p95)))});
}
}
}
writeFileSync(join(home,'analysis.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
