import {test,expect} from '@playwright/test';
test('homepage shows all 100 visual law tiles and a different interactive scenario for each selection',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#law-tiles .law-tile')).toHaveCount(100);
 await expect(page.locator('#law-tiles .law-spark')).toHaveCount(100);
 await expect(page.locator('#law-title')).toHaveText('Easy Access to Public Help');
 const before=await page.locator('#law-outcome').textContent();
 await page.locator('#law-input-reach').fill('0');
 await expect(page.locator('#law-outcome')).toHaveText('100');
 expect(before).not.toBe('100');
 await page.locator('#law-search').fill('HGA-011');
 await expect(page.locator('#law-tiles .law-tile')).toHaveCount(1);
 await page.locator('[data-law="HGA-011"]').click();
 await expect(page.locator('#law-title')).toHaveText('Homes People Can Afford');
 await expect(page.locator('#law-model-direction')).toContainText('Homes permitted');
 await expect(page.locator('#law-lever-label')).toContainText('Permitting capacity');
 await expect(page.locator('#law-input-reach')).toHaveValue('60');
 await expect(page.locator('[data-law-vote="support"]')).toBeDisabled();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('connected original law voting and public proposed updates are visible from another browser',async({page,browser})=>{
 await page.goto('/');
 await page.locator('#law-connect').click();
 await expect(page.locator('#law-board-status')).toContainText('Shared counts loaded');
 await page.locator('[data-law-vote="support"]').click();
 await expect(page.locator('#law-detail-status')).toContainText('Advisory position saved');
 await expect(page.locator('#law-votes .law-count').first()).toContainText('1');
 const other=await browser.newPage();
 try{await other.goto(page.url());await other.locator('#law-connect').click();await expect(other.locator('#law-votes .law-count').first()).toContainText('1');}
 finally{await other.close()}
 await page.getByText('Suggest a public update',{exact:true}).click();
 await page.locator('#law-update-reason').fill('Test proposed update with unchanged original wording.');
 await page.locator('#law-update-consent').check();
 await page.locator('#law-update-submit').click();
 await expect(page.locator('#law-detail-status')).toContainText('Public update proposed');
 await page.locator('#law-history-section summary').click();
 await expect(page.locator('#law-history')).toContainText('Test proposed update with unchanged original wording.');
});
