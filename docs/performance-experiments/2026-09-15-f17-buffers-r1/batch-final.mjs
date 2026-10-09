import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const home=import.meta.dirname,mode=process.argv[2];
const jobs=mode==='comparison'?[['selected','final-comparison-0'],['candidate','final-comparison-0'],['candidate','final-comparison-1'],['selected','final-comparison-1']]:mode==='unicode'?[['selected','final-unicode-0'],['candidate','final-unicode-0']]:[];
if(!jobs.length)throw Error('Unknown mode');
const path=join(home,'final-'+mode+'-batch.json');if(existsSync(path))throw Error('Batch output already exists');
const verify=()=>{for(const [p,h] of Object.entries(JSON.parse(readFileSync(join(home,'frozen-final.json'))).pins))assert.equal(createHash('sha256').update(readFileSync(join(home,p))).digest('hex'),h,p);};
mkdirSync(join(home,'results'),{recursive:true});const records=[];
for(const [variant,session] of jobs){
 verify();const started=new Date().toISOString();console.log('Starting',variant,session,started);
 const child=spawn(process.execPath,[join(home,'screen.mjs'),variant,session],{detached:true,env:{...process.env,EXPLORE_DAYS:'20',EXPLORE_UNICODE:mode==='unicode'?'1':'0'},stdio:'inherit'});
 const kill=signal=>{try{process.kill(-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};
 let timedOut=false,force;
 const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');force=setTimeout(()=>kill('SIGKILL'),4000);},240000);
 const {code,signal}=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);clearTimeout(force);
 let drained=false;try{process.kill(-child.pid,0);}catch(e){if(e.code==='ESRCH')drained=true;else throw e;}
 if(!drained)kill('SIGKILL');
 records.push({variant,session,started,finished:new Date().toISOString(),code,signal,timedOut,drained});writeFileSync(path,JSON.stringify(records,null,2));
 if(code!==0||timedOut||!drained)throw Error('Session failed; batch stopped and evidence retained');
 verify();
}
