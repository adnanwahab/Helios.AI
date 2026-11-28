import {test, expect} from '@playwright/test';

// The apps load from their live sites. Stand-in pages for those origins keep this
// test about the apps page itself, not the network.
const SITES = /^https:\/\/(?:happybearlandia|civic-synthesis|digital-pensieve|helios-ai-laws)\.fly\.dev\//;
async function standIns(page) {
  const requests = [];
  await page.context().route(SITES, route => {
    const url = route.request().url();
    requests.push(url);
    const host = new URL(url).host;
    return route.fulfill({contentType: 'text/html', body: `<!doctype html><title>${host}</title><p>Stand-in for ${host}</p>`});
  });
  return requests;
}
const visible = page => page.locator('#grid .app:visible');

test('Apps shows the four sites in frames, expands one and goes back', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests = await standIns(page);
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto('/apps');
  await expect(page.locator('#grid .view.ready')).toHaveCount(4);
  expect(await page.locator('#grid iframe').evaluateAll(frames => frames.map(f => f.src))).toEqual([
    'https://happybearlandia.fly.dev/',
    'https://civic-synthesis.fly.dev/embed',
    'https://digital-pensieve.fly.dev/',
    'https://helios-ai-laws.fly.dev/',
  ]);
  await expect(page.frameLocator('section[aria-label="Helios.AI"] iframe').locator('p')).toHaveText('Stand-in for helios-ai-laws.fly.dev');
  // Civic Synthesis frames its /embed page; Open goes to the full site.
  await expect(page.locator('section[aria-label="Civic Synthesis"] a.tool')).toHaveAttribute('href', 'https://civic-synthesis.fly.dev/');

  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/apps#digital-pensieve$/);
  await expect(visible(page)).toHaveCount(1);
  await expect(page.locator('section[aria-label="Digital Pensieve"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(visible(page)).toHaveCount(4);
  await expect(page).toHaveURL(/\/apps$/);

  await page.locator('section[aria-label="Helios.AI"]').getByRole('button', {name: 'Show only Helios.AI'}).click();
  await expect(page).toHaveURL(/\/apps#helios$/);
  await expect(visible(page)).toHaveCount(1);
  await page.getByRole('button', {name: 'Back to all apps (Esc)'}).click();
  await expect(visible(page)).toHaveCount(4);

  const civic = () => requests.filter(url => url.startsWith('https://civic-synthesis.fly.dev/')).length;
  const before = civic();
  await page.getByRole('button', {name: 'Reload Civic Synthesis from its home page'}).click();
  await expect.poll(civic).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('Apps opens straight to one app from its link and fits a phone', async ({page}) => {
  await standIns(page);
  await page.setViewportSize({width: 360, height: 780});
  await page.goto('/apps#civic-synthesis');
  await expect(visible(page)).toHaveCount(1);
  await expect(page.locator('section[aria-label="Civic Synthesis"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/apps/');
  await expect(visible(page)).toHaveCount(4);
  await expect(page.locator('#grid .view.ready')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
