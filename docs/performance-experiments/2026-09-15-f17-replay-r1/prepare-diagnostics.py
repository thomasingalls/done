from pathlib import Path
h=Path(__file__).parent
p=h/'build.mjs';s=p.read_text().replace("name=process.argv[2], root", "name=process.argv[2], diagnostic=process.argv.includes('--diagnostic'), root").replace("['selected','candidate']", "['selected','guarded','candidate']").replace("if(name==='candidate')", "if(name!=='selected')")
s=s.replace("if(id===join(root,'src/crdt/admittedWorkspace.ts')){", """if(diagnostic && id===join(root,'src/crdt/yjs.ts')) {
 let code=readFileSync(id,'utf8');
 const once=(before,after)=>{if(code.split(before).length!==2)throw Error('Diagnostic seam '+before);code=code.replace(before,after);};
 code+=`\nconst cost = <T>(name: string, fn:()=>T):T => {\n const host=globalThis as typeof globalThis & {__costs?:{name:string;ms:number}[]};\n if(!host.__costs)return fn();\n const at=performance.now();try{return fn();}finally{host.__costs.push({name,ms:performance.now()-at});}\n};\n`;
 once('const forkHistory = (','const forkHistory: typeof forkHistoryInner = (...args) => cost(\\'fresh-total\\',()=>forkHistoryInner(...args));\\nconst forkHistoryInner = (');
 once('const doc = forkRuntimeDoc(source.doc, false, reuseStrings);',\"const doc = cost('fresh-doc',()=>forkRuntimeDoc(source.doc, false, reuseStrings));\");
 if(name==='selected'){
 once('    const copySet = (',\"    cost('fresh-stacks',()=>{\\n    const copySet = (\");
 once('    manager.lastChange = source.lastChange;', '    manager.lastChange = source.lastChange;\\n    });');
 } else {
 once('    copyHistoryStacks(source, manager, copyMetadata);',\"    cost('fresh-stacks',()=>copyHistoryStacks(source, manager, copyMetadata));\");
 once(\"      applyUpdate(target.doc, update, 'text-buffer-catch-up');\",\"      cost('catchup-replay',()=>applyUpdate(target.doc, update, 'text-buffer-catch-up'));\");
 once('      copyHistoryStacks(source, target, (meta) => snapshots.fork(meta));',\"      cost('catchup-stacks',()=>copyHistoryStacks(source, target, (meta) => snapshots.fork(meta)));\");
 if(name==='guarded')once('if (!sameDocState(target.doc, source.doc))',\"if (!cost('catchup-compare',()=>sameDocState(target.doc, source.doc)))\");
 }
 writeFileSync(join(home,name+'-diagnostic-yjs.ts'),code);return code;
}
if(id===join(root,'src/crdt/admittedWorkspace.ts')){""")
p.write_text(s)
p=h/'screen.mjs';s=p.read_text().replace("if(name==='candidate'&&!result.unicode)","if(name!=='selected'&&!result.unicode)")
s=s.replace("const samples=await type(key,40,true);", "if(process.env.EXPLORE_COSTS==='1')await page.evaluate(()=>{globalThis.__costs=[];});\nconst samples=await type(key,40,true);\nif(process.env.EXPLORE_COSTS==='1'){const calls=await page.evaluate(()=>{const calls=globalThis.__costs;delete globalThis.__costs;return calls;});(result.costs??=[]).push({block,calls});}")
p.write_text(s)
print('Diagnostic build-only transforms and explicit screen amendment prepared')
