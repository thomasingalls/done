import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
export const contexts=new AsyncLocalStorage();
export const sha=b=>createHash('sha256').update(b).digest('hex');
let events=[],dropped=0,serial=0;const max=200000;
export function observe(tag,data={}){const c=contexts.getStore();if(!c)return;if(events.length>=max){dropped++;return}events.push({at:Date.now(),mono:performance.now(),id:c.id,path:c.path,bodySha256:c.bodySha256,stage:c.stage??'outside',tag,...data});}
export function take(){const old=events;old.push({tag:'observer-counts',dropped,recorded:events.length});events=[];dropped=0;return old;}
export async function span(tag,fn){const c=contexts.getStore();if(!c)return await fn();const n=++serial,t=performance.now(),cpu=process.cpuUsage();observe('span-begin',{name:tag,span:n});let ok=false;try{const value=await contexts.run({...c,stage:tag},fn);ok=true;return value}finally{observe('span-end',{name:tag,span:n,ok,elapsedMs:performance.now()-t,processCpuDuringSpan:process.cpuUsage(cpu)});}}
export function syncSpan(tag,fn){const c=contexts.getStore();if(!c)return fn();const n=++serial,t=performance.now(),cpu=process.cpuUsage();observe('span-begin',{name:tag,span:n});let ok=false;try{const value=contexts.run({...c,stage:tag},fn);ok=true;return value}finally{observe('span-end',{name:tag,span:n,ok,elapsedMs:performance.now()-t,processCpuDuringSpan:process.cpuUsage(cpu)});}}
const bins=[1,2,5,10,25,50,100,250,500,1000,2000,5000,10000,Infinity];
for(const op of ['verify','importKey','digest','sign']){const original=crypto.subtle[op].bind(crypto.subtle);Object.defineProperty(crypto.subtle,op,{configurable:true,value:async(...args)=>{const c=contexts.getStore(),at=performance.now();try{return await original(...args)}finally{if(c?.crypto){const key=(c.stage??'outside')+':'+op;let v=c.crypto.get(key);if(!v){v={stage:c.stage??'outside',op,count:0,sumMs:0,maxMs:0,bins:bins.map(()=>0)};c.crypto.set(key,v)}const ms=performance.now()-at;v.count++;v.sumMs+=ms;v.maxMs=Math.max(v.maxMs,ms);v.bins[bins.findIndex(x=>ms<=x)]++;}}}});}
export function summary(c,status){contexts.run(c,()=>observe('crypto-summary',{status,elapsedMs:Date.now()-c.startedAt,bins:bins.map(v=>Number.isFinite(v)?v:'infinity'),rows:[...c.crypto.values()]}));}
