import { chromium, expect } from '/Users/thomasingalls/.codex/worktrees/7fda/done/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const scratch='/private/tmp/done-ux-20261023-patches';
const m=JSON.parse(readFileSync(scratch+'/preview.json'));
const browser=await chromium.launch({executablePath:'/Users/thomasingalls/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
const observations=[];
try {
 for(const [width,size]of [[280,16],[420,24],[320,32],[1280,16]]){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:width===1280?'light':'dark',reducedMotion:'reduce'});
  try {
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(m.origin);await expect(page.locator('.shell')).toBeVisible();
   const trigger=page.getByRole('button',{name:'Open menu',exact:true});if(await trigger.isVisible())await trigger.click();
   await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
   const menu=page.locator('#menu');await expect(menu.locator('details[open]')).toHaveCount(0);
   await expect.poll(async()=>(await menu.boundingBox()).x).toBeGreaterThanOrEqual(-1);const panel=await menu.boundingBox();expect(panel.x).toBeGreaterThanOrEqual(-1);expect(panel.x+panel.width).toBeLessThanOrEqual(width+1);
   const buttons=await menu.locator('.menu-date-nav button').evaluateAll(nodes=>nodes.map(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(node);const text=r.getBoundingClientRect();return {label:node.textContent,clearLeft:text.left-box.left,clearRight:box.right-text.right,required:parseFloat(style.paddingLeft)+1};}));
   for(const b of buttons){expect(b.clearLeft).toBeGreaterThanOrEqual(b.required-1);expect(b.clearRight).toBeGreaterThanOrEqual(b.required-1);}
   await page.screenshot({path:m.directory+'/collapsed-'+width+'-'+size+'.png'});
   for(const section of ['Account','Sync','Data','Install'])await menu.locator('details[data-menu-section='+section+'] > summary').click();
   expect(await menu.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   const account=menu.locator('[data-menu-section=Account]');await expect(account.getByText('User',{exact:true})).toBeVisible();
   const remove=account.getByRole('button',{name:'Remove from this device',exact:true});await remove.scrollIntoViewIfNeeded();const rb=await remove.boundingBox();expect(rb.y).toBeGreaterThanOrEqual(-1);expect(rb.y+rb.height).toBeLessThanOrEqual(901);
   await page.screenshot({path:m.directory+'/expanded-'+width+'-'+size+'.png'});expect(errors).toEqual([]);
   observations.push({width,baseTextPx:size,buttons,panelFitsViewport:true,noHorizontalOverflow:true,removalActionReachable:true,pageErrors:errors});
  }finally{await context.close();}
 }
 const receipt={status:'passed',origin:m.origin,workerVersion:m.workerVersion,profiles:'fresh disposable Chromium contexts; no existing browser profile or account',observations};writeFileSync(m.directory+'/browser-smoke.json',JSON.stringify(receipt,null,2)+'\n');writeFileSync(scratch+'/checks-53/preview-browser-smoke.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser.close();}
