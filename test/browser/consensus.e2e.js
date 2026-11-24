import {test, expect} from '@playwright/test';

test('neighborhood consensus: surface, table, five linked views and pasted ballots', async ({page}, info) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/consensus');
  await expect(page.locator('#tbl tbody tr')).toHaveCount(11);
  await expect(page.locator('#title')).toHaveText('GARDEN · yes(b, w) · 40 × 30 grid');
  await expect(page.locator('.bar')).toContainText('not real votes');
  // The 3D surface needs WebGL2; without it the page says so and everything else still works.
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (webgl) await expect(page.locator('.fallback')).toHaveCount(0);
  else await expect(page.locator('.fallback')).toContainText('needs WebGL2');

  // The five linked views draw with SVG and 2D canvas.
  await page.locator('#bMore').click();
  for (const id of ['#fTime', '#fBal', '#fSlice', '#fRace']) await expect(page.locator(`${id} svg path, ${id} svg rect`).first()).toBeAttached();
  await expect(page.locator('#fun .fr')).toHaveCount(4);
  await expect(page.locator('#mapT')).toContainText('Week of 31 MAY');
  expect(await page.locator('#map').evaluate(c => c.width > 0 && c.height > 0)).toBe(true);

  // Pinning a week in the table updates every view.
  await page.locator('#tbl tbody tr[data-w="18"]').click();
  await expect(page.locator('#moreNow')).toContainText('pinned week 30 AUG');
  await expect(page.locator('#funT')).toContainText('Week of 30 AUG');

  // Cooperation measure, then another proposal from the all-proposals chart.
  await page.locator('#mCoop').click();
  await expect(page.locator('#title')).toContainText('coop(b, w)');
  await page.locator('#fRace g[data-i="3"]').click();
  await expect(page.locator('#title')).toHaveText('HOUSING · coop(b, w) · 40 × 30 grid');

  // Pasted ballots render as their own proposal and stay in the page.
  await page.locator('.own summary').click();
  await page.locator('#ownTxt').fill(JSON.stringify({title: 'Dog park', site: 'Oak Hollow', ballots: [{block: 1, week: 1, yes: 9, no: 3}, {block: 12, week: 2, yes: 30, no: 41}]}));
  await page.locator('#ownGo').click();
  await expect(page.locator('#ownMsg')).toHaveText('Rendered 83 ballots.');
  await expect(page.locator('#title')).toHaveText('YOURS · yes(b, w) · 40 × 30 grid');
  await expect(page.locator('#bLive')).toBeDisabled();
  await page.screenshot({path: info.outputPath('consensus-desktop.png'), fullPage: true});
  expect(errors).toEqual([]);
});

test('the archived dashboard embeds it as a tab, and phones do not scroll sideways', async ({page}, info) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/experiments.html');
  await page.locator('#tab-consensus').click();
  await expect(page.locator('#tab-consensus')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#view-consensus')).toBeVisible();
  await expect(page.frameLocator('#view-consensus').locator('#title')).toHaveText('GARDEN · yes(b, w) · 40 × 30 grid');
  await page.screenshot({path: info.outputPath('consensus-home-tab.png')});
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/consensus');
  await expect(page.locator('#tbl tbody tr')).toHaveCount(11);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: info.outputPath('consensus-mobile.png'), fullPage: true});
  expect(errors).toEqual([]);
});
