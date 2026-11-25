import {test,expect} from '@playwright/test';
test('archived law atlas exposes the assembly demo and matching proposal chapter links',async({page,context})=>{
 await page.goto('/law-atlas.html');
 const feature=page.locator('[aria-labelledby="law-assembly-title"]');
 await expect(feature.getByRole('heading')).toHaveText('Built from the ground up.');
 await expect(feature.locator('.law-assembly-links a')).toHaveCount(3);
 const selected=page.locator('#law-assembly-selected');
 await expect(page.locator('#law-tiles .law-tile')).toHaveCount(101);
 await expect(page.locator('#law-tiles .law-tile[data-law^="HGA-"]')).toHaveCount(100);
 await expect(page.locator('#law-tiles .law-tile[data-law="DRAFT-CANNABIS"]')).toHaveCount(1);
 await expect(selected).toBeHidden();
 for(const [id,chapter] of [['HGA-012','homes'],['HGA-051','places'],['HGA-091','water']]){
   await page.locator('#law-search').fill(id);
   await page.locator('[data-law="'+id+'"]').click();
   await expect(selected).toBeVisible();
   await expect(selected).toHaveAttribute('href','./public/helios-law-assembly.html#'+chapter);
 }
 const popupPromise=context.waitForEvent('page');await selected.click();const popup=await popupPromise;
 try{await popup.waitForLoadState('domcontentloaded');await expect(popup.locator('#water canvas')).toBeVisible();await expect(popup).toHaveURL(/helios-law-assembly[.]html#water$/);}finally{await popup.close()}
 await page.locator('#law-search').fill('HGA-001');await page.locator('[data-law="HGA-001"]').click();await expect(selected).toBeHidden();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('all three scenes assemble and reverse, with mobile controls and no writes',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const requests=[];page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url())});
 await page.goto('/public/helios-law-assembly.html');
 await expect(page.locator('.chapter')).toHaveCount(3);
 for(const id of ['homes','places','water']){
   const scene=page.locator('#'+id);
   await scene.locator('.finish').click();await expect(scene.locator('.pct')).toHaveText('100% ASSEMBLED');
   await expect(scene.locator('canvas')).toBeVisible();
   await scene.locator('.replay').click();await expect(scene.locator('.pct')).toHaveText('00% ASSEMBLED');
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#water .finish').click();await expect(page.locator('#water .pct')).toHaveText('100% ASSEMBLED');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(requests).toEqual([]);
});
