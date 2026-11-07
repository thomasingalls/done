import assert from 'node:assert/strict';
import{acceptedRows}from'/Users/thomasingalls/.codex/worktrees/7fda/done/test/inbound-native/fixtures';
import{validatePreparation}from'./preparation-validation.mjs';
import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {start,stop} from '/private/tmp/done-stage5-rebind-458-20261106/runtime.mjs';
import {seedProfile} from '/private/tmp/done-stage5-gates-461-20261106/seed-profile';
import {restoreAuthenticator,credentials,openSaved} from '/private/tmp/done-stage5-rebind-458-20261106/harness/devices';
import {card,exported,archiveIdentity,lock} from '/private/tmp/done-stage5-rebind-458-20261106/harness/common';
const out=process.env.FAIR_OUT!;
test('grow3072 through actual individually accepted writing without altering old reader profiles',async({browser})=>{
  const fixture=JSON.parse(readFileSync('/private/tmp/done-stage5-grown-prepare-465-20261106/grown-fixture/fixture.json','utf8'));
  const account=fixture.accounts.find((a:any)=>a.label==='H'),saved=account.actors[0];
  const result:any={outcome:'starting',apparatusOnly:true,acceptanceCredit:false,accepted:[],guards:{}};
  mkdirSync(out,{recursive:true,mode:0o700});
  const save=()=>writeFileSync(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
  let context:any,page:any,auth:any;const requests=new WeakMap<any,number>();let nextRequest=0;
  try{
    expect(account.backlog).toBe(2048);expect(new Date().toISOString().slice(0,10)).toBe(account.date);
    cpSync(fixture.state,join(out,'state'),{recursive:true,errorOnExist:true});
    await start(join(out,'state'),process.env.FAIR_DIST!);
    context=await browser.newContext({baseURL:'http://localhost:53781',viewport:{width:1440,height:1000},timezoneId:'UTC'});
    await context.addInitScript(()=>{
 const g=globalThis as any;g.__trace498={events:[],polls:[],last:null};
 const note=(event:any)=>{g.__trace498.events.push({at:Date.now(),...event});};
 g.__attach498=()=>{const b=g.b,remember=()=>{const s={sync:b.session.session.sync.status,workspace:b.workspace.status,local:b.session.session.devices.localHistory?.status},key=JSON.stringify(s);if(key!==g.__trace498.last){g.__trace498.polls.push({at:Date.now(),...s});g.__trace498.last=key;}};b.session.session.sync.onStatus(remember);b.workspace.onStatus(remember);b.session.session.devices.localHistory?.onStatus(remember);remember();};
 addEventListener('error',e=>note({kind:'window-error',message:e.message,filename:e.filename,stack:e.error?.stack}));
 addEventListener('unhandledrejection',e=>note({kind:'unhandled',name:e.reason?.name,code:e.reason?.code,message:String(e.reason),stack:e.reason?.stack}));
 const worker=Worker.prototype.terminate;Worker.prototype.terminate=function(...a:any[]){note({kind:'worker-terminate',stack:new Error().stack});return Reflect.apply(worker,this,a);};
 const add=MessagePort.prototype.addEventListener,seen=new WeakSet();
 MessagePort.prototype.addEventListener=function(type:any,...a:any[]){if(type==='message'&&!seen.has(this)){seen.add(this);Reflect.apply(add,this,['message',(e:any)=>{const m=e.data;if(m?.kind==='closed'||m?.kind==='reply'&&m.ok===false)note({kind:'channel-negative',messageKind:m.kind,id:m.id,method:m.method,code:m.value?.code,ok:m.ok});}]);}return Reflect.apply(add,this,[type,...a]);};
 });
 context.on('request',(request:any)=>{if(!new URL(request.url()).pathname.startsWith('/account/'))return;const id=++nextRequest;requests.set(request,id);appendFileSync(join(out,'http.jsonl'),JSON.stringify({kind:'request',id,at:Date.now(),path:new URL(request.url()).pathname,method:request.method(),bytes:request.postDataBuffer()?.length??0})+'\n');});
 context.on('response',(response:any)=>{const id=requests.get(response.request());if(!id)return;appendFileSync(join(out,'http.jsonl'),JSON.stringify({kind:'response',id,at:Date.now(),status:response.status()})+'\n');});
 context.on('requestfailed',(request:any)=>{const id=requests.get(request);if(id)appendFileSync(join(out,'http.jsonl'),JSON.stringify({kind:'requestfailed',id,at:Date.now(),error:request.failure()?.errorText})+'\n');});
 await seedProfile(context,saved.storage);page=await context.newPage();auth=await restoreAuthenticator(page,saved.credentials);
 page.on('pageerror',(e:any)=>appendFileSync(join(out,'page-errors.jsonl'),JSON.stringify({at:Date.now(),name:e.name,message:e.message,stack:e.stack})+'\n'));
 page.on('worker',(w:any)=>{appendFileSync(join(out,'workers.jsonl'),JSON.stringify({at:Date.now(),kind:'open',url:w.url()})+'\n');w.on('close',()=>appendFileSync(join(out,'workers.jsonl'),JSON.stringify({at:Date.now(),kind:'close',url:w.url()})+'\n'));});
 page.on('console',(m:any)=>{if(m.type()==='error'||m.type()==='warning')appendFileSync(join(out,'console-errors.jsonl'),JSON.stringify({at:Date.now(),kind:m.type(),text:m.text()})+'\n');});

    await page.goto('/test/hardening-stage5/index.html');await page.waitForFunction(()=>(globalThis as any).__nativeCheckpoint);
    const before=await page.evaluate(async({code,joined})=>{
      const g=globalThis as any;g.spec={...await g.__nativeCheckpoint.metadata(),code,joined};
      g.b=g.__nativeCheckpoint.create(g.spec,'composed');await g.b.opening;g.__attach498();
      const target=g.b.workspace.read().cards.find((c:any)=>c.text.startsWith('Fair H target:'));
      if(!target)throw Error('Expected current fixture target');g.targetId=target.id;
      return{text:g.b.workspace.text({kind:'card',id:target.id}).read().text,prefix:(await g.b.compositionStatus()).delivery.acceptedThrough};
    },{code:saved.code,joined:false});
    expect(before.text).toContain(account.expected);result.before=before.prefix;result.targetBeforeLength=before.text.length;save();
    // Genuine existing automatic local reduction; inside the original case's1800sclock.
    const normalize=(a:any[])=>[...a].sort((x,y)=>x.path.localeCompare(y.path));
    const archiveBefore=normalize(await page.evaluate(()=>(globalThis as any).b.workspace.exportEntries()));
    expect(archiveBefore).toEqual(normalize(Object.entries(account.archive).map(([path,content])=>({path,content}))));
    const serverBefore=acceptedRows(join(out,'state')).map(x=>x.key).sort();
    const hintBefore=await page.evaluate(()=>(globalThis as any).b.historyStatus());

    const enterOfflineForReduction=async(prefix:number)=>{
      await expect.poll(()=>page.evaluate(()=>(globalThis as any).b.session.session.sync.status.send.acceptedThrough),{timeout:30000,intervals:[25,50,100]}).toBe(prefix);
      await context.setOffline(true);
      await expect.poll(()=>page.evaluate(()=>{const s=(globalThis as any).b.session.session.sync.status;return s.send.phase+'/'+s.receive.phase;}),{timeout:5000,intervals:[50,100]}).toBe('offline/offline');
      (result.offlineTransitions??=[]).push({at:Date.now(),kind:'offline-for-local-reduction',prefix});save();
    };
    const reconnectForWriting=async()=>{await context.setOffline(false);(result.offlineTransitions??=[]).push({at:Date.now(),kind:'online-before-normal-reopen'});save();};
    await enterOfflineForReduction(before.prefix);
    const preparationBegan=Date.now();result.preparation={beforeHint:hintBefore,startedAt:preparationBegan,statuses:[]};save();
    await expect.poll(async()=>{
      const state=await page.evaluate(()=>{const b=(globalThis as any).b;return{local:b.session.session.devices.localHistory?.status,workspace:b.workspace.status};});
      if(!state.local)throw Error('Expected existing automatic local reduction');
      if(state.local.phase==='halted'||state.local.phase==='closed')throw Error('Local maintenance '+state.local.phase+':'+state.local.reason);
      if(state.local.reason==='capacity')throw Error('Fixture producer reduction parked at unchanged capacity');
      if(state.workspace.state!=='active')throw Error('Fixture producer admission '+state.workspace.state);
      result.preparation.statuses.push({at:Date.now(),...state.local});save();
      return state.local.progress?.stage==='complete'&&state.local.phase!=='running';
    },{timeout:120000,intervals:[250,500]}).toBe(true);
    const reducedHint=await page.evaluate(()=>(globalThis as any).b.historyStatus());
    const archiveAfter=normalize(await page.evaluate(()=>(globalThis as any).b.workspace.exportEntries()));
    const serverAfter=acceptedRows(join(out,'state')).map(x=>x.key).sort();
    result.preparation.completedAt=Date.now();result.preparation.elapsedMs=Date.now()-preparationBegan;result.preparation.reducedHint=reducedHint;save();
    await page.evaluate(()=>(globalThis as any).b.close());
    await reconnectForWriting();
    await page.reload();await page.waitForFunction(()=>(globalThis as any).__nativeCheckpoint);
    const reopened=await page.evaluate(async({code,joined})=>{
      const g=globalThis as any;g.spec={...await g.__nativeCheckpoint.metadata(),code,joined};g.b=g.__nativeCheckpoint.create(g.spec,'composed');await g.b.opening;g.__attach498();
      const card=g.b.workspace.read().cards.find((c:any)=>c.text.startsWith('Fair H target:'));if(!card)throw Error('Reduced target absent');g.targetId=card.id;
      return{archive:g.b.workspace.exportEntries(),hint:await g.b.historyStatus()};
    },{code:saved.code,joined:false});
    await expect.poll(()=>page.evaluate(()=>(globalThis as any).b.session.session.sync.status.send.acceptedThrough),{timeout:30000,intervals:[25,50,100]}).toBe(before.prefix);
    validatePreparation({archiveBefore,archiveAfter,archiveReopened:normalize(reopened.archive),serverBefore,serverAfter,beforeHint:hintBefore,reducedHint,reopenedHint:reopened.hint});
    result.preparation.reopenedHint=reopened.hint;result.preparation.archiveUnchanged=true;result.preparation.serverAcceptedSetUnchanged=true;result.preparation.completeThroughReopenMs=Date.now()-preparationBegan;save();

    const saveTrace=async(label:string)=>{writeFileSync(join(out,'window-'+label+'.json'),JSON.stringify(await page.evaluate(()=>(globalThis as any).__trace498)),{mode:0o600});};
    const openNative=async()=>{await page.reload();await page.waitForFunction(()=>(globalThis as any).__nativeCheckpoint);await page.evaluate(async({code,joined})=>{const g=globalThis as any;g.spec={...await g.__nativeCheckpoint.metadata(),code,joined};g.b=g.__nativeCheckpoint.create(g.spec,'composed');await g.b.opening;g.__attach498();const target=g.b.workspace.read().cards.find((x:any)=>x.text.startsWith('Fair H target:'));if(!target)throw Error('Expected session target');g.targetId=target.id;},{code:saved.code,joined:false});};
    const nextSession=async(completed:number)=>{
      const began=Date.now(),expectedPrefix=before.prefix+completed;
      const archiveBefore=normalize(await page.evaluate(()=>(globalThis as any).b.workspace.exportEntries()));
      const full=before.text+addition,day='days/'+account.date+'.md';
      expect(await page.evaluate(()=>(globalThis as any).b.workspace.text({kind:'card',id:(globalThis as any).targetId}).read().text)).toBe(full);
      const entries=Object.fromEntries(archiveBefore.map((x:any)=>[x.path,x.content]));expect({...entries,[day]:entries[day]!.replace(full,before.text)}).toEqual(account.archive);
      const serverBefore=acceptedRows(join(out,'state')).map(x=>x.key).sort(),beforeHint=await page.evaluate(()=>(globalThis as any).b.historyStatus());
      if(beforeHint.records<1024)throw Error('Fixture session lacks genuine maintenance work');
      const step:any={completed,began,beforeHint,statuses:[]};(result.sessions??=[]).push(step);save();
      await saveTrace('after-'+completed);await page.evaluate(()=>(globalThis as any).b.close());await openNative();await enterOfflineForReduction(expectedPrefix);
      await expect.poll(async()=>{const s=await page.evaluate(()=>{const b=(globalThis as any).b;return{workspace:b.workspace.status,local:b.session.session.devices.localHistory?.status};});if(s.workspace.state!=='active'||!s.local||s.local.phase==='halted'||s.local.phase==='closed'||s.local.reason==='capacity')throw Error('Fixture session maintenance refused '+JSON.stringify(s));step.statuses.push({at:Date.now(),...s.local});save();return s.local.progress?.stage==='complete'&&s.local.phase!=='running';},{timeout:120000,intervals:[250,500]}).toBe(true);
      const reducedHint=await page.evaluate(()=>(globalThis as any).b.historyStatus()),archiveAfter=normalize(await page.evaluate(()=>(globalThis as any).b.workspace.exportEntries()));
      await saveTrace('reduction-'+completed);await page.evaluate(()=>(globalThis as any).b.close());await reconnectForWriting();await openNative();
      await expect.poll(()=>page.evaluate(()=>(globalThis as any).b.session.session.sync.status.send.acceptedThrough),{timeout:30000,intervals:[25,50,100]}).toBe(expectedPrefix);
      const reopenedHint=await page.evaluate(()=>(globalThis as any).b.historyStatus()),archiveReopened=normalize(await page.evaluate(()=>(globalThis as any).b.workspace.exportEntries())),serverAfter=acceptedRows(join(out,'state')).map(x=>x.key).sort();
      validatePreparation({archiveBefore,archiveAfter,archiveReopened,serverBefore,serverAfter,beforeHint,reducedHint,reopenedHint});
      Object.assign(step,{finished:Date.now(),elapsedMs:Date.now()-began,reducedHint,reopenedHint,fullArchiveExact:true,acceptedServiceSetExact:true,expectedPrefix});save();
    };
    let addition='',lastInput=0;
    for(let i=0;i<1024;i++){
      const wait=125-(Date.now()-lastInput);if(wait>0)await page.waitForTimeout(wait);lastInput=Date.now();
      const value=String(i%10);addition+=value;
      await page.evaluate(async value=>{
        const g=globalThis as any,w=g.b.workspace;
        window.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:value}));
        const field=w.text({kind:'card',id:g.targetId}),text=field.read().text;
        await field.input({name:'insert',text:value},{ranges:[{anchor:text.length,head:text.length}],main:0}).accepted;
        await w.whenDurable();g.b.retrySend();
      },value);
      await expect.poll(()=>page.evaluate(async()=>(globalThis as any).b.session.session.sync.status.send.acceptedThrough),{timeout:30000,intervals:[25,50,100]}).toBe(before.prefix+i+1);
      result.accepted.push({position:before.prefix+i+1,at:Date.now()});
      if((i+1)%256===0&&i+1<1024)await nextSession(i+1);
      if((i+1)%64===0){console.log('Additional accepted positions',i+1);save();}
    }
    const full=before.text+addition;
    expect(await page.evaluate(()=>(globalThis as any).b.workspace.text({kind:'card',id:(globalThis as any).targetId}).read().text)).toBe(full);
    await saveTrace('all1024');
    await page.evaluate(()=>(globalThis as any).b.close());
    await page.goto('/');await openSaved(page,saved.code,false);await page.getByLabel('Go to date',{exact:true}).fill(account.date);
    await expect(card(page,'H')).toContainText(account.expected+addition);
    const archive=await exported(page),day='days/'+account.date+'.md';
    expect(archive[day]).toContain(full);
    const clean={...archive,[day]:archive[day]!.replace(full,before.text)};
    expect(clean).toEqual(account.archive);expect(archive['master.md']).toBe(account.archive['master.md']);
    expect(Buffer.byteLength(archive['master.md']!)).toBe(13407);
    await lock(page);account.actors[0]={...saved,storage:await context.storageState({indexedDB:true}),credentials:await credentials(auth)};
    await context.close();context=undefined;await stop();
    account.backlog=3072;account.expected+=addition;account.archive=archive;fixture.state=join(out,'state');
    const destination=join(out,'prepared-fixture');mkdirSync(destination,{mode:0o700});
    writeFileSync(join(destination,'fixture.json'),JSON.stringify(fixture),{mode:0o600});
    result.after=before.prefix+1024;result.archive=archiveIdentity(archive);
    result.guards={exactAdditional1024Accepted:true,fullTargetExact:true,allUnrelatedWritingExact:true,Goals13407:true,onlyOriginalPublisherRefreshed:true};
    result.fixturePath=join(destination,'fixture.json');result.outcome='passed';save();
   }catch(error){result.outcome='failed';result.error=String(error);
 if(page&&!page.isClosed())try{result.failureWindow=await page.evaluate(()=>{const g=globalThis as any,b=g.b;return{at:Date.now(),trace:g.__trace498,sync:b?.session?.session?.sync?.status,local:b?.session?.session?.devices?.localHistory?.status,workspace:b?.workspace?.status,entries:b?.workspace?.exportEntries()};});}catch(e){result.failureWindowError=String(e);}
 if(context)try{writeFileSync(join(out,'failed-storage.json'),JSON.stringify(await context.storageState({indexedDB:true})),{mode:0o600});if(auth)writeFileSync(join(out,'failed-credentials.json'),JSON.stringify(await credentials(auth)),{mode:0o600});result.failedProfileSaved=true;}catch(e){result.failedProfileError=String(e);}
 save();throw error;}
  finally{await context?.close().catch(()=>{});await stop();}
});
