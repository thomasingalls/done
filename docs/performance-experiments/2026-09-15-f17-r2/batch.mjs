import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname, mode=process.argv[2], reference=process.argv[3]??'all';
const jobs=mode==='ablation'?[['all','ablation-0'],['no-preparation','ablation-0'],['no-pool','ablation-0'],['no-publication','ablation-0'],['no-publication','ablation-1'],['no-pool','ablation-1'],['no-preparation','ablation-1'],['all','ablation-1']]:mode==='unicode'?[['all','unicode-0'],['no-publication','unicode-0'],['no-publication','unicode-1'],['all','unicode-1']]:mode==='editor-unicode'?[[reference,'editor-unicode-0'],['editor','editor-unicode-0']]:mode==='editor'?[[reference,'editor-0'],['editor','editor-0'],['editor','editor-1'],[reference,'editor-1']]:[];
if(!jobs.length)throw Error('Unknown batch');
const records=[];
for(const [variant,session] of jobs){
const started=new Date().toISOString();console.log('Starting',variant,session,started);
const child=spawn(process.execPath,[join(home,'screen.mjs'),variant,session],{env:{...process.env,EXPLORE_DAYS:'20',EXPLORE_UNICODE:mode.includes('unicode')?'1':'0'},stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
records.push({variant,session,started,finished:new Date().toISOString(),code});writeFileSync(join(home,mode+'-batch.json'),JSON.stringify(records,null,2));
if(code!==0)throw Error('Session failed; result retained, batch stopped');
}
