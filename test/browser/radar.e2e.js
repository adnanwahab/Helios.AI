import {test, expect} from '@playwright/test';

// Counts sampled canvas pixels that have been painted.
const painted = page => page.evaluate(() => {
  const c = document.getElementById('cv');
  const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < px.length; i += 4 * 61) if (px[i]) lit++;
  return lit;
});

test('Vote Radar: draws the map, pauses, switches ballot days and fits a phone', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/radar');
  await expect(page.locator('#days button')).toHaveCount(7);
  await expect.poll(() => painted(page)).toBeGreaterThan(500);
  await expect(page.locator('#rows .row').first()).toBeAttached();
  await expect(page.locator('.note')).toContainText('not an official ballot');

  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Play the radar');
  const frozen = await page.locator('#time').textContent();
  await page.waitForTimeout(600);
  await expect(page.locator('#time')).toHaveText(frozen);

  for (const [day, question] of [['Monday 16', 'Publish every federal contract'], ['Thursday 19', 'plain-language summary'], ['Sunday 22', 'Ratify the ballots']]) {
    await page.getByRole('button', {name: new RegExp('^' + day)}).click();
    await expect(page.locator('#ballotQ')).toContainText(question);
  }
  await expect(page.getByRole('button', {name: /^Sunday 22/})).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#time')).toHaveText('Sun 06:30 ET');

  await page.setViewportSize({width: 390, height: 844});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => painted(page)).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('home page tab embeds the Vote Radar', async ({page}) => {
  await page.goto('/');
  await page.getByRole('tab', {name: 'Vote Radar'}).click();
  await expect(page.locator('#view-radar')).toBeVisible();
  await expect(page.locator('#view-radar')).toHaveAttribute('src', '/embed/radar');
  await expect(page.frameLocator('#view-radar').locator('#days button')).toHaveCount(7);
});
