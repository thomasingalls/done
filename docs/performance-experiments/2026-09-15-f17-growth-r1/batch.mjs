import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const home=import.meta.dirname,mode=process.argv[2];
const jobs=mode==='smoke'?[[2,'retain',0],[2,'clear',0]]:mode==='campaign-v2'?[[20,'retain',0],[20,'clear',0],[40,'clear',0],[40,'retain',0],[40,'retain',1],[40,'clear',1],[20,'clear',1],[20,'retain',1]]:[];
if(!jobs.length)throw Error('Unknown mode');
const path=join(home,mode+'-batch.json');if(existsSync(path))throw Error('Batch output already exists');
mkdirSync(join(home,'results'),{recursive:true});const records=[];
for(const [days,condition,block] of jobs){
 const session=`${mode}-${block}-${days*15}-${condition}`,started=new Date().toISOString();console.log('Starting',session,started);
 const child=spawn(process.execPath,[join(home,'screen.mjs'),condition,session,...(mode==='smoke'?['--smoke']:[])],{detached:true,env:{...process.env,EXPLORE_DAYS:String(days)},stdio:'inherit'});
 const kill=signal=>{try{process.kill(-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};
 let timedOut=false,force;
 const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');force=setTimeout(()=>kill('SIGKILL'),4000);},240000);
 const {code,signal}=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);clearTimeout(force);
 let drained=false;try{process.kill(-child.pid,0);}catch(e){if(e.code==='ESRCH')drained=true;else throw e;}
 if(!drained)kill('SIGKILL');
 records.push({session,days,condition,block,started,finished:new Date().toISOString(),code,signal,timedOut,drained});writeFileSync(path,JSON.stringify(records,null,2));
 if(code!==0||timedOut||!drained)throw Error('Session failed; batch stopped and evidence retained');
}
