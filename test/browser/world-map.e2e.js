import {test, expect} from '@playwright/test';

const factors = ['climate', 'cost', 'city', 'nature', 'coast'];

async function openMap(page, search = '') {
  await page.goto('/world-map' + search);
  await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.paragraph')).not.toBeEmpty();
}

async function setExtreme(page, factor, value) {
  const slider = page.locator('#pref-' + factor);
  await slider.focus();
  await slider.press(value === 0 ? 'Home' : 'End');
  await expect(slider).toHaveValue(String(value));
}

async function expectFiniteScores(page) {
  const scores = await page.locator('.hex').evaluateAll(cells => cells.map(cell => cell.dataset.score));
  expect(scores.length).toBeGreaterThan(1000);
  expect(scores.every(score => score !== '' && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 100)).toBe(true);
  await expect(page.locator('.score-number')).toHaveText(/^\d{1,3}$/);
  const selectedScore = Number(await page.locator('.score-number').textContent());
  expect(selectedScore).toBeGreaterThanOrEqual(0);
  expect(selectedScore).toBeLessThanOrEqual(100);
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.describe('World suitability map', () => {
  test('the clean route renders real map geometry, finite scores and an explanatory paragraph', async ({page}) => {
    await openMap(page);
    await expect(page.locator('.weight-controls input[type="range"]')).toHaveCount(5);
    const count = await page.locator('.hex').count();
    await expect(page.locator('#world-hex-choice option')).toHaveCount(count);
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-cell-count', String(count));
    expect(await page.locator('.hex').evaluateAll(cells => cells.every(cell => {
      const path = cell.getAttribute('d');
      return path && !/NaN|Infinity/.test(path) && /^[0-9a-f]{15}$/.test(cell.dataset.cellId);
    }))).toBe(true);
    await expectFiniteScores(page);
    await expect(page.locator('.paragraph')).toContainText('illustrative model');
    await expect(page.locator('.paragraph')).toContainText('synthetic');
    await expect(page.locator('#load-status')).toBeHidden();
  });

  test('keyboard preference changes update the URL and the explanation for the selected hexagon', async ({page}) => {
    await openMap(page);
    const selected = await page.locator('#world-hex-choice').inputValue();
    const before = await page.locator('.paragraph').textContent();
    await setExtreme(page, 'coast', 100);
    await expect.poll(() => new URL(page.url()).searchParams.get('coast')).toBe('100');
    await expect(page.locator('.paragraph')).not.toHaveText(before);
    await expect(page.locator('.paragraph')).toContainText('coastal proximity');
    await expect(page.locator('#world-hex-choice')).toHaveValue(selected);
    await expect(page.locator('#pref-climate')).toHaveValue('70');
    await expectFiniteScores(page);
  });

  test('turning every preference off yields an explicit unranked state and can be reversed', async ({page}) => {
    await openMap(page);
    for (const factor of factors) await setExtreme(page, factor, 0);
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-weight-sum', '0');
    await expect(page.locator('.score-number')).toHaveText('Unranked');
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.paragraph')).toContainText('no combined suitability score');
    expect(await page.locator('.hex').evaluateAll(cells => cells.every(cell => cell.dataset.score === ''))).toBe(true);
    for (const factor of factors) expect(new URL(page.url()).searchParams.get(factor)).toBe('0');

    await setExtreme(page, 'climate', 100);
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-weight-sum', '100');
    await expect(page.locator('.empty-state')).toBeHidden();
    await expect(page.locator('.paragraph')).toContainText('Only mild climate is active');
    await expectFiniteScores(page);
  });

  test('a selected hexagon and all five preference weights survive a shared-URL reload', async ({page}) => {
    const weights = {climate: 100, cost: 0, city: 20, nature: 35, coast: 90};
    await openMap(page, '?' + new URLSearchParams(weights));
    for (const [factor, value] of Object.entries(weights)) {
      await expect(page.locator('#pref-' + factor)).toHaveValue(String(value));
    }
    const choice = page.locator('#world-hex-choice');
    const selected = await choice.locator('option').nth(7).getAttribute('value');
    await choice.selectOption(selected);
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-selected-cell', selected);
    await expect.poll(() => new URL(page.url()).searchParams.get('cell')).toBe(selected);
    const description = await page.locator('.paragraph').textContent();
    const score = await page.locator('.score-number').textContent();
    const sharedUrl = page.url();

    await page.reload();
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
    await expect(page).toHaveURL(sharedUrl);
    await expect(choice).toHaveValue(selected);
    for (const [factor, value] of Object.entries(weights)) {
      await expect(page.locator('#pref-' + factor)).toHaveValue(String(value));
    }
    await expect(page.locator('.paragraph')).toHaveText(description);
    await expect(page.locator('.score-number')).toHaveText(score);
  });

  test('the homepage loads the real embedded map only when expanded and reuses it', async ({page}) => {
    const dataRequests = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/public/world-map/world-data.json') dataRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.locator('#journal')).toBeVisible();
    await expect(page.locator('#world-map-disclosure')).not.toHaveAttribute('open', '');
    await expect(page.locator('#world-map-frame')).toHaveCount(0);
    expect(dataRequests).toEqual([]);

    const disclosure = page.locator('#world-map-disclosure > summary');
    await disclosure.click();
    await expect(page.locator('#world-map-frame')).toHaveCount(1);
    const embedded = page.frameLocator('#world-map-frame');
    await expect(embedded.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
    await expect(embedded.locator('body')).toHaveClass(/embedded/);
    await expect(embedded.locator('.paragraph')).not.toBeEmpty();
    expect(dataRequests).toHaveLength(1);

    await embedded.locator('#pref-coast').focus();
    await embedded.locator('#pref-coast').press('End');
    await expect(embedded.locator('#pref-coast')).toHaveValue('100');
    await expect(embedded.locator('.full-page-link')).toHaveAttribute('href', /coast=100/);
    await expect(embedded.locator('.full-page-link')).not.toHaveAttribute('href', /embed=1/);
    await disclosure.click();
    await expect(page.locator('#world-map-frame')).toBeHidden();
    await disclosure.click();
    await expect(page.locator('#world-map-frame')).toBeVisible();
    await expect(page.locator('#world-map-frame')).toHaveCount(1);
    await expect(embedded.locator('#pref-coast')).toHaveValue('100');
    expect(dataRequests).toHaveLength(1);
  });

  test('the standalone and embedded map fit a narrow mobile viewport', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await openMap(page);
    await expectNoHorizontalOverflow(page);
    await page.locator('.model-note > summary').click();
    await expectNoHorizontalOverflow(page);
    await setExtreme(page, 'coast', 100);
    await expectFiniteScores(page);
    await expectNoHorizontalOverflow(page);

    await page.goto('/');
    await page.locator('#world-map-disclosure > summary').click();
    const embedded = page.frameLocator('#world-map-frame');
    await expect(embedded.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
    await expectNoHorizontalOverflow(page);
    expect(await embedded.locator('html').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
    const frameBounds = await page.locator('#world-map-frame').boundingBox();
    expect(frameBounds.x).toBeGreaterThanOrEqual(0);
    expect(frameBounds.x + frameBounds.width).toBeLessThanOrEqual(390);
  });
});
