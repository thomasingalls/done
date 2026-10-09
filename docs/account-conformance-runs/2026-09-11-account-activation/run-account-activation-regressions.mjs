import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
const output = resolve('test-results/account-activation-regressions', new Date().toISOString().replaceAll(':','-'));
mkdirSync(output,{recursive:true}); console.log(output);
const summary={started:new Date().toISOString(),stages:[],status:'running'};
const save=()=>writeFileSync(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');save();
for(const [name,args,limit] of [
 ['unit',['node_modules/vitest/vitest.mjs','run','--maxWorkers=2'],180000],
 ['service-core',['--test','--test-concurrency=1','test/account-core/core.test.mjs','test/account-core/restart.test.mjs','test/account-core/controls.test.mjs','test/account-core/properties.test.mjs','test/account-recovery/core.test.mjs','test/account-recovery/restart.test.mjs','test/account-recovery/controls.test.mjs','test/account-recovery/properties.test.mjs'],180000],
 ['genesis',['scripts/account-genesis/run.mjs'],180000],
 ['admission',['scripts/account-admission/run.mjs'],180000],
 ['handoff',['scripts/account-handoff/run.mjs'],180000],
 ['service-delivery',['scripts/account-service-delivery/run.mjs'],180000],
 ['bounds',['scripts/account-admission-bounds/run.mjs'],180000],
 ['sync',['scripts/account-sync/run.mjs'],780000]
]){
 console.log('Starting '+name);
 const log=createWriteStream(join(output,name+'.log'));
 const child=spawn(process.execPath,args,{detached:true,env:{...process.env,CI:'1'},stdio:['ignore','pipe','pipe']});
 let timedOut=false,forced;
 const kill=s=>{try{process.kill(-child.pid,s)}catch{}};
 const deadline=setTimeout(()=>{timedOut=true;kill('SIGTERM');forced=setTimeout(()=>kill('SIGKILL'),5000)},limit);
 const heartbeat=setInterval(()=>console.log(name+' is running'),15000);
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>log.write(b));
 const code=await new Promise(resolve=>{child.once('close',c=>resolve(c??1));child.once('error',e=>{log.write(String(e));resolve(1)})});
 clearTimeout(deadline);clearTimeout(forced);clearInterval(heartbeat);await new Promise(r=>log.end(r));
 summary.stages.push({name,command:[process.execPath,...args],code,timedOut});save();console.log(name+': '+code);
 if(code||timedOut){summary.status='failed';break;}
}
if(summary.status==='running')summary.status='passed';summary.finished=new Date().toISOString();save();console.log(JSON.stringify(summary));process.exitCode=summary.status==='passed'?0:1;
