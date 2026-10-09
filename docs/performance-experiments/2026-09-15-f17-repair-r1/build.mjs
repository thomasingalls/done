import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const home=import.meta.dirname, name=process.argv[2], root=join(home,name);
if(!['selected','candidate'].includes(name))throw Error('variant');
process.chdir(root);
let activated=0;
await build({root,configFile:join(root,'vite.config.ts'),logLevel:'error',plugins:[{name:'private-exploration-mode',enforce:'pre',load(id){
if(id===join(root,'src/crdt/admittedWorkspace.ts')){
const code=readFileSync(id,'utf8');
const from='    options,\n  );\ntype State';
if(!code.includes(from))throw Error('Activation seam moved');
activated++; const transformed = code.replace(from,"    options,\n    'local-snapshots',\n  );\ntype State");
writeFileSync(join(home,name+'-activated-admittedWorkspace.ts'),transformed);return transformed;
}}}],build:{outDir:join(home,'builds',name),sourcemap:'hidden',emptyOutDir:true}});
if(activated!==1)throw Error('Activation count '+activated);
const files=execFileSync('git',['ls-files','src','private','account-protocol','wasm','vite','public','index.html','local.html','vite.config.ts','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
writeFileSync(join(home,'builds',name+'-source.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),activation:'local-snapshots at openAdmittedWorkspace, build transform only',hashes},null,2));
console.log('Built',name);
