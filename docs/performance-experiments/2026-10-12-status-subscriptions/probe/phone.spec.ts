import { test, expect } from '@playwright/test';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Phone, connectPhone, restorePhone, adb } from './phone';
import { installRecorder, typeAtCadence } from './input';
import { restoreAuthenticator, openSaved } from '../../../../test/packaged-account/devices';
import { startBackend, startApp, stopAll } from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
const root='/tmp/done-status-subscriptions-20261012';
const marker='done-status-subscriptions-e730ac57-physical-20261012';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function align(p:Phone){const samples=[];for(let i=0;i<7;i++){const a=Date.now(),remote=await p.evaluate(()=>Date.now()),b=Date.now();samples.push({offset:remote-(a+b)/2,error:(b-a)/2});}return samples.sort((a,b)=>a.error-b.error)[0]!;}
async function exportDesktop(page:any){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export markdown',exact:true}).click();const b=readFileSync(await(await pending).path()),files:Record<string,string>={};let at=0;while(b.readUInt32LE(at)===0x04034b50){const size=b.readUInt32LE(at+18),n=b.readUInt16LE(at+26),extra=b.readUInt16LE(at+28),start=at+30+n+extra;files[b.toString('utf8',at+30,at+30+n)]=b.toString('utf8',start,start+size);at=start+size;}return createHash('sha256').update(JSON.stringify(files)).digest('hex');}

test('Pixel active-peer companion, native viewport, exact text and recovery',async({browser})=>{
 const out=process.env.DONE_PERF_RESULTS!;mkdirSync(out,{recursive:true});
 const f=JSON.parse(readFileSync('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json','utf8'));
 const state=out+'/state';cpSync(f.state,state,{recursive:true,errorOnExist:true});
 const result:any={arm:process.env.TYPING_ARM,mode:'active',cpu:1,delayMs:75,device:{model:adb('shell','getprop','ro.product.model').trim(),android:adb('shell','getprop','ro.build.version.release').trim()}};
 let p:Phone|undefined,context:any,peerWork:Promise<void>|undefined;
 try{
  await startBackend(state);await startApp(state);
  context=await browser.newContext({storageState:f.a.storage,viewport:{width:1440,height:1000}});
  const a=await context.newPage();await restoreAuthenticator(a,f.a.credentials);await a.goto('http://localhost:53771/');await openSaved(a,f.a.code);await a.getByLabel('Go to date',{exact:true}).fill('2026-10-11');
  p=await connectPhone();await p.send('Network.setBypassServiceWorker',{bypass:true});await p.navigate('/__status-probe-empty.html');await restorePhone(p,f.b.storage,marker);
  // Joined-device reopening uses the saved lock code and remembered network login.
  // Android CDP has no virtual-authenticator domain; do not replace any credential checks.
  await p.send('Network.setBypassServiceWorker',{bypass:false});await p.navigate('/');await p.unlock(f.b.code);
  await p.menu(true);await p.fill('Go to date','2026-10-11');
  await expect.poll(async()=>exportDesktop(a),{timeout:120000}).toBe(await p.exported());
  await p.menu(false);
  await p.evaluate(()=>{const card=[...document.querySelectorAll<HTMLElement>('.card')].find(e=>e.textContent?.includes('Project 2:'))!;card.scrollIntoView();card.querySelector<HTMLElement>('.card-surface')!.focus();});
  await p.key('Enter','Enter',13);await p.until(()=>!!document.querySelector('.card[data-editing="true"] .cm-content'));
  await p.evaluate(()=>{const el=document.querySelector('.card[data-editing="true"] .cm-content');const v=(window as any).__perfEditors.find((v:any)=>v.contentDOM===el);v.dispatch({selection:{anchor:v.state.doc.length}});v.focus();});
  await sleep(2000);const initial=await p.text();result.initialChars=initial.length;
  const card=a.locator('.card').filter({hasText:'Project 1:'}).first();await card.locator('.card-surface').press('Enter');await a.keyboard.press('ControlOrMeta+End');
  result.clock=await align(p);result.metadata=await p.evaluate(()=>({ua:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height},visibility:document.visibilityState}));
  expect(result.metadata.visibility).toBe('visible');result.batteryBefore=adb('shell','dumpsys','battery').split('\n').filter(x=>/level:|temperature:|status:|powered:/.test(x));
  result.before=await p.evaluate(()=>(window as any).__doneLedgerMetrics());
  await installRecorder(p as any,'.card[data-editing="true"] .cm-content');
  await p.evaluate(()=>{(window as any).__phoneVisibility=[];document.addEventListener('visibilitychange',()=>{(window as any).__phoneVisibility.push({at:performance.now(),state:document.visibilityState});});});
  result.syncBefore=[await a.evaluate(()=>(window as any).__perfSync()),await p.evaluate(()=>(window as any).__perfSync())];
  p.phase='typing';
  const input={send:(method:string,params:any)=>p!.send(method,{...params,timestamp:params.timestamp+result.clock.offset/1000})};
  peerWork=(async()=>{for(let i=0;i<22;i++){await sleep(2000);await a.keyboard.press('p');}})();
  result.injected=await typeAtCadence(input as any,300);
  await p.until(()=>(window as any).__typing().samples.length===300&&(window as any).__typing().samples.every((s:any)=>s.afterFrame!==undefined));
  expect(await p.text()).toBe(initial+'x'.repeat(300));Object.assign(result,await p.evaluate(()=>(window as any).__typing()));
  result.after=await p.evaluate(()=>(window as any).__doneLedgerMetrics());result.syncAfter=[await a.evaluate(()=>(window as any).__perfSync()),await p.evaluate(()=>(window as any).__perfSync())];
  result.visibilityChanges=await p.evaluate(()=>(window as any).__phoneVisibility);expect(result.visibilityChanges.some((x:any)=>x.state!=='visible')).toBe(false);
  result.clockAfter=await align(p);p.phase='verification';await peerWork;
  await p.key('z','KeyZ',90,2);await expect.poll(()=>p!.text()).toBe(initial+'x'.repeat(299));
  await p.key('z','KeyZ',90,3);await expect.poll(()=>p!.text()).toBe(initial+'x'.repeat(300));result.undoRedo=true;
  await expect.poll(async()=>await exportDesktop(a)===await p!.exported(),{timeout:180000}).toBe(true);
  result.exportHash=await p.exported();result.converged=true;
  await p.click('Lock workspace');await stopAll();
  await p.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await p.navigate('/');await p.unlock(f.b.code);expect(await p.exported()).toBe(result.exportHash);result.coldReplay=true;
  await p.click('Lock workspace');result.phase='passed';result.batteryAfter=adb('shell','dumpsys','battery').split('\n').filter(x=>/level:|temperature:|status:|powered:/.test(x));
  expect(p.errors).toEqual([]);
 }catch(error){if(p&&!result.injected)result.setupDiagnostic=await p.evaluate(async()=>({path:location.pathname,buttons:[...document.querySelectorAll('button,a')].map(e=>e.textContent?.trim()).filter(Boolean),messages:[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent),databases:(await indexedDB.databases()).length,storageKeys:localStorage.length})).catch(()=>undefined);result.phase='failed';result.error=String(error).slice(0,1500);throw error;}
 finally{
  if(peerWork)await peerWork.catch(()=>{});
  writeFileSync(out+'/result.json',JSON.stringify({...result,requests:p?.requests,errors:p?.errors},null,2));
  if(p)await p.close();
  await context?.close();await stopAll();
 }
});
