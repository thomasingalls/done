import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
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
  let context:any;
  try{
    expect(account.backlog).toBe(2048);expect(new Date().toISOString().slice(0,10)).toBe(account.date);
    cpSync(fixture.state,join(out,'state'),{recursive:true,errorOnExist:true});
    await start(join(out,'state'),process.env.FAIR_DIST!);
    context=await browser.newContext({baseURL:'http://localhost:53781',viewport:{width:1440,height:1000},timezoneId:'UTC'});
    await seedProfile(context,saved.storage);const page=await context.newPage(),auth=await restoreAuthenticator(page,saved.credentials);
    await page.goto('/test/hardening-stage5/index.html');await page.waitForFunction(()=>(globalThis as any).__nativeCheckpoint);
    const before=await page.evaluate(async({code,joined})=>{
      const g=globalThis as any;g.spec={...await g.__nativeCheckpoint.metadata(),code,joined};
      g.b=g.__nativeCheckpoint.create(g.spec,'composed');await g.b.opening;
      const target=g.b.workspace.read().cards.find((c:any)=>c.text.startsWith('Fair H target:'));
      if(!target)throw Error('Expected current fixture target');g.targetId=target.id;
      return{text:g.b.workspace.text({kind:'card',id:target.id}).read().text,prefix:(await g.b.compositionStatus()).delivery.acceptedThrough};
    },{code:saved.code,joined:false});
    expect(before.text).toContain(account.expected);result.before=before.prefix;result.targetBeforeLength=before.text.length;save();
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
      if((i+1)%64===0){console.log('Additional accepted positions',i+1);save();}
    }
    const full=before.text+addition;
    expect(await page.evaluate(()=>(globalThis as any).b.workspace.text({kind:'card',id:(globalThis as any).targetId}).read().text)).toBe(full);
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
  }catch(error){result.outcome='failed';result.error=String(error);save();throw error;}
  finally{await context?.close().catch(()=>{});await stop();}
});
