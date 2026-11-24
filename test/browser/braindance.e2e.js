import {test,expect} from '@playwright/test';
// The 3D view loads three.js from jsDelivr. Block it (and web fonts) so these checks
// cover the timeline, calendar and logs on their own, offline and without WebGL.
const offline=page=>page.route(/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
const rowTitle=row=>row.locator('.tt').evaluate(n=>n.firstChild.textContent);
test('Braindance: playhead, events, logs, calendar and links work without the 3D library',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await offline(page);await page.goto('/braindance');
 const rows=page.locator('#log li.ev');const total=await rows.count();expect(total).toBeGreaterThan(50);
 await expect(page.locator('#rdMode')).toHaveText('The surface');
 const first=await page.locator('#cTitle').textContent();expect(await rowTitle(page.locator('#log li.ev.on'))).toBe(first);
 await page.locator('#nextBtn').click();await expect(page.locator('#cTitle')).not.toHaveText(first);
 expect(await rowTitle(page.locator('#log li.ev.on'))).toBe(await page.locator('#cTitle').textContent());
 await page.locator('#q').fill('eclipse');const hits=await rows.count();expect(hits).toBeGreaterThan(0);expect(hits).toBeLessThan(total);
 await page.locator('#q').fill('');await page.locator('#stFil button[data-s="ahead"]').click();
 expect(await rows.count()).toBe(await page.locator('#log li.ev.fut').count());
 await page.locator('#stFil button[data-s="all"]').click();await expect(rows).toHaveCount(total);
 await page.locator('#scrub').focus();await page.keyboard.press('End');
 await expect(page.locator('#rdMode')).toHaveText('Mirror world');await expect(page.locator('#rdDate')).toContainText('2033');
 await page.keyboard.press('Home');await expect(page.locator('#rdMode')).toHaveText('Recorded world');
 const before=await page.locator('#rdDate').textContent();const cal=page.locator('#calCv'),box=await cal.boundingBox();
 await cal.click({position:{x:box.width*.55,y:box.height*.5}});await expect(page.locator('#rdDate')).not.toHaveText(before);
 const row=rows.nth(12),id=await row.getAttribute('data-id'),title=await rowTitle(row);
 await page.goto('/braindance#'+id);await expect(page.locator('#cTitle')).toHaveText(title);
 // Phone width: no sideways scrolling once the layout settles after a resize, and on a fresh load.
 const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 await page.setViewportSize({width:390,height:844});await expect.poll(fits).toBe(true);
 await page.reload();await expect(page.locator('#log li.ev.on')).toBeVisible();await expect.poll(fits).toBe(true);
 expect(errors).toEqual([]);
});
test('archived dashboard tab embeds Braindance',async({page})=>{
 await offline(page);await page.goto('/experiments.html');await page.getByRole('tab',{name:'Braindance'}).click();
 await expect(page.locator('#view-braindance')).toBeVisible();await expect(page.locator('#view-braindance')).toHaveAttribute('src','/embed/braindance');
 await expect(page.frameLocator('#view-braindance').locator('#log li.ev.on')).toBeVisible();
});
