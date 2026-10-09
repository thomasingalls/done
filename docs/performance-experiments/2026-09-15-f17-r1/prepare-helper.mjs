import {stripTypeScriptTypes} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const root='/Users/thomasingalls/.codex/worktrees/c030/done';
for(const name of ['measure','recorder']) {
let text=readFileSync(root+'/test/latency/'+name+'.ts','utf8').replace("from './recorder'","from './recorder.mjs'");
if(name==='measure')text=text.replace('days: 20','days: Number(process.env.EXPLORE_DAYS ?? 5)');
writeFileSync(import.meta.dirname+'/'+name+'.mjs',stripTypeScriptTypes(text));
}
