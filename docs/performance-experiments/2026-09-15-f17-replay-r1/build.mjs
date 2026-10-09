import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const home=import.meta.dirname, name=process.argv[2], diagnostic=process.argv.includes('--diagnostic'), root=join(home,name);
if(!['selected','guarded','candidate'].includes(name))throw Error('variant');
process.chdir(root);
let activated=0;
await build({root,configFile:join(root,'vite.config.ts'),logLevel:'error',plugins:[{name:'private-exploration-mode',enforce:'pre',load(id){
if(diagnostic && id===join(root,'src/crdt/yjs.ts')) {
 let code=readFileSync(id,'utf8');
 const once=(before,after)=>{if(code.split(before).length!==2)throw Error('Diagnostic seam '+before);code=code.replace(before,after);};
 code+=`
const cost = <T>(name: string, fn:()=>T):T => {
 const host=globalThis as typeof globalThis & {__costs?:{name:string;ms:number}[]};
 if(!host.__costs)return fn();
 const at=performance.now();try{return fn();}finally{host.__costs.push({name,ms:performance.now()-at});}
};
`;
 once('const forkHistory = (','const forkHistory: typeof forkHistoryInner = (...args) => cost(\'fresh-total\',()=>forkHistoryInner(...args));\nconst forkHistoryInner = (');
 once('const doc = forkRuntimeDoc(source.doc, false, reuseStrings);',"const doc = cost('fresh-doc',()=>forkRuntimeDoc(source.doc, false, reuseStrings));");
 if(name==='selected'){
 once('    const copySet = (',"    cost('fresh-stacks',()=>{\n    const copySet = (");
 once('    manager.lastChange = source.lastChange;', '    manager.lastChange = source.lastChange;\n    });');
 } else {
 once('    copyHistoryStacks(source, manager, copyMetadata);',"    cost('fresh-stacks',()=>copyHistoryStacks(source, manager, copyMetadata));");
 once("      applyUpdate(target.doc, update, 'text-buffer-catch-up');","      cost('catchup-replay',()=>applyUpdate(target.doc, update, 'text-buffer-catch-up'));");
 once('      copyHistoryStacks(source, target, (meta) => snapshots.fork(meta));',"      cost('catchup-stacks',()=>copyHistoryStacks(source, target, (meta) => snapshots.fork(meta)));");
 if(name==='guarded')once('if (!sameDocState(target.doc, source.doc))',"if (!cost('catchup-compare',()=>sameDocState(target.doc, source.doc)))");
 }
 writeFileSync(join(home,name+'-diagnostic-yjs.ts'),code);return code;
}
if(id===join(root,'src/crdt/admittedWorkspace.ts')){
const code=readFileSync(id,'utf8');
const from='    options,\n  );\ntype State';
if(!code.includes(from))throw Error('Activation seam moved');
activated++; let transformed = code.replace(from,"    options,\n    'local-snapshots',\n  );\ntype State");
const hook = `const recordTextBuffer = (reused: boolean) => {
 const host = globalThis as typeof globalThis & { __textBuffers?: {prepares:number;reuses:number} };
 const counts = host.__textBuffers ??= {prepares:0,reuses:0};
 counts.prepares++; if(reused)counts.reuses++;
};
`;
transformed = transformed.replace('type State =',hook+'type State =');
const fresh='scope?.ownState(state);';
if(transformed.split(fresh).length!==2)throw Error('Fresh counter seam');
transformed=transformed.replace(fresh,'recordTextBuffer(false); '+fresh);
if(name!=='selected'){
 const reuse='scope!.ownState(state);';
 if(transformed.split(reuse).length!==2)throw Error('Reuse counter seam');
 transformed=transformed.replace(reuse,'recordTextBuffer(true); '+reuse);
}
writeFileSync(join(home,name+'-activated-admittedWorkspace.ts'),transformed);return transformed;
}}}],build:{outDir:join(home,'builds',name),sourcemap:'hidden',emptyOutDir:true}});
if(activated!==1)throw Error('Activation count '+activated);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','private','account-protocol','wasm','vite','public','index.html','local.html','vite.config.ts','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim().split('\n');
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
writeFileSync(join(home,'builds',name+'-source.json'),JSON.stringify({base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),activation:'local-snapshots at openAdmittedWorkspace, build transform only',hashes},null,2));
console.log('Built',name);
