import {test,expect} from '@playwright/test';
test('The Long Coil: projected decade, search, ledger and phone layout',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/coil');
 await expect(page.locator('#panel')).toContainText(/\d+ milestones projected for 2027 to 2036/);
 await page.locator('#q').fill('steam');await expect(page.locator('#panel')).toContainText('Newcomen engine');
 await page.locator('#vLedger').click();await expect(page).toHaveURL(/\/coil#ledger$/);await expect(page.locator('#ledN')).toContainText('match “steam”');
 await page.locator('#q').fill('');await expect(page.locator('#ledN')).toContainText('records from 3.3 million BCE to 2026');
 await page.locator('#vCoil').click();await expect(page.locator('#cv')).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
test('archived dashboard tab embeds The Long Coil',async({page})=>{
 await page.goto('/experiments.html');await page.getByRole('tab',{name:'The Long Coil'}).click();
 await expect(page.locator('#view-coil')).toBeVisible();await expect(page.locator('#view-coil')).toHaveAttribute('src','/embed/coil');
 await expect(page.frameLocator('#view-coil').locator('#panel')).toContainText('milestones projected for 2027 to 2036');
});
