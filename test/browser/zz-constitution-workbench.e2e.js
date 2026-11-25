import {test,expect} from '@playwright/test';
test('Docs drawer and three-lane workbench stay private in practice; matching is local',async({page})=>{
 const api=[];page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url())});
 await page.goto('/');
 await expect(page.locator('#constitution-list .clause-card')).toHaveCount(12);
 await expect(page.locator('#synthetic-people')).toHaveText('256');
 await expect(page.locator('#journal')).toBeVisible();
 await expect(page.locator('#constitution-title')).toBeVisible();
 await expect(page.locator('#review-title')).toBeVisible();
 await page.locator('#docs-open').click();
 await expect(page.locator('#docs-drawer')).toBeVisible();
 await expect(page.locator('#docs-links a')).toHaveCount(34);
 await page.locator('#docs-search').fill('morphlab');
 await expect(page.locator('#docs-links a')).toHaveCount(2);
 await page.keyboard.press('Escape');await expect(page.locator('#docs-drawer')).toBeHidden();
 await page.locator('#journal').fill('Public transit stops need shade. PRIVATE-SENTINEL');
 await expect(page.locator('#review-match')).toBeVisible();
 await page.locator('#review-match').click();
 await page.locator('[data-clause-vote="support"]').click();
 await expect(page.locator('#clause-status')).toContainText('Practice position');
 await page.locator('#clause-comment').fill('Consider accessibility.');
 await page.locator('#post-comment').click();
 await expect(page.locator('#clause-comments')).toContainText('Consider accessibility.');
 const text=await page.locator('#clause-text').textContent();
 await page.locator('#new-clause').fill('  '+text.toUpperCase()+'  ');
 await expect(page.locator('#dedupe-hint')).toContainText('Same normalized wording');
 await page.locator('#contribute-clause').click();
 await expect(page.locator('#constitution-list .clause-card')).toHaveCount(12);
 expect(api).toEqual([]);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('connected vote counts persist across browser contexts, pending comments are private',async({page,browser})=>{
 await page.goto('/');
 await page.locator('#board-connect').click();
 await expect(page.locator('#review-mode')).toHaveText('Shared');
 await page.locator('[data-clause-vote="support"]').click();
 await expect(page.locator('#clause-status')).toContainText('Position recorded');
 await expect(page.locator('#clause-real')).toContainText(/1 support/);
 await page.locator('#clause-comment').fill('Test comment pending review.');
 await page.locator('#post-comment').click();
 await expect(page.locator('#comment-status')).toContainText('Confirm');
 await page.locator('#comment-consent').check();
 await page.locator('#post-comment').click();
 await expect(page.locator('#clause-comments')).toContainText('pending moderation');
 const other=await browser.newPage();
 try{
 await other.goto(page.url());
 await other.locator('#board-connect').click();
 await expect(other.locator('#clause-real')).toContainText(/1 support/);
 await expect(other.locator('#clause-comments')).not.toContainText('Test comment pending review.');
 }finally{await other.close()}
});

test('Docs opens a full archive with one toggled iframe and preserves the journal',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 await page.locator('#journal').fill('Private journal draft retained across archive views.');
 await expect(page.locator('iframe')).toHaveCount(0);
 await page.locator('#docs-open').click();
 await expect(page.locator('#docs-drawer')).toHaveAttribute('data-view','tabs');
 await expect(page.locator('#docs-links a')).toHaveCount(34);
 await expect(page.locator('#docs-frame')).toHaveCount(0);
 await page.locator('#docs-links a[data-experience="Neighborhood Consensus"]').click();
 await expect(page.locator('#docs-current')).toHaveText('Neighborhood Consensus');
 await expect(page.locator('#docs-frame')).toHaveAttribute('src',/\/neighborhood_consensus\.html$/);
 await expect(page.frameLocator('#docs-frame').locator('body')).toBeVisible();
 await expect(page.locator('#docs-links a[data-experience="Neighborhood Consensus"]')).toHaveAttribute('aria-current','true');
 await expect(page.locator('#docs-external')).toHaveAttribute('href','neighborhood_consensus.html');
 await page.locator('#docs-links a[data-experience="Three-Editor Merge"]').click();
 await expect(page.locator('#docs-frame')).toHaveCount(1);
 await expect(page.locator('#docs-frame')).toHaveAttribute('src',/\/three_editor_merge\.html$/);
 await expect(page.locator('#docs-links a[data-experience="Three-Editor Merge"]')).toHaveAttribute('aria-current','true');
 await expect(page.locator('#docs-links a[data-experience="Repository documentation"]')).toHaveAttribute('target','_blank');
 await expect(page.locator('#docs-links a[data-experience="YC Research"]')).toHaveAttribute('data-separate','true');
 await page.locator('#docs-layout').click();
 await expect(page.locator('#docs-drawer')).toHaveAttribute('data-view','drawer');
 await expect(page.locator('#docs-frame')).toHaveCount(0);
 await page.locator('#docs-layout').click();
 await expect(page.locator('#docs-frame')).toHaveAttribute('src',/\/three_editor_merge\.html$/);
 await page.locator('#docs-close').click();
 await expect(page.locator('#docs-drawer')).toBeHidden();
 await expect(page.locator('#docs-frame')).toHaveCount(0);
 await expect(page.locator('#journal')).toHaveValue('Private journal draft retained across archive views.');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#docs-open').click();
 await page.locator('#docs-search').fill('Neighborhood Consensus');
 await page.locator('#docs-links a[data-experience="Neighborhood Consensus"]').click();
 await expect(page.locator('#docs-frame')).toBeVisible();
 expect(await page.locator('#docs-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.locator('#docs-close').click();
 await expect(page.locator('#journal')).toHaveValue('Private journal draft retained across archive views.');
});

test('homepage opens on the three-lane workshop with the law atlas below',async({page})=>{
 await page.setViewportSize({width:1664,height:878});
 await page.goto('/');
 await expect(page.locator('#mode-citizen')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#docs-open')).toBeInViewport();
 await expect(page.locator('header a')).toHaveCount(0);
 for(const id of ['heading-1','constitution-title','review-title','journal']) {
   await expect(page.locator('#'+id)).toBeInViewport();
 }
 const layout=await page.evaluate(()=>{
   const rect=selector=>document.querySelector(selector).getBoundingClientRect();
   const left=rect('.citizen-main'),middle=rect('.constitution-board'),right=rect('.clause-review');
   return {aligned:left.top===middle.top&&middle.top===right.top,ordered:left.right<middle.left&&middle.right<right.left,atlasBelow:rect('#laws-workbench').top>Math.max(left.bottom,middle.bottom,right.bottom)};
 });
 expect(layout).toEqual({aligned:true,ordered:true,atlasBelow:true});
 await expect(page.locator('#laws-workbench')).toBeAttached();
 await expect(page.locator('footer #mystery-link')).toBeAttached();
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#heading-1')).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
