import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {once} from 'node:events';
import {join} from 'node:path';
import {chromium,devices,expect} from '@playwright/test';
import {staticFixtureServer} from '/Users/thomasingalls/.codex/worktrees/c030/done/scripts/release-validation/static-fixture.mjs';
import {install,openLocal,lockLocal,seed,CARD_EDITOR,percentile,CORPUS} from './measure.mjs';
const home=import.meta.dirname,mode=process.argv[2],session=process.argv[3],smoke=process.argv.includes('--smoke');
assert(['retain','clear'].includes(mode)&&session&&[2,20,40].includes(CORPUS.days));
const warm=smoke?4:8,samplesPerBlock=smoke?8:80,growth=smoke?40:1000;
const out=join(home,'results',session);mkdirSync(out); // refuse reuse
const server=staticFixtureServer(join(home,'builds/selected'));
const result={session,mode,smoke,corpus:CORPUS,started:new Date().toISOString(),protocol:{warm,samplesPerBlock,growth,cpu:4,gapMs:50},rows:[],facts:{},checks:[],errors:[],growthKeys:0};
const save=()=>writeFileSync(join(out,'partial.json'),JSON.stringify(result,null,2));
let browser,context,timer;
const run=async()=>{
 server.listen(0,'127.0.0.1');await once(server,'listening');
 browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
 result.browser=browser.version();result.executable=chromium.executablePath();assert.equal(result.browser,'151.0.7922.34');
 context=await browser.newContext({...devices['Pixel 7'],viewport:{width:1280,height:900},baseURL:'http://127.0.0.1:'+server.address().port});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>{result.errors.push(String(e));save();});
 await install(page);await openLocal(page);await seed(page);await openLocal(page);
 result.checks.push('UI-seeded corpus cold-verified');
 const marker='growth diagnostic card 🚀';
 await page.locator('.goals .cm-content').click();await page.keyboard.insertText(marker);
 await page.locator('.goals').getByRole('button',{name:'To Scheduled'}).click();
 const card=page.locator('.card[data-section="scheduled"] .card-surface').filter({hasText:marker});await expect(card).toHaveCount(1);await card.click();
 const editor=page.locator(CARD_EDITOR);await expect(editor).toBeVisible();await page.keyboard.press('ControlOrMeta+End');
 const doc=()=>editor.evaluate(el=>el.cmTile.root.view.state.doc.toString());
 let wanted=await doc();assert(wanted.includes(marker));result.marker=true;result.emoji=true;
 const inspect=()=>page.evaluate(()=>window.__f17Growth.inspect());
 result.facts.initial=await inspect();assert.equal(result.facts.initial.cards,CORPUS.days*15+1);assert.equal(result.facts.initial.redo,0);
 const cdp=await context.newCDPSession(page);
 const cpu=rate=>cdp.send('Emulation.setCPUThrottlingRate',{rate});
 const type=async(key,n,measure=false,gap=50)=>{
  if(measure)await page.evaluate(()=>window.latencyProbe.armKeystrokes());
  const started=performance.now();
  for(let i=0;i<n;i++){
   await page.keyboard.press(key);if(gap)await page.waitForTimeout(gap);result.growthKeys++;
   if(!gap&&(i+1)%100===0){assert.equal(await doc(),wanted+key.repeat(i+1));console.log(session,'growth',result.growthKeys);save();}
  }
  wanted+=key.repeat(n);await expect.poll(doc,{timeout:3000}).toBe(wanted);
  if(measure){
   const samples=await page.evaluate(()=>window.latencyProbe.readKeystrokes());assert.equal(samples.length,n);assert(samples.every(v=>Number.isFinite(v)&&v>=0));
   return {samples,p50:percentile(samples,50),p95:percentile(samples,95),elapsedMs:performance.now()-started};
  }
 };
 await cpu(4);await type('w',warm);
 result.facts.earlyStart=await inspect();
 result.rows.push({block:'early',...await type('a',samplesPerBlock,true)});
 result.facts.earlyEnd=await inspect();assert.equal(result.facts.earlyEnd.undo-result.facts.initial.undo,warm+samplesPerBlock);save();
 console.log(session,'early',result.rows.at(-1).p50,result.rows.at(-1).p95);
 await cpu(1);await type('g',growth-warm-samplesPerBlock,false,0);
 result.facts.grown=await inspect();assert.equal(result.growthKeys,growth);assert.equal(result.facts.grown.undo-result.facts.initial.undo,growth);
 if(mode==='clear'){
  result.intervention=await page.evaluate(()=>window.__f17Growth.clearHistory());
  assert.equal(result.intervention.before.undo,result.facts.grown.undo);assert.equal(result.intervention.after.undo,0);assert.equal(result.intervention.after.redo,0);
  assert.equal(result.intervention.before.canonicalDigest,result.intervention.after.canonicalDigest);
  assert.equal(result.intervention.before.historyDigest,result.intervention.after.historyDigest);
  assert.equal(result.intervention.before.contentDigest,result.intervention.after.contentDigest);
  result.checks.push('history cleared with document/content/selection/revision unchanged');
 }else{
  result.retained=await inspect();assert.deepEqual(result.retained,result.facts.grown);result.checks.push('history retained unchanged');
 }
 await expect(editor).toBeFocused();assert.equal(await doc(),wanted);
 await cpu(4);await type('w',warm);result.facts.deepStart=await inspect();
 const expectedUndo=mode==='clear'?warm:result.facts.grown.undo+warm;assert.equal(result.facts.deepStart.undo,expectedUndo);
 result.rows.push({block:'deep',...await type('b',samplesPerBlock,true)});
 result.facts.deepEnd=await inspect();assert.equal(result.facts.deepEnd.undo,result.facts.deepStart.undo+samplesPerBlock);
 result.checks.push('exact text and actual one-group-per-key history at every block');save();console.log(session,'deep',result.rows.at(-1).p50,result.rows.at(-1).p95,'undo',result.facts.deepStart.undo,'→',result.facts.deepEnd.undo);
 await page.keyboard.press('ControlOrMeta+z');await expect.poll(doc,{timeout:3000}).toBe(wanted.slice(0,-1));
 await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(doc,{timeout:3000}).toBe(wanted);result.checks.push('exact one-key undo/redo');
 await page.keyboard.press('Escape');await lockLocal(page);await openLocal(page);
 await page.locator('.card[data-section="scheduled"] .card-surface').filter({hasText:marker}).click();assert.equal(await doc(),wanted);result.checks.push('cold reopen exact text');
 result.facts.reopened=await inspect();assert.equal(result.facts.reopened.undo,0);assert.deepEqual(result.errors,[]);
 result.status='passed';
};
try{await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Session exceeded 230-second bound')),230000);})]);}
catch(error){result.status='failed';result.error=String(error.stack??error);process.exitCode=1;console.error(result.error);}
finally{
 clearTimeout(timer);result.closure={};
 const close=async(name,fn)=>{let t;try{await Promise.race([fn(),new Promise((_,rej)=>{t=setTimeout(()=>rej(Error('Close timeout: '+name)),4000);})]);result.closure[name]=true;}catch(e){result.closure[name]=false;result.errors.push(String(e));result.status='failed';process.exitCode=1;}finally{clearTimeout(t);}};
 await close('context',()=>context?.close());await close('browser',()=>browser?.close());
 await close('server',()=>new Promise((resolve,reject)=>{if(!server.listening)return resolve();server.closeAllConnections();server.close(e=>e?reject(e):resolve());}));
 result.finished=new Date().toISOString();result.closed=Object.values(result.closure).every(Boolean);
 writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2));console.log('Finished',session,result.status);
}
