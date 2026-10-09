import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname,mode=process.argv[2];
const jobs=mode==='screen'?[['preparation','screen-0'],['allocation','screen-0'],['publication','screen-0'],['publication','screen-1'],['allocation','screen-1'],['preparation','screen-1'],['baseline','screen-1']]:mode==='confirm'?[['baseline','confirm-0'],['combined','confirm-0'],['combined','confirm-1'],['baseline','confirm-1']]:mode==='combine'?[['baseline','combine-0'],['combined','combine-0'],['combined','combine-1'],['baseline','combine-1']]:[];
if(!jobs.length)throw Error('Unknown batch');
const records=[];
for(const [variant,session] of jobs){
const started=new Date().toISOString();console.log('Starting',variant,session,started);
const child=spawn(process.execPath,[join(home,'screen.mjs'),variant,session],{env:{...process.env,EXPLORE_DAYS:mode==='confirm'?'20':'5'},stdio:'inherit'});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
records.push({variant,session,started,finished:new Date().toISOString(),code});writeFileSync(join(home,mode+'-batch.json'),JSON.stringify(records,null,2));
if(code!==0)throw Error('Screen failed; retained result, stop batch');
}
