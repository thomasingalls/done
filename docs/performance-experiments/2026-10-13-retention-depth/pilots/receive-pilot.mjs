import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadavg, cpus, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { native, selected, close, args, syncBundle } from '../../../../test/account-sync/fixtures.mjs';
import { answer } from '../../../../test/account-receive/fixtures.mjs';
const out = process.env.DEPTH_OUT;
if (!out) throw Error('DEPTH_OUT required');
mkdirSync(out, { recursive: true });
const pilot = process.env.DEPTH_PILOT === '1';
const ownerBundle = await syncBundle('retention-owner');
const hash = b => createHash('sha256').update(b).digest('hex');
const report = { source: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), pilot,
  host: { node: process.version, cpu: cpus()[0].model, memory: totalmem(), load: loadavg() },
  seeds: [], samples: [], errors: [] };
const save = () => writeFileSync(join(out,'results.json'), JSON.stringify(report,null,2));
const diff = (a,b) => Object.fromEntries(Object.keys(b).map(k=>[k,b[k]-(a[k]??0)]));
const metric = p => p.evaluate(()=>__doneLedgerMetrics());
const digest = p => p.evaluate(async()=> {
  const b = editor.snapshot();
  return { bytes:b.length, hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)), n=>n.toString(16).padStart(2,'0')).join(''), chars: editor.read().master.length };
});
async function open(p,item) {
  await p.evaluate(ownerBundle);
  return p.evaluate(async item=> {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const start=performance.now();
    window.opened=await Harness.openOwnedSyncingAccountWorkspace(optionsFor(item), window.depthToken);
    window.editor=opened.workspace;
    window.surface=editor.text({kind:'master'});
    return performance.now()-start;
  },args(item));
}
async function inventory(p) {
  return p.evaluate(async()=> {
    const db=await new Promise((yes,no)=>{ const r=indexedDB.open(opened.dbName); r.onsuccess=()=>yes(r.result); r.onerror=()=>no(r.error); });
    try { return await new Promise((yes,no)=>{
      const tx=db.transaction(['meta','content','heads','outbound']), out={};
      for(const name of ['meta','content','heads','outbound']) {
        const q=tx.objectStore(name).getAll(); q.onsuccess=()=>{ out[name]={rows:q.result.length, bytes:q.result.reduce((n,r)=>n+(r?.ct?.length??0),0)}; };
      }
      tx.oncomplete=()=>yes(out); tx.onabort=()=>no(tx.error);
    }); } finally {db.close();}
  });
}
async function observations(p) {
  await p.evaluate(()=> {
    window.nativeCounts={}; window.longTasks=[];
    for(const name of ['decrypt','verify','digest','importKey','deriveKey','sign','encrypt']) {
      const fn=SubtleCrypto.prototype[name];
      SubtleCrypto.prototype[name]=function(...args) { nativeCounts[name]=(nativeCounts[name]??0)+1; return fn.apply(this,args); };
    }
    new PerformanceObserver(l=>{ for(const e of l.getEntries()) longTasks.push({at:e.startTime,ms:e.duration}); }).observe({type:'longtask'});
  });
}
async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  return cdp.send('Runtime.getHeapUsage');
}
// The new context gets the same synthetic passkey oracle as the native fixture. It cannot access real accounts.
async function clone(f,item,storage) {
  const c=await f.context.browser().newContext({storageState:storage});
  await c.route(f.server.origin+'/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Disposable retention depth</title>'}));
  await c.exposeBinding('observeNetInvocation',()=>{});
  await c.exposeBinding('testAssertion',(_source,request)=>{
    const v=item.key.assert({options:{challenge:Buffer.from(request.challenge).toString('base64url')}},{client:{origin:f.server.origin}});
    return {credentialId:v.id,...Object.fromEntries(['authenticatorData','clientDataJSON','signature'].map(k=>[k,[...Buffer.from(v.response[k],'base64url')]]))};
  });
  const p=await c.newPage(); await f.setup(p); await p.evaluate(token=>window.depthToken=token,f.testOperatorToken); await observations(p);
  return {c,p,cdp:await c.newCDPSession(p)};
}
async function oneReceive(f,item,p,wire,previous) {
  const query=await p.evaluate(async()=>[...await retentionTestOwner.prepareRead()]);
  const a=answer(f,item,query,wire,previous);
  const r=await p.evaluate(async b=>retentionTestOwner.receivePage(new Uint8Array(b)),[...a.bytes]);
  assert.equal(r.recorded,true,JSON.stringify(r));
  return a.link;
}
async function sample(f,item,storage,depth,arm,rep,wires,previous) {
  const {c,p,cdp}=await clone(f,item,storage);
  const row={depth,arm,rep,load:loadavg(),started:new Date().toISOString()};
  try {
    row.coldMs=await open(p,item);
    row.coldMetrics=await metric(p); row.coldNative=await p.evaluate(()=>nativeCounts);
    row.snapshot=await digest(p); row.inventory=await inventory(p); row.heap=await heap(cdp);
    const before=await metric(p);
    row.statusMs=await p.evaluate(async()=>{const times=[];for(let n=0;n<5;n++){const t=performance.now();await opened.deliveryStatus();times.push(performance.now()-t);}return times;});
    row.statusWork=diff(before.work,(await metric(p)).work);
    // Observe journal write before the admitted Yjs state can change, without changing persistence.
    await p.evaluate(()=>{
      const set=Storage.prototype.setItem; window.journalBeforeApply=false;
      const original=editor.read().master;
      Storage.prototype.setItem=function(k,v){if(k.startsWith('done.pending-update.')) journalBeforeApply ||= editor.read().master===original;return set.call(this,k,v);};
    });
    const start=await metric(p);
    row.edit=await p.evaluate(async()=>{
      const t=performance.now(),original=editor.read().master;
      await surface.input({name:'insert',text:'LOCAL '},{ranges:[{anchor:0,head:0}],main:0}).accepted;
      const admitted=performance.now(); await editor.whenDurable(); const durable=performance.now();
      await editor.command({kind:'undo'}).accepted; if(editor.read().master!==original)throw Error('Undo changed retained content');
      await editor.command({kind:'redo'}).accepted; if(editor.read().master!=='LOCAL '+original)throw Error('Redo differs');
      await editor.whenDurable(); await opened.deliveryStatus();
      return {admittedMs:admitted-t,durableMs:durable-t,journalBeforeApply};
    });
    assert.equal(row.edit.journalBeforeApply,true);
    row.editWork=diff(start.work,(await metric(p)).work);
    const receiveBefore=await metric(p),at=Date.now();
    let link=previous;
    for(let n=0;n<8;n++) link=await oneReceive(f,item,p,wires[depth+n],link);
    row.receiveMs=Date.now()-at; row.receiveWork=diff(receiveBefore.work,(await metric(p)).work);
    row.after=await metric(p);row.longTasks=await p.evaluate(()=>longTasks);
    const expected=await digest(p);await close(p);await p.close();
    const reopened=await c.newPage();await f.setup(reopened);await reopened.evaluate(token=>window.depthToken=token,f.testOperatorToken);await open(reopened,item);
    assert.deepEqual(await digest(reopened),expected);row.recovered=true;await close(reopened);
    row.phase='passed';
  } catch(e){row.phase='failed';row.error=String(e);throw e;}
  finally{report.samples.push(row);save();await c.close();}
}
test('bounded history-depth measurements', {timeout:1800000}, async t=> {
  const f=await native(t),item=await selected(f,'retention-depth');
  await f.page.evaluate(token=>window.depthToken=token,f.testOperatorToken);
  report.host.chromium=f.context.browser().version();
  await open(f.page,item);const initial=await f.page.evaluate(()=>[...editor.snapshot()]);await close(f.page);
  const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:resolve('docs/performance-experiments/2026-10-13-retention-depth/probe/browser.ts'),name:'Depth',formats:['iife']}}});
  const code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk').code;
  report.helperBundle=hash(code);await f.page.evaluate(code);
  const depths=pilot?[1]:[1,129,601,1201];
  const wires=await f.page.evaluate(({item,initial,count})=>Depth.envelopes(item.slotId,item.code,initial,count),{item:args(item),initial,count:depths.at(-1)+8});
  await open(f.page,item);
  let previous='00'.repeat(32),position=0,expected,shallow;
  const seedAt=Date.now();
  for(const [index,depth] of depths.entries()) {
    while(position<depth){
      previous=await oneReceive(f,item,f.page,wires[position],previous);position++;
      if(position%100===0)console.log('seeded',position);
      if(Date.now()-seedAt>900000)throw Error('Fixture construction ceiling exceeded');
    }
    const snap=await digest(f.page);if(expected)assert.deepEqual(snap,expected);else expected=snap;
    await close(f.page);
    const complete=await f.context.storageState({indexedDB:true});
    const {c,p}=await clone(f,item,complete);
    let reduced,cut;
    try {
      await open(p,item);const before=await metric(p),at=Date.now();
      cut=await p.evaluate(()=>opened.removeLocalHistory(0));
      const ms=Date.now()-at;assert.equal(cut.kind,'removed',JSON.stringify(cut));
      assert.deepEqual(await digest(p),expected);
      const inv=await inventory(p);assert.equal(inv.content.rows+inv.heads.rows+inv.outbound.rows,0);
      report.seeds.push({depth,snapshot:snap,cut,cutMs:ms,cutWork:diff(before.work,(await metric(p)).work),inventory:inv,longTasks:await p.evaluate(()=>longTasks)});
      await close(p);reduced=await c.storageState({indexedDB:true});
    } finally{await c.close();}
    if(index===0)shallow={complete,reduced,previous};
    for(let rep=0;rep<(pilot?1:3);rep++)for(const arm of (index+rep)%2?['reduced','complete']:['complete','reduced']){
      console.log('measuring',depth,arm,rep);
      await sample(f,item,arm==='complete'?complete:reduced,depth,arm,rep,wires,previous);
    }
    await open(f.page,item);save();
  }
  if(!pilot)for(const arm of ['reduced','complete'])await sample(f,item,shallow[arm],1,arm,'anchor',wires,shallow.previous);
  await close(f.page);save();
});
