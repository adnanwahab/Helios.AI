import {test,expect} from '@playwright/test';
test('archived law atlas shows all 100 visual law tiles and a different interactive scenario for each selection',async({page})=>{
 await page.goto('/law-atlas.html');
 await expect(page.locator('#law-tiles .law-tile')).toHaveCount(100);
 await expect(page.locator('#law-tiles .law-spark')).toHaveCount(100);
 await expect(page.locator('#law-title')).toHaveText('Childcare Families Can Rely On');
 await expect(page.locator('#law-tiles .law-tile').first()).toHaveAttribute('data-law','HGA-031');
 await page.locator('[data-law="HGA-001"]').click();
 await expect(page.locator('#law-title')).toHaveText('Easy Access to Public Help');
 await expect(page.locator('#childcare-budget')).toBeHidden();
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
 await page.goto('/law-atlas.html');
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

test('childcare is featured first, budget controls update live and prepare only an explicit draft',async({page})=>{
 await page.goto('/');
 await page.locator('#first-law a').click();
 await expect(page).toHaveURL(/law-atlas\.html#childcare-budget$/);
 await expect(page.locator('#childcare-heading')).toHaveText('The Affordable Childcare and Family Freedom Act');
 await expect(page.locator('#law-tiles .law-tile').first()).toHaveAttribute('data-law','HGA-031');
 await expect(page.locator('#childcare-parent-hour')).toHaveText('$5.00');
 await expect(page.locator('#childcare-public')).toHaveText('$288,000,000');
 await page.locator('#childcare-subsidy').fill('50');
 await expect(page.locator('#childcare-parent-hour')).toHaveText('$10.00');
 await expect(page.locator('#childcare-public')).toHaveText('$192,000,000');
 await page.locator('#childcare-utilization').fill('50');
 await expect(page.locator('#childcare-public')).toHaveText('$96,000,000');
 await page.locator('#childcare-draft-button').click();
 await expect(page.locator('#law-update-implementation')).toHaveValue(/50% subsidy/);
 await expect(page.locator('#law-update-reason')).toHaveValue(/\$96,000,000/);
 await expect(page.locator('#law-update-consent')).not.toBeChecked();
 await expect(page.locator('#law-update-submit')).toBeDisabled();
 await page.locator('#childcare-reset').click();
 await expect(page.locator('#childcare-public')).toHaveText('$288,000,000');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
