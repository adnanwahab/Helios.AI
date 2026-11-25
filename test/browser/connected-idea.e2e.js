import {test,expect} from '@playwright/test';
test('citizen note → connected draft → editable illustrative scenario',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Your journal',{exact:true}).fill('My bus is late. There is no shade at the stop. The library closes before I finish work. I want a cheap pilot and a review after 90 days.');
 await page.getByRole('button',{name:'Find the civic idea →',exact:true}).click();
 await expect(page.locator('#idea-interpretation')).toContainText('Library access');
 await expect(page.locator('#approach')).toHaveValue(/review after 90 days/);
 await expect(page.locator('#active-board-idea')).toContainText('Reliable transport');
 await page.getByRole('button',{name:'Draft a proposed law →'}).click();
 await expect(page.locator('#idea-experiment')).toBeVisible();
 await expect(page.locator('#idea-experiment')).toContainText('Bus frequency');
 await page.locator('#idea-scenario-slider').fill('10');
 await expect(page.locator('#idea-experiment')).toContainText('Vehicle-hours / day: 36 → 72');
 await page.getByRole('button',{name:'Use these assumptions in my draft'}).click();
 await expect(page.locator('#option')).toHaveValue(/Minutes between buses = 10/);
 await page.locator('#active-draft-review').getByRole('button',{name:'Support',exact:true}).click();
 await expect(page.locator('#active-draft-review')).toContainText('Nothing sent or counted');
 await page.locator('#goal').fill('Make accessible buses reliable.');
 await expect(page.locator('#active-draft-review').getByRole('button',{name:'Support',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#publish')).toBeDisabled();
});
test('nested catalog renders cards and direct recovery link',async({page})=>{
 await page.goto('/embed/goals');
 await expect(page.locator('#cards .card').first()).toBeVisible();
 await expect(page.getByRole('link',{name:'Open catalog directly ↗'})).toBeVisible();
 await expect(page.locator('#connectionStatus')).not.toHaveText('Loading editorial goals…');
});
