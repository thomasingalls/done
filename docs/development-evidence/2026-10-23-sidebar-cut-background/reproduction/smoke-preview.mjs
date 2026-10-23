import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const scratch='/private/tmp/done-ux-20261023-patches';
const m=JSON.parse(readFileSync(scratch+'/preview.json'));
const browser=await chromium.launch({executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const observations=[];
try {
 for(const width of [1280,420]){
  const context=await browser.newContext({viewport:{width,height:900}});
  try {
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(m.origin);await expect(page.locator('.shell')).toBeVisible();
   if(await page.locator('.menu-trigger').isVisible()) await page.locator('.menu-trigger').click();
   await page.locator('#menu [data-menu-section=Account] summary').click();
   await expect(page.getByRole('textbox',{name:'User name',exact:true})).toBeVisible();
   await expect(page.locator('#menu').getByText('User',{exact:true})).toBeVisible();
   if(await page.locator('.menu-trigger').isVisible()) await page.locator('.scrim').click({position:{x:width-20,y:100}});
   const day=page.locator('.day-panel[data-active="true"]');const field=day.getByRole('textbox',{name:'What’s scheduled?'});const cards=day.locator('.card[data-section="scheduled"]');
   for(const text of ['head','tail']){await field.fill(text);await field.press('Enter');await expect(field).toHaveValue('');}
   await cards.nth(1).locator('.card-surface').click();await cards.nth(1).locator('.cm-content').press('Home');await cards.nth(1).locator('.cm-content').press('Backspace');
   await expect(cards).toHaveCount(1);await expect(cards.first().locator('.cm-content')).toBeFocused();
   await field.click();await field.pressSequentially('draft stays here');await expect(field).toHaveValue('draft stays here');await expect(cards.first()).toHaveAttribute('data-editing','false');await expect(field).toBeFocused();
   await field.fill('');const cdp=await context.newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'composing',selectionStart:9,selectionEnd:9});await expect(field).toHaveValue('composing');
   const prevented=await field.evaluate(el=>{const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;});expect(prevented).toBe(false);await expect(cards).toHaveCount(1);
   await cdp.send('Input.insertText',{text:'confirmed'});await expect(field).toHaveValue('confirmed');await field.press('Enter');await expect(cards).toHaveCount(2);
   await cards.first().getByRole('button',{name:'Duplicate to Scheduled: headtail',exact:true}).click();await expect(cards).toHaveCount(3);await expect(cards.last()).toContainText('headtail');
   expect(errors).toEqual([]);observations.push({width,mergeOutsideFocus:true,quickEntryDraftRetained:true,chromiumCompositionConfirmation:true,duplicateToScheduled:true,pageErrors:errors});await cdp.detach();
  } finally {await context.close();}
 }
 const receipt={status:'passed',origin:m.origin,version:m.version,workerVersion:m.workerVersion,profiles:'fresh disposable Chromium contexts; no existing browser data or real account used',observations};
 writeFileSync(m.directory+'/browser-smoke.json',JSON.stringify(receipt,null,2)+'\n');writeFileSync(scratch+'/checks-52/preview-browser-smoke.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
} finally {await browser.close();}
