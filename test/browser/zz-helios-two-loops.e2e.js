import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const exampleTitle='Shaded Transit Stops Initiative';
const fixture={id:'HGP-LOCAL-REVIEW-EXAMPLE',title:exampleTitle,category:'Housing and livable cities',sharedGoal:'Add shade to bus stops and improve rider comfort.',illustrativeLocalOption:'Test shaded transit stops.',risksAndSafeguards:'Consider accessibility, equitable distribution and maintenance.',suggestedMeasures:['Shade coverage','Rider comfort']};
async function completeReview(page){
 await expect(page.locator('#gov-heading-2')).toBeVisible();
 await page.locator('#gov-authority').fill('Municipal transport authority');
 await page.locator('#gov-evidence').fill('Compare shelter costs and summer heat exposure.');
 await page.locator('#gov-dissent').fill('Consult riders and disability advocates.');
 await page.locator('#gov-evaluate button[type=submit]').click();
 await expect(page.locator('#gov-heading-3')).toBeVisible();
 await page.locator('#gov-disposition').selectOption('Request more evidence');
 await page.locator('#gov-reason').fill('Compare accessible designs before recommending a pilot.');
 await page.locator('#gov-owner').fill('Transport planning team');
 await page.locator('#gov-respond button[type=submit]').click();
 await expect(page.locator('#gov-heading-4')).toBeVisible();
 await page.locator('#gov-date').fill('2027-02-01');
 await page.locator('#gov-measure button[type=submit]').click();
 await expect(page.locator('#citizen-feedback')).toContainText('not an official government response');
 await expect(page.locator('#citizen-feedback')).toContainText('Compare accessible designs before recommending a pilot.');
 await expect(page.locator('#citizen-feedback')).toContainText('2027-02-01');
}
test('citizen finds an existing public record locally and previews a complete government response',async({page})=>{
 await page.route('**/api/catalog',r=>r.fulfill({json:{goals:[fixture]}}));
 const api=[];page.on('request',r=>{if(r.url().includes('/api/'))api.push({url:r.url(),method:r.method(),body:r.postData()})});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('#journal').fill('Bus stops need shade. PRIVATE-JOURNAL-SENTINEL.');
 await page.locator('#journal-form button[type=submit]').click();
 await page.locator('#find-related').click();
 await expect(page.locator('#related-list')).toContainText(exampleTitle);
 await page.locator('#related-list button').first().click();
 await expect(page.locator('#heading-3')).toHaveText('Contribute to a shared proposal.');
 await expect(page.locator('#proposal-form')).toBeHidden();
 await page.locator('#decision-panel').getByRole('button',{name:'Support',exact:true}).click();
 await expect(page.locator('#position-status')).toContainText('Nothing was transmitted');
 await expect(page.locator('#amend-link')).toHaveAttribute('href','/laws?goal='+fixture.id);
 await page.locator('#handoff-government').click();
 await expect(page.locator('#gov-record')).toContainText(exampleTitle);
 await expect(page.locator('#gov-record')).toContainText('Your local preview choice: Support');
 await completeReview(page);
 await expect(page.locator('#decision-panel')).toBeVisible();
 expect(api).toEqual([{url:new URL('/api/catalog',page.url()).href,method:'GET',body:null}]);
 expect(JSON.stringify(api)).not.toContain('PRIVATE-JOURNAL-SENTINEL');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#mode-government').click();
 await expect(page.locator('#gov-heading-4')).toBeVisible();
 await page.reload();
 await expect(page.locator('#citizen-feedback')).toBeHidden();
});
test('government can independently load the public catalog and filter it without posting',async({page})=>{
 await page.route('**/api/catalog',r=>r.fulfill({json:{goals:[fixture,{...fixture,id:'HGA-002',title:'Library access',sharedGoal:'Libraries for all'}]}}));
 await page.goto('/');
 await page.locator('#mode-government').click();
 await page.locator('#gov-load').click();
 await expect(page.locator('#gov-list .candidate')).toHaveCount(2);
 await page.locator('#gov-search').fill('shaded');
 await expect(page.locator('#gov-list .candidate')).toHaveCount(1);
 await page.locator('#gov-list button').click();
 await expect(page.locator('#gov-record')).toContainText(exampleTitle);
});
test('static government sample and feedback stay in the browser',async({page})=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8').replace('name="helios-mode" content="live"','name="helios-mode" content="static"');
 await page.route('**/',r=>r.fulfill({contentType:'text/html',body:html}));
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url())});
 await page.goto('/');
 await page.locator('#mode-government').click();
 await page.locator('#gov-load').click();
 await expect(page.locator('#gov-source')).toContainText('Illustrative sample');
 await page.locator('#gov-example').click();
 await completeReview(page);
 expect(requests).toEqual([]);
});


test('footer opens the archived experiments in a new tab without losing a private journal',async({page})=>{
 await page.goto('/');
 await page.locator('#journal').fill('Private draft that must remain in the original tab.');
 const link=page.getByRole('link',{name:'Docs & Experiments (opens in a new tab)'});
 await expect(link).toBeVisible();
 const [archive]=await Promise.all([page.waitForEvent('popup'),link.click()]);
 await archive.waitForLoadState('domcontentloaded');
 expect(new URL(archive.url()).pathname).toBe('/experiments.html');
 await expect(archive.locator('#tab-helios-ai')).toBeVisible();
 await expect(archive.getByRole('link',{name:'Documentation ↗',exact:true})).toBeVisible();
 await expect(archive.getByRole('link',{name:'← Helios Loop',exact:true})).toHaveAttribute('href','./index.html');
 await expect(page.locator('#journal')).toHaveValue('Private draft that must remain in the original tab.');
 await archive.close();
});
