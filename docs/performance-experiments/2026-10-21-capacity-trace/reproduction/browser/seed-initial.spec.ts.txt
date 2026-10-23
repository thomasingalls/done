import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {pairedEditors,add,credentials} from './devices';
import {start,stop} from './runtime.mjs';
const root=process.env.SYNC_ROOT!,out=process.env.SYNC_OUT!;
const goalsText='# Plans\n\n- Follow up with the team and review the project notes.\n'.repeat(200);
async function exported(p:Page){
 const next=p.waitForEvent('download');await p.getByRole('button',{name:'Export markdown',exact:true}).click();const bytes=readFileSync((await (await next).path())!),files:Record<string,string>={};
 for(let at=0;bytes.readUInt32LE(at)===0x04034b50;){expect(bytes.readUInt16LE(at+8)).toBe(0);const size=bytes.readUInt32LE(at+18),n=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),begin=at+30+n+extra;files[bytes.toString('utf8',at+30,at+30+n)]=bytes.toString('utf8',begin,begin+size);at=begin+size;}return files;
}
async function replaceGoals(p:Page,text:string){await p.locator('.goals .cm-content').click();await p.keyboard.press('ControlOrMeta+a');await p.keyboard.insertText(text);await expect.poll(async()=>(await exported(p))['master.md'],{timeout:30000}).toBe(text);}
test('construct a fresh fully checked synthetic two-device seed',async({page,browser})=>{
 mkdirSync(out,{recursive:true,mode:0o700});let pair:Awaited<ReturnType<typeof pairedEditors>>|undefined;
 try{
  await start(join(out,'state'),process.env.SYNC_DIST!,0);
  pair=await pairedEditors(page,browser,true,{beforeInvite:async()=>{
   for(let i=0;i<118;i++)await add(page,`Project ${i}: `+'Review notes, decisions and next actions. '.repeat(10));
   await add(page,'Sync target A:');await add(page,'Sync target B:');await replaceGoals(page,goalsText);await page.keyboard.press('Escape');
  }});
  const pages=[page,pair.second];
  for(let i=0;i<2;i++){
   const marker=`Fresh boundary ${i};`;const p=pages[i]!;await p.locator('.goals .cm-content').click();await p.keyboard.press('ControlOrMeta+End');await p.keyboard.insertText('\n'+marker+'\n');
   await expect.poll(async()=>(await exported(pages[1-i]!))['master.md'],{timeout:30000}).toContain(marker);
  }
  await replaceGoals(page,goalsText);await expect.poll(async()=>(await exported(pair!.second))['master.md'],{timeout:30000}).toBe(goalsText);
  const whole=await exported(page);expect(await exported(pair.second)).toEqual(whole);expect(await page.locator('.day-panel[data-active="true"] .card').count()).toBe(121);
  const positions=await Promise.all(pages.map(async p=>Number((await p.getByText(/^Accepted position:/).innerText()).split(':').at(-1)!.trim())));expect(positions.every(n=>n>0)).toBe(true);
  const date=await page.getByLabel('Go to date',{exact:true}).inputValue();for(const p of pages){await p.getByRole('button',{name:'Lock workspace',exact:true}).click();await expect(p.locator('.shell')).toHaveCount(0);}
  const a={code:pair.first.code,position:positions[0],storage:await page.context().storageState({indexedDB:true}),credentials:await credentials(pair.first.auth)},b={code:pair.next.code,position:positions[1],storage:await pair.other.storageState({indexedDB:true}),credentials:await credentials(pair.next.auth)};
  await stop();const dest=join(root,'caughtup-seed-v3');mkdirSync(dest,{recursive:true,mode:0o700});cpSync(join(out,'state'),join(dest,'state'),{recursive:true,errorOnExist:true});writeFileSync(join(dest,'fixture.json'),JSON.stringify({a,b,expected:'Sync target A:',date,state:join(dest,'state')}),{mode:0o600});
  writeFileSync(join(out,'seed-check.json'),JSON.stringify({outcome:'passed',cards:121,goalsBytes:Buffer.byteLength(whole['master.md']!),positions,dayBytes:Buffer.byteLength(whole['days/'+date+'.md']!)}));
 }finally{await pair?.other.close();await stop();}
});
