import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {loadavg} from 'node:os';
import assert from 'node:assert/strict';
import {packagedApplication} from '/Users/thomasingalls/.codex/worktrees/7fda/done/scripts/lib/packaged-application.mjs';

const root='/Users/thomasingalls/.codex/worktrees/7fda/done';
const require=createRequire(root+'/package.json');
const {chromium,devices}=require('@playwright/test');
const {recorder}=await import(root+'/test/latency/recorder.ts');
const [label,dist,mode='paired']=process.argv.slice(2);
assert(label&&dist);
const output='/private/tmp/done-performance-regression-2026-10-26/'+label;
mkdirSync(output,{recursive:false});
const serve=packagedApplication(resolve(dist));
const server=createServer((q,r)=>{r.setHeader('Cross-Origin-Opener-Policy','same-origin');r.setHeader('Cross-Origin-Embedder-Policy','require-corp');serve(q,r)});
await new Promise((yes,no)=>{server.once('error',no);server.listen(53926,'127.0.0.1',yes)});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results={label,dist:resolve(dist),browser:browser.version(),cpuThrottle:4,rows:[],errors:[],physicalGboard:false,accountMaintenanceActive:false,peerLatencyMeasured:false,typingGateMs:16};
const note='ordinary details to keep, an idea for later, and a small decision still to make';
const corpus=kind=>[
 '# Work','A loose note before the project.','## Studio site','Site notes.','### Launch',
 ...Array.from({length:400},(_,i)=>`- Task ${i}: ${note}\n  - nested note ${i}: keep the original order`),
 ...(kind==='line'?['- FOCUS '+ 'x'.repeat(260)]:Array.from({length:24},(_,i)=>`- n${i}`)),
 '# Home','Milk, cabinet measurements, and a quote to revisit.',
].join('\n');
const getView=element=>element.cmTile.root.view;
const rank=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
try {
 const kinds=['smoke','line'].includes(mode)?['line']:['line','boundaries'];
 const order=mode==='smoke'?[true]:[true,false,false,true,true,false];
 for(const kind of kinds)for(const [i,gentle] of order.entries()){
  const context=await browser.newContext({...devices['Pixel 7']});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.addInitScript(recorder);
   await page.addInitScript(value=>localStorage.setItem('done.ui.gentle-context',value?'1':'0'),gentle);
   const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto('http://127.0.0.1:53926/');await page.locator('.shell[data-local-workspace]').waitFor();
   await page.getByRole('button',{name:'Open Goals',exact:true}).first().click();
   const editor=page.locator('.goals .cm-content');await editor.waitFor({state:'visible'});
   const text=corpus(kind);await editor.click();await page.keyboard.insertText(text);
   await page.waitForFunction(expected=>{const e=document.querySelector('.goals .cm-content');return e?.cmTile?.root?.view?.state.doc.toString()===expected},text);
   await page.reload();await page.locator('.shell[data-local-workspace]').waitFor();
   await page.getByRole('button',{name:'Open Goals',exact:true}).first().click();await editor.waitFor({state:'visible'});
   const observed=await editor.evaluate(getViewAndText=>getViewAndText.cmTile.root.view.state.doc.toString());assert.equal(observed,text);
   const setting=page.getByRole('checkbox',{name:'Gentle context',exact:true,includeHidden:true});assert.equal(await setting.isChecked(),gentle);
   const marker=kind==='line'?'x'.repeat(260):'- n23';
   const at=text.indexOf(marker)+marker.length;assert(at>=marker.length);
   await editor.evaluate((e,at)=>{const v=e.cmTile.root.view;v.dispatch({selection:{anchor:at},scrollIntoView:true});v.focus()},at);
   await page.waitForTimeout(1000);
   const count=mode==='smoke'?12:80;
   const hostLoadBefore=loadavg();
   await page.evaluate(()=>latencyProbe.armKeystrokes());
   for(let n=0;n<count;n++){await page.keyboard.press('Backspace');await page.waitForTimeout(50)}
   await page.waitForTimeout(120);
   const samples=await page.evaluate(()=>latencyProbe.readKeystrokes());assert.equal(samples.length,count);
   await page.waitForFunction(expected=>document.querySelector('.goals .cm-content')?.cmTile?.root?.view?.state.doc.toString()===expected,text.slice(0,at-count)+text.slice(at));
   const final=await editor.evaluate(e=>e.cmTile.root.view.state.doc.toString());assert.equal(final,text.slice(0,at-count)+text.slice(at));
   assert.deepEqual(errors,[]);
   const row={kind,index:i,gentle,keystrokes:count,characters:text.length,lines:text.split('\n').length,samples,p50:rank(samples,.5),p95:rank(samples,.95),max:Math.max(...samples),hostLoadBefore,hostLoadAfter:loadavg(),gatePassed:rank(samples,.95)<16};results.rows.push(row);
   writeFileSync(output+'/results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({...row,samples:undefined}));
  }catch(error){results.errors.push({kind,index:i,gentle,message:error.message});await page.screenshot({path:output+`/failure-${kind}-${i}.png`});throw error}
  finally{await context.close()}
 }
}finally{
 writeFileSync(output+'/results.json',JSON.stringify(results,null,2)+'\n');await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
