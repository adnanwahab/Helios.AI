import {test,expect} from '@playwright/test';

test('linked law explorer, editor, revision scope, scenario and deep link',async({page})=>{
 await page.goto('/constitution?law=HGA-012&clause=implementation');
 await expect(page.locator('#record-id')).toContainText('HGA-012');
 await expect(page.locator('[data-section="HGA-012:implementation"]')).toHaveAttribute('aria-current','true');
 await page.locator('[data-editor-section="safeguards"]').click();
 await expect(page.locator('[data-section="HGA-012:safeguards"]')).toHaveAttribute('aria-current','true');
 await expect(page).toHaveURL(/clause=safeguards/);
 await page.reload();
 await expect(page.locator('#clause-title')).toContainText('Risks & safeguards');
 await page.locator('#search').fill('HGA-051');
 await page.locator('[data-law="HGA-051"]').click();
 await expect(page.locator('#record-id')).toContainText('HGA-051');
 await expect(page.locator('#simulation-note')).toContainText('HGA-051');
 await page.locator('#reach').fill('0');
 await expect(page.locator('#delta')).toHaveText('0 pts');
 await page.locator('[data-vote="support"]').click();
 await expect(page.locator('#vote-tally')).toContainText('practice position: support');
 await expect(page.locator('#vote-scope')).toContainText('complete');
 await page.locator('#edit-toggle').click();
 await page.locator('#edit-text').fill('A proposed practice change.');
 await page.locator('#edit-reason').fill('Test the review flow.');
 await page.locator('#save-edit').click();
 await expect(page.locator('#discussion-list')).toContainText('Test the review flow.');
 await expect(page.locator('#published-text')).not.toContainText('A proposed practice change.');
 await page.goBack();
 await expect(page.locator('#record-id')).toContainText('HGA-012');
});

test('community clause links and practice votes are distinct from law votes',async({page})=>{
 await page.goto('/constitution?community=S-002');
 await expect(page.locator('#record-id')).toContainText('S-002');
 await expect(page.locator('#sim-community')).toBeVisible();
 await page.locator('[data-vote="oppose"]').click();
 await page.locator('#comment-text').fill('Practice comment.');
 await page.locator('#post-comment').click();
 await expect(page.locator('#discussion-list')).toContainText('Practice comment.');
 await page.locator('#show-laws').click();
 await expect(page.locator('#vote-tally')).not.toContainText('oppose');
 await expect(page.locator('#comment-form')).toBeHidden();
 await page.goto('/constitution?law=HGA-012&clause=goal&revision=unknown');
 await expect(page.locator('#revision-warning')).toBeVisible();
 await expect(page.locator('[data-vote="support"]')).toBeDisabled();
 await page.locator('#current-version').click();
 await expect(page.locator('[data-vote="support"]')).toBeEnabled();
});

test('mobile fits viewport and homepage opens selected community clause',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('[data-clause-id="S-002"]').click();
 await expect(page.locator('#government-ide-link')).toHaveAttribute('href','/constitution?community=S-002');
 await page.locator('#government-ide-link').click();
 await expect(page.locator('#record-id')).toContainText('S-002');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
