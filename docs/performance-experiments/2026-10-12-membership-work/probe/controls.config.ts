import { defineConfig } from 'vite';
import base from './build.config';
// Only this diagnostic build exposes fault controls; never shipped or used for timings.
export default defineConfig(async env => {
 const config = await (typeof base === 'function' ? base(env) : base);
 return {...config, plugins:[{name:'membership-handoff-controls',enforce:'pre' as const,
  transform(code:string,id:string){
   if(!id.endsWith('/src/crdt/accountReceive.ts'))return;
   const anchor='          const result = await installMembership(\n            answer.response.proofs,';
   if(code.split(anchor).length!==2)throw Error('Missing membership transfer control');
   code=code.replace(anchor,`const __case=(globalThis as any).__membershipCase;
     if(__case){
       (globalThis as any).__membershipCase=undefined;
       (globalThis as any).__membershipRunning=true;
       if(__case==='context')base={...base};
       if(__case==='payload')expectedPayload=expectedPayload.slice();
       if(__case==='expired')prepared.request.expiresAt=0;
       if(__case==='closed')void carrier.close().catch(()=>{});
       if(__case==='custody')await new Promise<void>((resolve,reject)=>{
         const open=indexedDB.open('done.custody');open.onerror=()=>reject(open.error);
         open.onsuccess=()=>{const db=open.result,tx=db.transaction('entries','readwrite');
           tx.objectStore('entries').put({},[options.slotId,'unexpected-proof-control']);
           tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};
       });
     }
     `+anchor);
   const after='          discoveryDue = revision === discoveryRevision ? performance.now() + 5000 : 0;';
   if(code.indexOf(after,code.indexOf(anchor))<0)throw Error('Missing discovery disposition');
   code=code.replace(after,`if(__case){(globalThis as any).__membershipRunning=false;(globalThis as any).__membershipOutcome={kind:'accepted',transfers:(globalThis as any).__doneLedgerMetrics().work.membershipProofTransfers};}\n`+after);
   const from=code.indexOf(anchor), at=code.indexOf('        } catch {',from);
   code=code.slice(0,at)+code.slice(at).replace('        } catch {',`        } catch {
     if((globalThis as any).__membershipRunning){(globalThis as any).__membershipRunning=false;(globalThis as any).__membershipOutcome={kind:'refused',transfers:(globalThis as any).__doneLedgerMetrics().work.membershipProofTransfers};}`);
   const expose='  const createOutbound = (whenDurable:';
   if(code.split(expose).length!==2)throw Error('Missing owner exposure anchor');
   code=code.replace(expose,`(globalThis as any).__membershipRefresh=()=>refreshAuthority(access??'',true);\n`+expose);
   return code;
  }},config.plugins]};
});
