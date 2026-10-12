import MagicString from '../../../../node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/dist/magic-string.es.mjs';
import { parse } from '../../../../node_modules/.pnpm/@babel+parser@7.29.7/node_modules/@babel/parser/lib/index.js';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-prepared-receive/probe/build.config';

// Test-only instrumentation. No source values, identifiers, key material or writing are retained.
const helper = `
(globalThis as any).__stalls ??= (() => {
 let on=false, id=0, stack:any[]=[], spans:any[]=[], finals:any[]=[], stats:any={};
 return {
 reset(){on=true;stack=[];spans=[];finals=[];stats={};},
 begin(name:string,sync=true,bytes=0,trace=false){
  if(!on)return;
  const row:any={id:++id,name,at:performance.now(),bytes,parent:stack.at(-1)?.id??null,
   caller:stack.at(-1)?.name??'async/root'};
  if(trace)row.stack=new Error().stack;
  if(sync)stack.push(row);
  return row;
 },
 end(row:any,sync=true){
  if(!row)return;
  row.ms=performance.now()-row.at;
  if(sync && stack.pop()!==row)throw Error('Probe stack changed');
  const key=row.name+' <- '+row.caller;
  const s=stats[key]??={calls:0,ms:0,max:0,bytes:0};
  s.calls++;s.ms+=row.ms;s.max=Math.max(s.max,row.ms);s.bytes+=row.bytes;
  if(row.ms>=1 || row.name.startsWith('final') || row.stack)spans.push(row);
 },
 final(row:any){if(on)finals.push(row);},
 read(){return {spans:[...spans],finals:[...finals],stats:structuredClone(stats)};}
 };
})();
`;
export default defineConfig(async (env) => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {
    ...config,
    plugins: [{
      name: 'final-apply-attribution', enforce: 'pre' as const,
      transform(code:string,id:string){
        const file=id.split('/').at(-1)!;
        const protocol=id.includes('/account-protocol/') && ['recovery.ts','admission.ts','contentDelivery.ts','contentCheckpoint.ts','inboundTransport.ts'].includes(file);
        const selected=['accountReceive.ts','accountAuthority.ts','admissionQueue.ts','admittedWorkspace.ts','joinedAccount.ts','accountInbound.ts'].some(f=>id.endsWith('/src/crdt/'+f));
        if(!protocol&&!selected)return;
        const out=new MagicString(code);
        out.prepend(helper);
        const before=(anchor:string,text:string)=>{
          if(code.split(anchor).length!==2)throw Error('Ambiguous anchor '+file+': '+anchor);
          out.appendLeft(code.indexOf(anchor),text);
        };
        const after=(anchor:string,text:string)=>{
          if(code.split(anchor).length!==2)throw Error('Ambiguous anchor '+file+': '+anchor);
          out.appendLeft(code.indexOf(anchor)+anchor.length,text);
        };
        const source=parse(code,{sourceType:"module",plugins:["typescript"]});
        const walk=(node:any,parent?:any)=>{
          const isFunction=["FunctionDeclaration","ArrowFunctionExpression","ObjectMethod"].includes(node.type);
          if(isFunction&&node.body?.type==="BlockStatement"){
            const name=node.type==='ArrowFunctionExpression'?(parent?.type==='VariableDeclarator'?parent.id.name:''):node.id?.name??node.key?.name??'';
            const async=!!node.async;
            const wanted=protocol ? /^(parse|decode|encode|verify)/.test(name)||['unhex','hex','lp'].includes(name) :
              file==='joinedAccount.ts'?['parseJoined','readJoinedAccount','authenticateJoinedAccountInventory'].includes(name):
              file==='accountAuthority.ts'?name==='check':
              file==='accountInbound.ts'?name==='verify':
              file==='admittedWorkspace.ts'?name==='verifyProjection':false;
            if(wanted){
              const bytes=protocol&&['hex','unhex'].includes(name)?`typeof value==='string'?value.length/2:value instanceof Uint8Array?value.length:0`:'0';
              const trace=file==='joinedAccount.ts'&&name==='readJoinedAccount';
              out.appendLeft(node.body.start+1,`const __span=(globalThis as any).__stalls.begin('${file}.${name}',${!async},${bytes},${trace});try{`);
              out.appendLeft(node.body.end-1,`}finally{(globalThis as any).__stalls.end(__span,${!async});}`);
            }
          }
          for(const [key,value] of Object.entries(node)){if(key==='loc'||key==='tokens'||key==='comments')continue;if(Array.isArray(value)){for(const child of value)if(child?.type)walk(child,node);}else if(value&&typeof value==='object'&&'type' in value)walk(value,node);}
        };
        walk(source);
        if(file==='accountReceive.ts'){
          const anchor='    return (apply: () => void) =>\n      runCaptureTask(async (task) => {\n        await assertCurrent(task);';
          if(!code.includes(anchor))throw Error('Final handoff anchor');
          out.overwrite(code.indexOf(anchor),code.indexOf(anchor)+anchor.length,
            `return (apply: () => void) => { const __final:any={at:performance.now()}; return runCaptureTask(async(task)=>{__final.acquired=performance.now(); await assertCurrent(task); __final.checked=performance.now();`);
          after('          apply();\n        });\n      });\n  };', '');
          const end='          apply();\n        });\n      });\n  };';
          out.overwrite(code.indexOf(end),code.indexOf(end)+end.length,
            `__final.applyAt=performance.now();apply();__final.applied=performance.now();});}).finally(()=>{__final.end=performance.now();(globalThis as any).__stalls.final(__final);});};\n};`);
        }
        if(file==='accountAuthority.ts'){
          before('        inventory = await task.wait(() => options.read(task));',`const __read=(globalThis as any).__stalls.begin('authority.read',false);\n`);
          after('        inventory = await task.wait(() => options.read(task));',`(globalThis as any).__stalls.end(__read,false);`);
          before('        if (retained !== undefined && equal(retained, inventory)) {',`const __eq=(globalThis as any).__stalls.begin('authority.equal'); const __matches=retained!==undefined&&equal(retained,inventory);(globalThis as any).__stalls.end(__eq);\n`);
          const a='        if (retained !== undefined && equal(retained, inventory)) {';
          out.overwrite(code.indexOf(a),code.indexOf(a)+a.length,'if (__matches) {');
        }
        if(file==='admissionQueue.ts'){
          before('      applyUpdate(canonical, update);',`const __canonical=(globalThis as any).__stalls.begin('final.canonical');\n`);
          after('      applyUpdate(canonical, update);',`(globalThis as any).__stalls.end(__canonical);`);
        }
        if(file==='admittedWorkspace.ts'){
          before("          applyUpdate(accepted!.history.doc, event.update, 'received');",`const __projection=(globalThis as any).__stalls.begin('final.projectionApply');\n`);
          after("          applyUpdate(accepted!.history.doc, event.update, 'received');",`(globalThis as any).__stalls.end(__projection);`);
          before('        emit();\n        if (',`const __publish=(globalThis as any).__stalls.begin('final.publish');\n`);
          after('        emit();\n        if (','');
          const a='        emit();\n        if (';
          out.overwrite(code.indexOf(a),code.indexOf(a)+a.length,'emit();(globalThis as any).__stalls.end(__publish);\nif (');
        }
        return {code:out.toString(),map:out.generateMap({source:id,includeContent:true,hires:true})};
      }
    },config.plugins],
  };
});
