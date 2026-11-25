import {test,expect} from '@playwright/test';
test('homepage modal submits consented inbox message and restores tracking',async({page})=>{
 await page.goto('/?compose=pr');
 await expect(page.locator('#pr-compose')).toBeVisible();
 await page.locator('#pr-title').fill('Better simulator');
 await page.locator('#pr-message').fill('Add an editable cost.');
 await page.locator('#pr-compose-form button[type=submit]').click();
 await expect(page.locator('#pr-send')).toBeDisabled();
 await page.locator('#pr-consent').check();
 await page.locator('#pr-send').click();
 await expect(page.locator('#pr-receipt')).toBeVisible();
 await expect(page.locator('#pr-history')).toContainText('Better simulator');
 await page.reload();
 await expect(page.locator('#pr-compose')).toBeVisible();
 await page.locator('#pr-tracking summary').click();
 await expect(page.locator('#pr-history')).toContainText('Awaiting triage');
 await page.setViewportSize({width:390,height:844});
 expect(await page.locator('#pr-compose').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.keyboard.press('Escape');await expect(page.locator('#pr-compose')).not.toBeVisible();
});
test('GitHub handoff needs consent, sends no message or credentials in URL and does not call inbox',async({page})=>{
 let writes=0;page.on('request',r=>{if(r.url().includes('/api/contributions')&&r.method()==='POST')writes++});
 await page.goto('/');await page.locator('#pr-compose-open').click();
 await page.locator('#pr-title').fill('New feature');await page.locator('#pr-message').fill('Example review text');
 await page.locator('#pr-compose-form button[type=submit]').click();
 await page.locator('#pr-destination').selectOption('github');
 await expect(page.locator('#pr-copy')).toBeDisabled();
 await expect(page.locator('#pr-github')).not.toHaveAttribute('href',/.+/);
 await page.locator('#pr-consent').check();
 await expect(page.locator('#pr-github')).toHaveAttribute('href',/github.com\/adnanwahab\/HeliosHTML\/new\/main\/data\/contributions\?filename=[a-f0-9-]+\.json$/);
 await expect(page.locator('#pr-payload')).toHaveValue(/Example review text/);
 expect(writes).toBe(0);
});

test('Netlify preview uses GitHub without touching the private session or inbox',async({page})=>{
 const privateRequests=[];
 page.on('request',r=>{if(/\/api\/(?:session|contributions)(?:$|[/?])/.test(r.url()))privateRequests.push(r.url())});
 await page.route('**/?compose=pr',async route=>{
  const response=await route.fetch();
  const html=await response.text();
  await route.fulfill({response,body:html.replace('<meta name="helios-contribution-mode" content="live">','<meta name="helios-contribution-mode" content="preview">')});
 });
 await page.goto('/?compose=pr');
 // Other homepage features may use /api/session; track composer requests from here.
 privateRequests.length=0;
 await expect(page.locator('#pr-inbox-notice')).toContainText('deployment preview');
 await page.locator('#pr-title').fill('Preview contribution');
 await page.locator('#pr-message').fill('Test GitHub handoff without production writes.');
 await page.locator('#pr-compose-form button[type=submit]').click();
 await expect(page.locator('#pr-destination')).toHaveValue('github');
 await expect(page.locator('#pr-destination option[value=team]')).toBeDisabled();
 await expect(page.locator('#pr-send')).toBeHidden();
 await expect(page.locator('#pr-github')).not.toHaveAttribute('href',/.+/);
 await page.locator('#pr-consent').check();
 await expect(page.locator('#pr-github')).toHaveAttribute('href',/github.com\/adnanwahab\/HeliosHTML\/new\/main\/data\/contributions\?filename=[a-f0-9-]+\.json$/);
 await page.locator('#pr-tracking summary').click();
 await expect(page.locator('#pr-history-status')).toContainText('Private inbox progress is not available');
 await expect(page.locator('#pr-refresh')).toBeHidden();
 await expect(page.locator('#pr-status')).not.toContainText('Not confirmed');
 expect(privateRequests.filter(url=>url.includes('/api/contributions'))).toEqual([]);
});
