import { defineConfig } from 'vite';
import base from './build.config';
// Test-only exposure to count one *completed* unchanged discovery, not a typing-window proxy.
export default defineConfig(async env => {
 const config=await (typeof base==='function'?base(env):base);
 return {...config,plugins:[{name:'one-membership-operation',enforce:'pre' as const,
  transform(code:string,id:string){
   if(!id.endsWith('/src/crdt/accountReceive.ts'))return;
   const anchor='  const createOutbound = (whenDurable:';
   if(code.split(anchor).length!==2)throw Error('Missing owned operation anchor');
   return code.replace(anchor,`(globalThis as any).__membershipOperation=async()=>{
     await refreshAuthority(access??'',true);
     (globalThis as any).__stalls.reset();
     const before=(globalThis as any).__doneLedgerMetrics().work;
     const result=await refreshAuthority(access??'',true);
     const after=(globalThis as any).__doneLedgerMetrics().work;
     const stats=(globalThis as any).__stalls.read().stats;
     const calls=(prefix:string)=>Object.entries(stats).filter(([k])=>k.startsWith(prefix+' <- ')).reduce((sum,[,v]:any)=>sum+v.calls,0);
     return {kind:result.kind,signatures:calls('admission.ts.verifySignature'),receipts:calls('admission.ts.verifyReceipt'),certifications:calls('contentDelivery.ts.verifyCertificationSuccessor'),fullJoinedReads:calls('joinedAccount.ts.readJoinedAccount'),authorityChecks:after.authorityChecks-before.authorityChecks,transfers:after.membershipProofTransfers-before.membershipProofTransfers};
   };\n`+anchor);
  }},config.plugins]};
});
