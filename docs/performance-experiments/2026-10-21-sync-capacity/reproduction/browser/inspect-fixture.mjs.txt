import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const root='/private/tmp/done-live-sync-attribution-20261021',seed=JSON.parse(readFileSync(root+'/caughtup-seed-v2/fixture.json','utf8'));
const browser=await chromium.launch();
try{
 const context=await browser.newContext({storageState:seed.a.storage,baseURL:'http://localhost:53781',viewport:{width:1440,height:1000}}),page=await context.newPage();
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 for(const credential of seed.a.credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential});
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);
 await page.getByLabel('Unlock code',{exact:true}).fill(seed.a.code);await page.getByRole('button',{name:'Confirm code and unlock with passkey'}).click();await expect(page.locator('.shell')).toBeVisible({timeout:20000});
 const next=page.waitForEvent('download');await page.getByRole('button',{name:'Export markdown',exact:true}).click();const bytes=readFileSync(await (await next).path()),files=[];
 for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){
  const size=bytes.readUInt32LE(offset+18),n=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.toString('utf8',offset+30,offset+30+n),begin=offset+30+n+extra;
  const text=bytes.toString('utf8',begin,begin+size);files.push({name,bytes:size,characters:text.length,hasPlannedGoalsText:text.includes('Follow up with the team and review the project notes.')});offset=begin+size;
 }
 const result={files,goalDomCharacters:(await page.locator('.goals .cm-content').innerText()).length,browser:browser.version()};writeFileSync(root+'/fixture-inspection.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
