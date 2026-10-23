import { test, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadavg, freemem } from 'node:os';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { decodeInboundBatch, decodeInboundBatchPages } from '../../account-protocol/inboundBatch';
import { decodeInboundRequest, decodeInboundPage } from '../../account-protocol/inboundTransport';
import { decodePositionResponse } from '../../account-protocol/positionDecision';
import { start, stop, setPhase, requests, frames, pressureOffers, labelBearer, attributeRequests } from './runtime.mjs';

const root = process.env.SYNC_ROOT!, out = process.env.SYNC_OUT!, dist = process.env.SYNC_DIST!;
const mode = process.env.SYNC_MODE!, delay = Number(process.env.SYNC_DELAY ?? '0');
mkdirSync(out, {recursive: true, mode: 0o700});
const prefixes = ['Sync target A:', 'Sync target B:'];
const card = (p: Page, who = 0) => p.locator('.day-panel[data-active="true"] .card').filter({hasText: prefixes[who]}).first();
const content = (p: Page) => p.locator('.card[data-editing="true"] .cm-content');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function focus(p: Page, who = 0) { await card(p, who).locator('.card-surface').press('Enter'); await content(p).waitFor(); await p.keyboard.press('ControlOrMeta+End'); }
async function day(p: Page, value: string) { await p.getByLabel('Go to date', {exact: true}).fill(value); await expect(card(p)).toBeVisible(); }
async function lock(p: Page) { await p.getByRole('button', {name: 'Lock workspace', exact: true}).click(); await expect(p.locator('.shell')).toHaveCount(0); }
async function acceptedPosition(p: Page) { return Number((await p.getByText(/^Accepted position:/).innerText()).split(':').at(-1)!.trim()); }
async function exported(p: Page) {
  const waiting = p.waitForEvent('download'); await p.getByRole('button', {name: 'Export markdown', exact: true}).click();
  const d = await waiting, bytes = readFileSync((await d.path())!); let offset = 0; const files: Record<string,string> = {};
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18), n = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString('utf8', offset + 30, offset + 30 + n), begin = offset + 30 + n + extra;
    files[name] = bytes.toString('utf8', begin, begin + size); offset = begin + size;
  }
  return files;
}
function archiveIdentity(files: Record<string,string>) { return {entries:Object.entries(files).map(([name,text])=>({name,bytes:Buffer.byteLength(text),characters:text.length})),files: Object.keys(files).length, bytes: Object.values(files).reduce((n,s)=>n+Buffer.byteLength(s),0), sha256: digest(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))))}; }

