import {test,expect} from '@playwright/test';
const shown=(page,name)=>page.locator('.name',{hasText:name});
test('Support Every Country: flag images, search, shareable link, region and message',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const image=page.waitForResponse(r=>r.url().endsWith('/public/flags/af.webp'));
 await page.goto('/flags');const res=await image;expect(res.status()).toBe(200);expect(res.headers()['content-type']).toBe('image/webp');
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveAttribute('aria-label','Play');
 await expect(page.locator('#count')).toContainText('/ 195');await expect(page.locator('#kick')).toHaveText('Support');
 await page.locator('#gridBtn').click();await expect(page.locator('.tile')).toHaveCount(195);
 await page.locator('#q').fill('ivory');await expect(page.locator('.tile:not([hidden])')).toHaveCount(1);await page.locator('#q').press('Enter');
 await expect(shown(page,'Côte d’Ivoire')).toHaveCSS('opacity','1');await expect(page).toHaveURL(/#cote-d-ivoire$/);
 await page.locator('#customBtn').click();await page.locator('#region .chip[data-v="Africa"]').click();await expect(page.locator('#count')).toContainText('/ 54');
 await page.locator('#msg').fill('Stand with');await expect(page.locator('#kick')).toHaveText('Stand with');
 await page.goto('/flags#japan');await expect(shown(page,'Japan')).toHaveCSS('opacity','1');await expect(page.locator('#count')).toContainText('/ 195');await expect(page.locator('#kick')).toHaveText('Stand with');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
test('archived dashboard tab embeds Support Every Country',async({page})=>{
 await page.goto('/experiments.html');await page.getByRole('tab',{name:'Support Every Country'}).click();
 await expect(page.locator('#view-flags')).toBeVisible();await expect(page.locator('#view-flags')).toHaveAttribute('src','/embed/flags');
 await expect(page.frameLocator('#view-flags').locator('#count')).toContainText('/ 195');
});
