import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-final-apply/probe/build.config';

// Diagnostic-only numeric events. No database names, keys, values or writing are retained.
const helper = `
(globalThis as any).__authorityIO ??= (()=>{
 let on=false,seq=0,rows:any[]=[],tasks=new WeakMap(),databases=new WeakMap();
 const event=(row:any,name:string)=>{if(row)row.events.push({name,at:performance.now()});};
 return {
 reset(){on=true;rows=[];tasks=new WeakMap();databases=new WeakMap();},
 begin(task:any){if(!on)return; if(tasks.has(task))throw Error('Overlapping diagnostic authority check');
   const row={id:++seq,at:performance.now(),events:[]};tasks.set(task,row);rows.push(row);return row;},
 end(task:any,row:any){if(!row)return;row.end=performance.now();tasks.delete(task);},
 mark(task:any,name:string){event(tasks.get(task),name);},
 bind(db:any,task:any){const row=tasks.get(task);if(row)databases.set(db,row);},
 db(db:any,name:string){event(databases.get(db),name);},
 read(){return structuredClone(rows);}
 };
})();
`;
export default defineConfig(async env=>{
 const config=await(typeof base==='function'?base(env):base);
 return {...config,plugins:[{name:'fresh-authority-read-attribution',enforce:'pre' as const,
 transform(code:string,id:string){
  const file=id.split('/').at(-1)!;
  if(!['accountAuthority.ts','startupStorage.ts','contentDatabase.ts','cpuBudget.ts'].some(f=>id.endsWith('/src/crdt/'+f)))return;
  const out=new MagicString(code);out.prepend(helper);
  const index=(anchor:string)=>{if(code.split(anchor).length!==2)throw Error('Ambiguous '+file+' anchor: '+anchor);return code.indexOf(anchor);};
  const before=(anchor:string,value:string)=>out.appendLeft(index(anchor),value);
  const after=(anchor:string,value:string)=>out.appendLeft(index(anchor)+anchor.length,value);
  const replace=(anchor:string,value:string)=>out.overwrite(index(anchor),index(anchor)+anchor.length,value);
  const mark=(name:string)=>`(globalThis as any).__authorityIO.mark(task,'${name}');`;
  const dbmark=(name:string)=>`(globalThis as any).__authorityIO.db(db,'${name}');`;
  if(file==='accountAuthority.ts'){
   after('    async check(task: SessionTask): Promise<void> {',`const __io=(globalThis as any).__authorityIO.begin(task);try{`);
   replace('        busy = false;\n      }\n    },','        busy = false;\n      }\n}finally{(globalThis as any).__authorityIO.end(task,__io);}\n    },');
   before('        inventory = await task.wait(() => options.read(task));',mark('read.wait'));
   after('        inventory = await task.wait(() => options.read(task));',mark('read.return'));
  }
  if(file==='cpuBudget.ts'){
   replace('        const pause = checkpoint();\n        if (pause) await pause;',
    `const pause=checkpoint();if(pause){${mark('yield.begin')}await pause;${mark('yield.end')}}`);
  }
  if(file==='startupStorage.ts'){
   after('  task.wait(async () => {',mark('probe.begin'));
   before('      const request = task.step(() => indexedDB.open(name));',mark('open.call'));
   after('      const request = task.step(() => indexedDB.open(name));',mark('open.issued'));
   after('      request.onsuccess = () => {',mark('open.success'));
   before('    if (!db) return null;',mark('open.resumed')+'if(db)(globalThis as any).__authorityIO.bind(db,task);');
   replace('      return await task.wait(() => read(db));',`return await task.wait(()=>{${mark('read.callback')}return read(db);});`);
   before('      db.close();',mark('close.call'));
   after('      db.close();',mark('close.return'));
   after('export const checkLayout = (db: IDBDatabase, expected: Record<string, string | null>): void => {',dbmark('layout.call'));
   after("  const tx = db.transaction(Object.keys(expected), 'readonly');",dbmark('layout.issued')+`tx.addEventListener('complete',()=>{${dbmark('layout.complete')}});`);
   before('};\n\nexport const readRow =',dbmark('layout.return'));
   before('        const req = tx.objectStore(store).openCursor(IDBKeyRange.lowerBound(prefix));',mark('cursor.call'));
   after('        const req = tx.objectStore(store).openCursor(IDBKeyRange.lowerBound(prefix));',mark('cursor.issued'));
   replace('        req.onsuccess = () =>\n          guard(() => {',`req.onsuccess=()=>{${mark('cursor.callback')}try{return guard(()=>{`);
   replace('            rows.push({ key: cursor.key, value: cursor.value });',`${mark('value.call')}rows.push({key:cursor.key,value:cursor.value});${mark('value.return')}`);
   replace('            cursor.continue();\n          });',`cursor.continue();});}finally{${mark('cursor.return')}}};`);
  }
  if(file==='contentDatabase.ts'){
   before('    const tx = task.step(() => db.transaction(stores, mode, { durability }));',mark('transaction.call'));
   after('    const tx = task.step(() => db.transaction(stores, mode, { durability }));',mark('transaction.issued'));
   after('    tx.oncomplete = () => {',mark('transaction.complete'));
   after('\n    tx.onabort = () => {',mark('transaction.abort'));
  }
  return {code:out.toString(),map:out.generateMap({source:id,includeContent:true,hires:true})};
 }},config.plugins]};
});
