import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { connectPhone, type Phone } from './phone';
import { installRecorder, typeAtCadence } from './input';
test('Pixel recorder calibration on a fresh disposable origin',async()=>{
 const server=createServer((_req,res)=>res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div contenteditable="true"></div>'));
 await new Promise<void>(yes=>server.listen(53771,'127.0.0.1',yes));let p:Phone|undefined;
 try{
  p=await connectPhone();await p.evaluate(async()=>{if(localStorage.length||(await indexedDB.databases()).length||(await navigator.serviceWorker.getRegistrations()).length||(await caches.keys()).length)throw Error('Refusing occupied phone test origin');});
  await p.evaluate(()=>{document.querySelector<HTMLElement>('div')!.focus();});
  const clocks=[];for(let i=0;i<7;i++){const a=Date.now(),remote=await p.evaluate(()=>Date.now()),b=Date.now();clocks.push({offset:remote-(a+b)/2,error:(b-a)/2});}const clock=clocks.sort((a,b)=>a.error-b.error)[0]!;
  await installRecorder(p as any,'div');
  await p.evaluate(()=>{setTimeout(()=>{const at=performance.now();while(performance.now()-at<200){};(window as any).__knownStall={at,end:performance.now()};},80);});
  const injection={send:(m:string,v:any)=>p!.send(m,{...v,timestamp:v.timestamp+clock.offset/1000})};
  const injected=await typeAtCadence(injection as any,12,50);
  await p.until(()=>(window as any).__typing().samples.length===12&&(window as any).__typing().samples.every((s:any)=>s.frame!==null));
  const result=await p.evaluate(()=>({...((window as any).__typing()),stall:(window as any).__knownStall,ua:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}));
  const out=process.env.DONE_PERF_RESULTS!;mkdirSync(out,{recursive:true});writeFileSync(out+'/calibration.json',JSON.stringify({...result,clock,clocks,injected},null,2));
  const inside=result.samples.filter((s:any)=>s.eventAt>=result.stall.at&&s.eventAt<result.stall.end);
  expect(inside.length).toBeGreaterThanOrEqual(2);expect(Math.max(...inside.map((s:any)=>s.dispatchMs))).toBeGreaterThan(80);
  expect(await p.evaluate(()=>document.querySelector('div')!.textContent)).toBe('x'.repeat(12));
  expect(result.tasks.some((t:any)=>t.ms>=190)).toBe(true);
 }finally{await p?.close();await new Promise<void>(yes=>server.close(()=>yes()));}
});
