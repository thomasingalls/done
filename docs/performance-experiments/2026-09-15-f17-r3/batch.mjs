import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname, mode=process.argv[2];
const jobs=mode==='comparison'?[['selected','comparison-0'],['candidate','comparison-0'],['candidate','comparison-1'],['selected','comparison-1']]:mode==='unicode'?[['selected','unicode-0'],['candidate','unicode-0']]:[];
if(!jobs.length)throw Error('Unknown batch');
const records=[];
for(const [variant,session] of jobs){
 const started=new Date().toISOString();console.log('Starting',variant,session,started);
 const child=spawn(process.execPath,[join(home,'screen.mjs'),variant,session],{env:{...process.env,EXPLORE_DAYS:'20',EXPLORE_UNICODE:mode==='unicode'?'1':'0'},stdio:'inherit'});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 records.push({variant,session,started,finished:new Date().toISOString(),code});writeFileSync(join(home,mode+'-batch.json'),JSON.stringify(records,null,2));
 if(code!==0)throw Error('Session failed; result retained, batch stopped');
}
