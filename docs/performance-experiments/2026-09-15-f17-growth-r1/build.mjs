import {build} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const home=import.meta.dirname,root=join(home,'selected');process.chdir(root);
let activated=0;
await build({root,configFile:join(root,'vite.config.ts'),logLevel:'error',plugins:[{name:'private-growth-diagnostic',enforce:'pre',load(id){
if(id!==join(root,'src/crdt/admittedWorkspace.ts'))return;
let code=readFileSync(id,'utf8');
const from='    options,\n  );\ntype State',end='  return Object.freeze(api);';
if(code.split(from).length!==2||code.split(end).length!==2)throw Error('Growth activation seam moved');
activated++;
code=code.replace(from,"    options,\n    'local-snapshots',\n  );\ntype State");
const addition=`  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw Error('Disposable growth build requires loopback');
  Object.assign(globalThis, { __f17Growth: createGrowthProbe({
    live, getHistory: () => accepted!.history, getSelections: () => accepted!.selections,
    getGroup: () => accepted!.group, getStatus: () => session.status, read,
    snapshot: () => session.snapshot(), encode: (doc: Y.Doc) => Y.encodeStateAsUpdate(doc),
    matches: (doc: Y.Doc) => session.matches(doc), whenDurable: () => session.whenDurable(), emit,
  }) });
`;
code=`import {createGrowthProbe} from ${JSON.stringify(join(home,'probe.mjs'))};\n`+code.replace(end,addition+end);
writeFileSync(join(home,'activated-admittedWorkspace.ts'),code);return code;
}}],build:{outDir:join(home,'builds/selected'),sourcemap:'hidden',emptyOutDir:true}});
if(activated!==1)throw Error('Activation count '+activated);
const files=execFileSync('git',['ls-files','src','vite','public','index.html','local.html','vite.config.ts','pnpm-lock.yaml'],{encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
writeFileSync(join(home,'source.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),activation:'build-only local-snapshots plus out-of-band growth hook',hashes},null,2));
console.log('Built selected growth diagnostic');
