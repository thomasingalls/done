import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {once} from 'node:events';
import {join} from 'node:path';
import {chromium,devices,expect} from '@playwright/test';
import {staticFixtureServer} from '/Users/thomasingalls/.codex/worktrees/c030/done/scripts/release-validation/static-fixture.mjs';
import {install,openLocal,lockLocal,seed,CARD_EDITOR,percentile,CORPUS} from './measure.mjs';
const home=import.meta.dirname, name=process.argv[2], session=process.argv[3], profiling=process.argv.includes('--profile');
assert(name && session);
const out=join(home,'results',session+'-'+name);mkdirSync(out,{recursive:true});
const server=staticFixtureServer(join(home,'builds',name));
const result={name,session,corpus:CORPUS,started:new Date().toISOString(),profiling,rows:[],checks:[],errors:[]};
let browser,context;
const watchdog=setTimeout(()=>{writeFileSync(join(out,'timeout.json'),JSON.stringify(result));process.exit(124)},240000);
try {
server.listen(0,'127.0.0.1');await once(server,'listening');
const baseURL='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
result.browser=browser.version();result.executable=chromium.executablePath();
context=await browser.newContext({...devices['Pixel 7'],viewport:{width:1280,height:900},baseURL});
const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>result.errors.push(String(e)));
await install(page);await openLocal(page);await seed(page);await openLocal(page);
await page.locator('.goals .cm-content').click();await page.keyboard.insertText('a card to open and type into');
await page.locator('.goals').getByRole('button',{name:'To Scheduled'}).click();
await page.locator('.card[data-section="scheduled"] .card-surface').first().click();
const editor=page.locator(CARD_EDITOR);await expect(editor).toBeVisible();
await page.keyboard.press('ControlOrMeta+End');
const doc=()=>editor.evaluate(el=>el.cmTile.root.view.state.doc.toString());
let wanted=await doc();
const cdp=await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
const type=async(key,n,measure=false)=>{
if(measure)await page.evaluate(()=>window.latencyProbe.armKeystrokes());
for(let i=0;i<n;i++){await page.keyboard.press(key);await page.waitForTimeout(50);}
wanted+=key.repeat(n);assert.equal(await doc(),wanted);
if(measure){const samples=await page.evaluate(()=>window.latencyProbe.readKeystrokes());assert.equal(samples.length,n);assert(samples.every(v=>Number.isFinite(v)&&v>=0));return samples;}
};
await type('w',8);
if(profiling){
await cdp.send('HeapProfiler.enable');await cdp.send('HeapProfiler.collectGarbage');
result.heapBefore=await cdp.send('Runtime.getHeapUsage');
await cdp.send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
await type('p',60);
writeFileSync(join(out,'cpu.json'),JSON.stringify((await cdp.send('Profiler.stop')).profile));
writeFileSync(join(out,'allocation.json'),JSON.stringify((await cdp.send('HeapProfiler.stopSampling')).profile));
await cdp.send('HeapProfiler.collectGarbage');result.heapAfter=await cdp.send('Runtime.getHeapUsage');
}else{
for(const [block,key] of [['shallow','a'],['deeper','b']]){
if(block==='deeper')await type('h',96);
const samples=await type(key,40,true);
const row={block,samples,p50:percentile(samples,50),p95:percentile(samples,95)};result.rows.push(row);
writeFileSync(join(out,'partial.json'),JSON.stringify(result,null,2));console.log(name,session,block,'p50',row.p50,'p95',row.p95);
}
}
result.checks.push('exact text after every block');
result.beforeUndo = await page.evaluate(() => ({active:document.activeElement?.className,status:[...document.querySelectorAll('[role=\"status\"]')].map(x=>x.textContent)}));
const undoAt=performance.now();await page.keyboard.press('ControlOrMeta+z');
result.undoImmediateUnchanged=(await doc())===wanted;
await expect.poll(doc,{timeout:3000}).not.toBe(wanted);
result.undoSettledMs=performance.now()-undoAt;
const redoAt=performance.now();await page.keyboard.press('ControlOrMeta+Shift+z');
result.redoImmediateUnchanged=(await doc())!==wanted;
await expect.poll(doc,{timeout:3000}).toBe(wanted);
result.redoSettledMs=performance.now()-redoAt;result.checks.push('undo/redo exact roundtrip');
await page.keyboard.press('Escape');await lockLocal(page);
if(profiling){await cdp.send('HeapProfiler.collectGarbage');result.heapLocked=await cdp.send('Runtime.getHeapUsage');}
await openLocal(page);
await page.locator('.card[data-section="scheduled"] .card-surface').first().click();
assert.equal(await doc(),wanted);result.checks.push('cold reopen exact text');assert.deepEqual(result.errors,[]);
result.status='passed';
}catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;console.error(result.error);}
finally{
await context?.close();await browser?.close();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
clearTimeout(watchdog);result.finished=new Date().toISOString();result.closed=true;
writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2));console.log('Finished',name,session,result.status);
}
