import {test, expect} from '@playwright/test';

// The page opens on pair 2,061,728,394: journals 4,123,456,788 and 4,123,456,789.
const START = 2061728394;
const row = (page, i) => page.locator(`.row[data-i="${i}"]:not([hidden])`);
const texts = r => Promise.all(['.a', '.b', '.c'].map(s => r.locator(s + ' textarea').inputValue()));
// The default settings: lines, ignoring case and spacing, journal 1 then journal 2.
function merged(a, b) {
  const seen = new Set(), out = [];
  for (const line of [...a.split('\n'), ...b.split('\n')]) {
    const t = line.replace(/\s+$/, '');
    const key = t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join('\n');
}

test('Three-editor merge: journals merge into a constitution across 8 billion journals', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/merge');
  await expect(page.locator('#where')).toHaveText('Pair 2,061,728,394');
  const first = row(page, START);
  await expect(first.locator('.a h2')).toHaveText('Journal 4,123,456,788');
  await expect(first.locator('.b h2')).toHaveText('Journal 4,123,456,789');
  await expect(first.locator('.c textarea')).not.toHaveValue('');
  const [a, b, c] = await texts(first);
  expect(c).toBe(merged(a, b));
  await expect(first.locator('.b .key')).toContainText('l00/pages/41234/567');
  await expect(first.locator('.b .key')).toContainText('line 89');
  await expect(first.locator('.c .key')).toContainText('l01/pages/20617/283');

  // Scrolling mounts the next pairs.
  await page.locator('#feed').evaluate(feed => {
    const [x, y] = [...feed.querySelectorAll('.row:not([hidden])')].map(r => parseFloat(r.style.top)).sort((p, q) => p - q);
    feed.scrollTop += 3 * (y - x);
  });
  await expect(page.locator('#where')).toHaveText('Pair 2,061,728,397');

  // Jump to the last journal, then back to the first pair.
  await page.locator('#jump').fill('7,999,999,999');
  await page.locator('#jump').press('Enter');
  await expect(page.locator('#where')).toHaveText('Pair 3,999,999,999');
  await expect(row(page, 3999999999).locator('.b .key')).toContainText('l00/pages/79999/999');
  await page.locator('#jump').fill('4123456788');
  await page.locator('#jump').press('Enter');
  await expect(page.locator('#where')).toHaveText('Pair 2,061,728,394');

  // An edit to a journal reaches the constitution and is logged as a delta PUT.
  await row(page, START).locator('.a textarea').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nNeed: a pool that opens in May.');
  await expect(row(page, START).locator('.c textarea')).toHaveValue(/Need: a pool that opens in May\./);
  await page.getByRole('button', {name: 'S3 layout'}).click();
  await expect(page.locator('#log')).toContainText('PUT v1/delta/l00/41234/');
  await expect(page.locator('#live')).toContainText('s3://helios-journals/v1/l00/pages/41234/567.g');
  await page.getByRole('button', {name: 'Close'}).click();

  // A hand edit to the constitution pauses merging for that pair until Resync.
  await row(page, START).locator('.c textarea').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' (edited)');
  await expect(row(page, START).getByRole('button', {name: 'Resync'})).toBeVisible();
  await row(page, START).getByRole('button', {name: 'Resync'}).click();
  const [a2, b2, c2] = await texts(row(page, START));
  expect(c2).toBe(merged(a2, b2));

  // Settings change every visible constitution.
  await page.getByRole('radio', {name: 'Sentences'}).check();
  await expect(page.locator('#l1')).toHaveText(/^sentences? in$/);
  await page.getByRole('switch', {name: 'Include'}).first().uncheck();
  await expect(row(page, START).locator('.c textarea')).not.toHaveValue(/Need: a pool that opens in May\./);

  await page.setViewportSize({width: 390, height: 844});
  await expect(page.getByRole('button', {name: 'Settings'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('home page tab embeds the three-editor merge', async ({page}) => {
  await page.goto('/');
  await page.getByRole('tab', {name: 'Three-Editor Merge'}).click();
  await expect(page.locator('#view-merge')).toBeVisible();
  await expect(page.locator('#view-merge')).toHaveAttribute('src', '/embed/merge');
  await expect(page.frameLocator('#view-merge').locator('#where')).toHaveText('Pair 2,061,728,394');
});
