import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

async function draft(page){
 await page.locator('#journal').fill('Bus stops need shade. PRIVATE-DRAFT-ONLY should never be transmitted.');
 await page.locator('#journal-form button[type=submit]').click();
 await expect(page.locator('#heading-2')).toBeVisible();
 await expect(page.locator('#category')).toHaveValue('Housing and livable cities');
 await page.locator('#issue').fill('Bus stops need shade.');
 await page.locator('#outcome').fill('Accessible and comfortable transit for all riders.');
 await page.locator('#approach').fill('Pilot shaded bus stops and measure the results.');
 await page.locator('#synthesis-form button[type=submit]').click();
 await expect(page.locator('#heading-3')).toBeVisible();
}
test('mobile journal stays private, public draft is editable and explicit consent saves a real proposal',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push({url:r.url(),body:r.postData(),method:r.method()})});
 await page.goto('/');
 await expect(page.locator('#heading-1')).toBeVisible();
 await expect(page.locator('iframe')).toHaveCount(0);
 await expect(page.locator('#screen-2')).toBeHidden();
 await expect(page.locator('#screen-3')).toBeHidden();
 await draft(page);
 expect(requests.filter(r=>!(r.method==='GET'&&!r.body&&/^\/api\/(catalog|laws\/[A-Z0-9-]+)$/i.test(new URL(r.url).pathname)&&!new URL(r.url).search))).toEqual([]);
 await expect(page.locator('#publish')).toBeDisabled();
 await page.locator('#consent').check();
 await expect(page.locator('#publish')).toBeEnabled();
 await page.locator('#title').fill('Shaded Transit Stops Initiative');
 await expect(page.locator('#publish')).toBeDisabled();
 await page.screenshot({path:info.outputPath('mobile-proposal.png'),fullPage:true});
 await page.locator('#consent').check();
 const post=page.waitForResponse(r=>r.url().endsWith('/api/laws')&&r.request().method()==='POST');
 await page.locator('#publish').click();
 const res=await post;expect(res.status()).toBe(201);
 const result=await res.json();expect(result.law.id).toMatch(/^HGP-/);
 await expect(page.locator('#receipt')).toBeVisible();
 await expect(page.locator('#receipt-link')).toHaveAttribute('href','/laws?goal='+result.law.id);
 expect(JSON.stringify(requests)).not.toContain('PRIVATE-DRAFT-ONLY');
 expect(JSON.parse(requests.find(r=>r.url.endsWith('/api/laws')).body).title).toBe('Shaded Transit Stops Initiative');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#receipt-link').click();
 await expect(page.locator('#drawerTitle')).toHaveText('Shaded Transit Stops Initiative');
});
test('static preview allows drafting and download but never offers submission',async({page})=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8').replace('name="helios-mode" content="live"','name="helios-mode" content="static"');
 await page.route('**/',route=>route.fulfill({contentType:'text/html',body:html}));
 const api=[];page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url())});
 await page.goto('/');
 await expect(page.locator('#static-notice')).toBeVisible();
 await draft(page);
 await expect(page.locator('#publish')).toBeHidden();
 await expect(page.locator('#consent-label')).toBeHidden();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);
 expect(download.suggestedFilename()).toBe('helios-proposal-draft.json');
 expect(api).toEqual([]);
});
