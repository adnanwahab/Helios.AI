import {test, expect} from '@playwright/test';

// Captures genuine local app states for the captioned contribution tutorial.
// No GitHub navigation, public submission, or dummy contribution is performed.
test('contribution tutorial reaches a reviewed GitHub handoff without publishing', async ({page}, testInfo) => {
  const writes = [];
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/contribute');
  await expect(page.getByRole('heading',{name:'Help build a better future.'})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('tutorial-contribute.png'),animations:'disabled'});
  await page.goto('/');
  await expect(page.locator('#pr-compose-open')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('tutorial-homepage.png'),animations:'disabled'});
  await page.locator('#pr-compose-open').click();
  const modal=page.locator('#pr-compose');
  await expect(modal).toBeVisible();
  await page.locator('#pr-kind').selectOption('feature');
  await page.locator('#pr-title').fill('Explain childcare costs clearly');
  await page.locator('#pr-message').fill('Show the hourly childcare rate and subsidy side by side. Explain the estimated public cost and list the assumptions, so contributors can question and improve them.');
  await modal.screenshot({path:testInfo.outputPath('tutorial-draft.png'),animations:'disabled'});
  await page.locator('#pr-compose-form button[type=submit]').click();
  await page.locator('#pr-destination').selectOption('github');
  await expect(page.locator('#pr-payload')).toHaveValue(/Explain childcare costs clearly/);
  await expect(page.locator('#pr-github')).toHaveAttribute('aria-disabled','true');
  await modal.screenshot({path:testInfo.outputPath('tutorial-review.png'),animations:'disabled'});
  await page.locator('#pr-consent').check();
  await expect(page.locator('#pr-github')).toHaveAttribute('href',/^https:\/\/github\.com\/adnanwahab\/HeliosHTML\/new\/main\/data\/contributions\?filename=/);
  await expect(page.locator('#pr-copy')).toBeEnabled();
  await modal.screenshot({path:testInfo.outputPath('tutorial-github-handoff.png'),animations:'disabled'});
  // Stop before clicking the external editor or submitting to the private inbox.
  await page.locator('#pr-compose-close').click();
  await page.goto('/launch');
  await expect(page.locator('#launch-title')).toBeVisible();
  await expect(page.locator('[data-launch-progress]')).toHaveText(/\d+ \/ 22/);
  await page.screenshot({path:testInfo.outputPath('tutorial-dashboard.png'),animations:'disabled'});
  expect(writes).toEqual([]);
});