function installProbe() {
  const rows: any[] = [], inputs: any[] = [], trace: any[] = [], longtasks: any[] = [], progress: any[] = [];
  let targets: Element[] = [], last = [-1,-1];
  let lastProgress = '';
  const now = () => performance.timeOrigin + performance.now();
  const read = () => {
    const status = document.querySelector('[aria-label="Sync status"]')?.textContent ?? '';
    const accepted = Number(/Accepted position:\s*(\d+)/.exec(status)?.[1] ?? -1);
    const received = Number(/Received positions:\s*(\d+)/.exec(status)?.[1] ?? -1);
    const stamp = accepted + ':' + received;
    if (stamp !== lastProgress) { lastProgress = stamp; if(progress.length<20000)progress.push({at:now(),accepted,received}); }
    if (targets.length !== 2 || targets.some(e => !e.isConnected)) {
      const all = [...document.querySelectorAll('.day-panel[data-active="true"] .card')];
      targets = ['Sync target A:', 'Sync target B:'].map(prefix => all.find(c => c.textContent?.includes(prefix))!).filter(Boolean);
    }
    if (targets.length !== 2) return;
    const lengths = targets.map(c => (c.querySelector('.cm-content') ?? c.querySelector('.card-surface'))?.textContent?.length ?? -1);
    if (lengths.some((n,i)=>n!==last[i])) { last = lengths; if (rows.length < 20000) rows.push({at: now(), lengths}); }
  };
  new MutationObserver(read).observe(document, {subtree:true, childList:true, characterData:true});
  addEventListener('beforeinput', (e: Event) => {
    const event = e as InputEvent;
    if (!(event.target instanceof Element) || !event.target.closest('.card')) return;
    const row = {at: now(), dataLength: event.data?.length ?? 0, type: event.inputType, rafAt: 0}; inputs.push(row);
    requestAnimationFrame(()=>{row.rafAt=now();});
  }, true);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(l => {for (const e of l.getEntries()) longtasks.push({at: performance.timeOrigin+e.startTime, ms:e.duration});}).observe({type:'longtask'});
  Object.defineProperty(window, '__syncTrace', {value: (...args: any[])=>{if(trace.length<30000)trace.push({at:now(),args});}});
  Object.defineProperty(window, '__syncProbe', {value: {read:()=>({rows:structuredClone(rows), inputs:structuredClone(inputs), trace:structuredClone(trace), longtasks:structuredClone(longtasks), progress:structuredClone(progress), ledger:(window as any).__doneLedgerMetrics?.(), native:(window as any).__attribution?.read()}), sample:read}});
}
function watch(p: Page, label: string, log: any[], tasks: Promise<any>[]) {
  const pending = new Map();
  p.on('request', req => {
    const path = new URL(req.url()).pathname;
    if (!path.startsWith('/account/')) return;
    const row: any = {id:log.length,device:label,path,at:Date.now(),bodySha256:req.postDataBuffer()?digest(req.postDataBuffer()!):null};
    labelBearer(req.headers()['authorization'],label);
    if (path.endsWith('/read-v2')) {const q=decodeInboundRequest(new Uint8Array(req.postDataBuffer()!));Object.assign(row,{after:q.after,limit:q.limit,self:q.reader===q.publisher});}
    if (path.endsWith('/read-v2-batch')) {row.batch=decodeInboundBatch(new Uint8Array(req.postDataBuffer()!)).map(bytes=>{const q=decodeInboundRequest(bytes);bytes.fill(0);return {after:q.after,limit:q.limit,self:q.reader===q.publisher};});}
    log.push(row);pending.set(req,row);
  });
  p.on('response', response => {
    const row=pending.get(response.request()); if(!row)return;
    row.headersAt=Date.now();row.status=response.status();
    if (row.path.endsWith('/submit') || row.path.endsWith('/read-v2') || row.path.endsWith('/read-v2-batch')) tasks.push((async()=>{
      try {
        const bytes=new Uint8Array(await response.body());row.bodyAt=Date.now();
        if(response.status()===409){try{const hint=JSON.parse(Buffer.from(bytes).toString('utf8'));for(const k of ['kind','reason','refusal'])if(typeof hint[k]==='string'&&/^[a-z-]{1,64}$/.test(hint[k]))row[k]=hint[k]}catch{row.unclassified=true}}
        if(response.status()===200) {
          if(row.path.endsWith('/submit')) {const decoded=decodePositionResponse(bytes);row.decisionKind=decoded.kind;if(decoded.kind==='accepted')row.position=decoded.head.position;}
          else if(row.path.endsWith('/read-v2-batch')) {row.pages=decodeInboundBatchPages(bytes).map(b=>{const q=decodeInboundPage(b);b.fill(0);return {entries:q.entries.length,next:q.next,through:q.through};});}
          else {const decoded=decodeInboundPage(bytes);Object.assign(row,{entries:decoded.entries.length,next:decoded.next,through:decoded.through});}
        }
        bytes.fill(0);
      }catch {row.bodyUnavailable=true;}
    })());
  });
  p.on('requestfailed',req=>{const row=pending.get(req);if(row)row.failedAt=Date.now();});
}
async function saveFixture(state: string, dest: string, a: any, b: any, expected: string, date: string) {
  mkdirSync(dest,{recursive:true,mode:0o700});cpSync(state,join(dest,'state'),{recursive:true,errorOnExist:true});
  writeFileSync(join(dest,'fixture.json'),JSON.stringify({a,b,expected,date,state:join(dest,'state')}),{mode:0o600});
}

import { installDispatchProbe, browserIdentity, clockBrackets } from './dispatch-probe';
import { installCapacityProbe } from './capacity-probe';

