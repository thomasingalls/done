import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { installRecorder, typeAtCadence } from './input';
test('input recorder retains keys delivered during a known main-thread stall', async ({page}) => {
  await page.setContent('<div contenteditable="true"></div>');
  await page.locator('div').focus();
  const before=Date.now();
  const clock = await installRecorder(page,'div');
  const after=Date.now();
  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(() => {
    setTimeout(() => {
      const at=performance.now();
      while(performance.now()-at<200) { /* Deliberate recorder fault control. */ }
      (window as any).__knownStall={at,end:performance.now()};
    },80);
  });
  const injected=await typeAtCadence(cdp,12,50);
  await page.waitForFunction(() => (window as any).__typing().samples.length===12 && (window as any).__typing().samples.every((s:any)=>s.frame!==null));
  const result=await page.evaluate(()=>({...((window as any).__typing()),stall:(window as any).__knownStall}));
  const dir=process.env.DONE_PERF_RESULTS!;
  mkdirSync(dir,{recursive:true});
  writeFileSync(dir+'/calibration.json',JSON.stringify({before,after,clock,injected,...result},null,2));
  expect(await page.locator('div').textContent()).toBe('x'.repeat(12));
  expect(result.samples).toHaveLength(12);
  const inside=result.samples.filter((s:any)=>s.eventAt>=result.stall.at && s.eventAt<result.stall.end);
  expect(inside.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...inside.map((s:any)=>s.dispatchMs))).toBeGreaterThan(80);
  expect(result.tasks.some((t:any)=>t.ms>=190)).toBe(true);
  expect(Math.min(...result.samples.map((s:any)=>s.dispatchMs))).toBeGreaterThan(-5);
});
