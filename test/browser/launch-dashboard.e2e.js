import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const checklist=JSON.parse(readFileSync(new URL('../../public/launch-checklist.json',import.meta.url),'utf8'));
const completed=checklist.tasks.filter(task=>task.status==='done').length;

for(const width of [1440,390]){
 test(`launch dashboard shows evidence-backed progress and filters at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===1440?1000:844});
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')writes.push(request.url())});
  const response=await page.goto('/launch');
  expect(response.status()).toBe(200);
  await expect(page.locator('[data-launch-task]')).toHaveCount(22);
  await expect(page.locator('[data-launch-progress]').first()).toContainText(new RegExp(`${completed}\\s*(?:/|of)\\s*22`));
  await expect(page.locator('[data-launch-task] input[type="checkbox"]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`launch-dashboard-${width}.png`),fullPage:true});
  await page.locator('[data-status-filter="done"]').click();
  await expect(page.locator('[data-launch-task]:visible')).toHaveCount(completed);
  await page.locator('[data-status-filter="all"]').click();
  await page.locator('#launch-phase').selectOption('foundation');
  await expect(page.locator('[data-launch-task]:visible')).toHaveCount(checklist.tasks.filter(task=>task.phase==='foundation').length);
  await page.locator('#launch-phase').selectOption('all');
  await page.locator('#launch-search').fill('zzzz-no-matching-launch-task');
  await expect(page.locator('[data-launch-task]:visible')).toHaveCount(0);
  await page.locator('#launch-search').fill('');
  await expect(page.locator('[data-launch-task]:visible')).toHaveCount(22);
  expect(errors).toEqual([]);expect(writes).toEqual([]);
 });
}

test('launch status export contains the checked-in evidence without private browser data',async({page})=>{
 await page.goto('/launch');
 await expect(page.locator('[data-launch-task]')).toHaveCount(22);
 await page.evaluate(()=>localStorage.setItem('private-journal','PRIVATE-LAUNCH-SENTINEL'));
 const downloaded=page.waitForEvent('download');
 await page.locator('#launch-export').click();
 const file=await downloaded;
 const contents=readFileSync(await file.path(),'utf8');
 expect(JSON.parse(contents)).toEqual(checklist);
 expect(contents).not.toContain('PRIVATE-LAUNCH-SENTINEL');
});

test('filtering away a deep-linked task clears its stale hash and sidebar links reopen it',async({page})=>{
 await page.goto('/launch#launch-L02');
 await expect(page.locator('#launch-L02')).toHaveAttribute('open','');
 await page.locator('[data-status-filter="done"]').click();
 await expect(page).not.toHaveURL(/#launch-L02/);
 await page.reload();
 await expect(page.locator('[data-status-filter="done"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#launch-next a[href="#launch-L02"]').click();
 await expect(page.locator('#launch-L02')).toHaveAttribute('open','');
});

test('the published workflow tutorial loads with captions and never autoplays',async({page})=>{
 await page.goto('/launch#workflow-video');
 const video=page.locator('#workflow-video video');
 await expect(video).toBeVisible();
 await expect.poll(()=>video.evaluate(element=>element.readyState)).toBeGreaterThan(0);
 expect(await video.evaluate(element=>element.duration)).toBeCloseTo(96,0);
 expect(await video.evaluate(element=>element.paused)).toBe(true);
 await expect(video.locator('track')).toHaveAttribute('kind','captions');
 await expect(video.locator('track')).toHaveAttribute('srclang','en');
 await expect(page.locator('#workflow-video a').first()).toHaveAttribute('href',/contribution-workflow-transcript\.md$/);
 const captions=await page.request.get('/public/launch/contribution-workflow.vtt');
 expect(captions.headers()['content-type']).toContain('text/vtt');
 expect(await captions.text()).toMatch(/^WEBVTT/);
});