test('dispatch controls with real catch-up and unchanged data guards', async ({browser})=>{
  const isolated=process.env.DISPATCH_ISOLATED==='1',focused=process.env.DISPATCH_FOCUSED==='1',target=process.env.DISPATCH_TARGET!;
  const result:any={mode,delay:0,diagnostic:false,outcome:'starting',source:process.env.SYNC_REVISION,isolated,focused,target};
  const network:any[]=[],tasks:Promise<any>[]=[],contexts:BrowserContext[]=[],owned:any[]=[],roots:any[]=[];
  const state=join(out,'state');
  try {
    const seed=JSON.parse(readFileSync(join(root,mode==='foreground'?'caughtup-seed-v3':'backlog-seed-v3','fixture.json'),'utf8'));
    cpSync(seed.state,state,{recursive:true,errorOnExist:true});await start(state,dist,delay);
    const pages:Page[]=[], auths:any[]=[];
    for(const [index,saved] of [seed.a,seed.b].entries()) {
      console.log('Restoring disposable browser',index);
      const owner=index===1&&isolated?await chromium.launch():browser;if(index===1&&isolated)owned.push(owner);roots.push(await browserIdentity(owner));
      const c=await owner.newContext({storageState:saved.storage,viewport:{width:1440,height:1000}});contexts.push(c);
      await c.addInitScript(installDispatchProbe,{fault:false});await c.addInitScript(installCapacityProbe);
      await c.addInitScript(installProbe);const p=await c.newPage();pages.push(p);watch(p,index?'B':'A',network,tasks);
      auths.push(await restoreAuthenticator(p,saved.credentials));await p.goto('/');await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await c.setOffline(true);await openSaved(p,saved.code,index===1);await day(p,seed.date);console.log('Opened disposable browser',index);
    }
    const [a,b]=pages;

    result.roots=roots;expect(roots[0].pid===roots[1].pid).toBe(!isolated);
    if(mode==='foreground'){for(const c of contexts)await c.setOffline(false);for(const [index,p]of pages.entries())await expect.poll(()=>acceptedPosition(p),{timeout:30000}).toBe(index?seed.b.position:seed.a.position);await sleep(3000);}
    const fixtureArchive=await exported(a);expect(fixtureArchive['master.md']!.length).toBeGreaterThanOrEqual(12000);result.initialArchive=archiveIdentity(fixtureArchive);
    result.fixture={activeDayCards:await a.locator('.day-panel[data-active="true"] .card').count(),visibleGoalsDomCharacters:(await a.locator('.goals .cm-content').innerText()).length};
    if(focused&&mode==='catchup')await add(b,'Receiver send sentinel');
    const prepare=async()=>{if(focused)await a.bringToFront();if(target==='plain')await a.evaluate(()=>(window as any).__dispatch.plain());else await focus(a);};
    if(focused)await prepare();
    result.clocks=await Promise.all(pages.map(clockBrackets));
    result.before=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__syncProbe.read())));
    result.hostBefore={load:loadavg(),freeBytes:freemem()};setPhase(mode);result.startedAt=Date.now();for(const c of contexts)await c.setOffline(false);
    if(mode==='foreground') {
      await expect(card(b)).toContainText(seed.expected);await prepare();result.bursts=[];
      for(let i=0;i<30;i++){const text=` L${i};`,offeredAt=Date.now();await a.keyboard.insertText(text);await expect(card(b)).toContainText(text,{timeout:30000});result.bursts.push({index:i,offeredAt,observedBy:Date.now()});}
      result.concurrent={startedAt:Date.now(),offers:[]};
      for(let i=0;i<120;i++){const scheduledAt=result.concurrent.startedAt+i*150;await sleep(Math.max(0,scheduledAt-Date.now()));const at=Date.now();await a.keyboard.press('q');result.concurrent.offers.push({scheduledAt,at,returnedAt:Date.now()});}
      await a.keyboard.press('Escape');await expect(card(b)).toContainText('q'.repeat(120),{timeout:30000});
    } else {
    const writing=(async()=>{
      if(!focused)await prepare();result.concurrent={startedAt:Date.now(),offers:[]};
      for(let i=0;i<120;i++){const scheduledAt=result.concurrent.startedAt+i*150;await sleep(Math.max(0,scheduledAt-Date.now()));const at=Date.now();await a.keyboard.press('w');result.concurrent.offers.push({scheduledAt,at,returnedAt:Date.now()});}
      await a.keyboard.press('Escape');
    })();
    if(!focused)await add(b,'Receiver send sentinel');
    await expect(card(b)).toContainText(seed.expected,{timeout:600000});result.caughtAt=Date.now();console.log('catchup milliseconds',result.caughtAt-result.startedAt);await writing;
    if(target==='editor')await expect(card(b)).toContainText('w'.repeat(120),{timeout:30000});else expect(await a.locator('#dispatch-control').inputValue()).toBe('w'.repeat(120));
    await expect(a.locator('.shell')).toContainText('Receiver send sentinel',{timeout:30000});
    }
    result.completedAt=Date.now();result.hostAfter={load:loadavg(),freeBytes:freemem()};result.browsers=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__syncProbe.read())));result.dispatch=await Promise.all(pages.map(p=>p.evaluate(()=>(window as any).__dispatch.read())));
    const events=result.dispatch[0].events.filter((e:any)=>e.kind==='beforeinput'&&e.target===target.replace('editor','editor')&&e.at>=result.concurrent.startedAt-2&&e.at<=result.completedAt);expect(events.length).toBe(120);if(focused)expect(events.every((e:any)=>e.focused&&e.visible==='visible'&&e.active===target)).toBe(true);
    if(target==='plain')await a.evaluate(()=>(window as any).__dispatch.remove());
    setPhase('guardrails');const before=await exported(a);expect(await exported(b)).toEqual(before);result.export=archiveIdentity(before);
    const peerBefore=await card(b,1).locator('.card-surface').innerText();await focus(b,1);await b.keyboard.insertText(' Guard-B;');await expect(card(a,1)).toContainText('Guard-B;',{timeout:30000});
    await b.keyboard.press('ControlOrMeta+z');await expect(card(b,1)).not.toContainText('Guard-B;');await expect(card(a,1)).not.toContainText('Guard-B;',{timeout:30000});expect(await card(b,1).locator('.card-surface').innerText()).toBe(peerBefore);
    await b.keyboard.press('ControlOrMeta+Shift+z');await expect(card(a,1)).toContainText('Guard-B;',{timeout:30000});await b.keyboard.press('Escape');const final=await exported(a);expect(await exported(b)).toEqual(final);result.finalExport=archiveIdentity(final);
    await lock(b);await b.goto('/');await contexts[1]!.setOffline(true);const reopenedAt=Date.now();await openSaved(b,seed.b.code,true);await day(b,seed.date);result.offlineReopenMs=Date.now()-reopenedAt;expect(await exported(b)).toEqual(final);
    result.guards={bothWay:true,undoRedo:true,wholeExportEquality:true,lockedOfflineReopen:true};result.all120EditorKeysReachedPeer=target==='editor';result.outcome='passed';
  }catch(error){result.outcome='failed';result.failedAt=Date.now();result.error=String(error);throw error;}
  finally{
    await Promise.allSettled(tasks);if(result.outcome==='failed')result.partialDispatch=await Promise.all(contexts.map(c=>c.pages()[0]?.evaluate(()=>(window as any).__dispatch?.read()).catch(()=>null)));
    attributeRequests();result.network=network;result.proxy=requests;result.frames=frames;result.pressureOffers=pressureOffers;result.pressure=process.env.SYNC_PRESSURE==='1';result.driver=(globalThis as any).__dispatchNodeSnapshot?.();
    result.capacity=await Promise.all(contexts.map(c=>c.pages()[0]?.evaluate(()=>(window as any).__capacity?.read()).catch(()=>null)));
    for(const c of contexts)await c.close().catch(()=>{});for(const b of owned)await b.close().catch(()=>{});await stop();writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2));
  }
});
