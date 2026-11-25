import {test,expect} from '@playwright/test';
test('message composer stays local until review, and direct PR receipt requires consent',async({page})=>{
 let writes=0,posted;
 await page.route('**/api/message-pr',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{enabled:true}});
  writes++;posted=route.request().postDataJSON();return route.fulfill({json:{number:42,url:'https://github.com/adnanwahab/HeliosHTML/pull/42',draft:true,state:'open'}});
 });
 await page.goto('/?compose=pr');
 await expect(page.locator('#pr-compose')).toBeVisible();
 await page.locator('#pr-title').fill('Better simulator');
 await page.locator('#pr-message').fill('Add an editable cost.');
 await page.locator('#pr-compose-form button[type=submit]').click();
 await expect(page.locator('#pr-payload')).toHaveValue(/Add an editable cost/);
 await expect(page.locator('#pr-github')).not.toHaveAttribute('href',/.+/);
 await expect(page.locator('#pr-submit')).toBeDisabled();expect(writes).toBe(0);
 await page.locator('#pr-consent').check();
 await expect(page.locator('#pr-github')).toHaveAttribute('href',/github.com\/adnanwahab\/HeliosHTML\/new\/main\/docs\/proposals\/inbox\?filename=/);
 await page.locator('#pr-maintainer summary').click();
 await page.locator('#pr-access').fill('test-only');
 await page.locator('#pr-submit').click();
 await expect(page.locator('#pr-result-link')).toHaveAttribute('href','https://github.com/adnanwahab/HeliosHTML/pull/42');
 expect(writes).toBe(1);expect(posted.consent).toBe(true);expect(posted.proposal.message).toBe('Add an editable cost.');
 await expect(page.locator('#pr-access')).toHaveValue('');
 await page.locator('#pr-new').click();
 await expect(page.locator('#pr-message')).toHaveValue('');
 await page.setViewportSize({width:390,height:844});
 expect(await page.locator('#pr-compose').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.keyboard.press('Escape');await expect(page.locator('#pr-compose')).not.toBeVisible();
});
