import { test, expect } from '@playwright/test';
import { cpSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { restoreAuthenticator, openSaved } from '../../../../test/packaged-account/devices';
import { startBackend, startApp, stopAll } from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
const root=process.env.DONE_PERF_RESULTS!;
test('one complete unchanged membership operation',async({browser})=>{
 const mode=process.env.TYPING_ARM!;
 const f=JSON.parse(readFileSync('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json','utf8'));
 const out=join(root,mode), state=join(out,'state');mkdirSync(out,{recursive:true});cpSync(f.state,state,{recursive:true,errorOnExist:true});
 let context;
 try{
  await startBackend(state);await startApp(state);
  context=await browser.newContext({storageState:f.b.storage});

  const page=await context.newPage();await restoreAuthenticator(page,f.b.credentials);await page.goto('/');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await openSaved(page,f.b.code,true);
  const result=await page.evaluate(()=>(globalThis as any).__membershipOperation());
  expect(result.kind).toBe('unchanged');
  expect(result.authorityChecks).toBeGreaterThanOrEqual(3);
  expect(result.transfers).toBe(mode==='candidate'?1:0);
  writeFileSync(join(out,'result.json'),JSON.stringify({mode,...result,passed:true},null,2)+'\n');
 }finally{await context?.close();await stopAll(state);}
});
