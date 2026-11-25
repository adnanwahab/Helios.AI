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

const hexFills = page => page.locator('.hex').evaluateAll(cells => cells.map(cell => cell.getAttribute('fill')));
const colorFilter = layer => layer.evaluate(element => getComputedStyle(element).filter);
const analysisSnapshot = page => page.locator('#world-hex-suitability').evaluate(root => ({
  scores: [...root.querySelectorAll('.hex')].map(cell => cell.dataset.score),
  selection: root.querySelector('#world-hex-choice').value,
  selectedScore: root.querySelector('.score-number').textContent,
  paragraph: root.querySelector('.paragraph').textContent,
}));

async function sampleStillColors(layer) {
  return layer.evaluate(async element => {
    const before = getComputedStyle(element).filter;
    await new Promise(resolve => setTimeout(resolve, 250));
    return {before, after: getComputedStyle(element).filter};
  });
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

  test('Kaleidoscope animates and pauses colors without changing the suitability analysis', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await openMap(page);
    const toggle = page.locator('#kaleidoscope-toggle');
    const pause = page.locator('#kaleidoscope-pause');
    const layer = page.locator('.hex-layer');
    const originalFills = await hexFills(page);
    const originalFilter = await colorFilter(layer);
    const originalAnalysis = await analysisSnapshot(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.legend')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.legend')).toBeHidden();
    await expect(pause).toHaveText('Pause colors');
    expect(await hexFills(page)).not.toEqual(originalFills);
    expect(await analysisSnapshot(page)).toEqual(originalAnalysis);
    await expect.poll(() => new URL(page.url()).searchParams.get('kaleidoscope')).toBe('1');
    const movingFilter = await colorFilter(layer);
    await expect.poll(() => colorFilter(layer)).not.toBe(movingFilter);

    await pause.click();
    await expect(pause).toHaveText('Resume colors');
    await expect.poll(() => layer.evaluate(element => element.getAnimations().some(animation => animation.playState === 'paused' && !animation.pending))).toBe(true);
    const frozen = await sampleStillColors(layer);
    expect(frozen.after).toBe(frozen.before);
    await pause.click();
    await expect(pause).toHaveText('Pause colors');
    await expect.poll(() => colorFilter(layer)).not.toBe(frozen.after);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toBeHidden();
    await expect(page.locator('.legend')).toBeVisible();
    expect(await hexFills(page)).toEqual(originalFills);
    await expect.poll(() => colorFilter(layer)).toBe(originalFilter);
    expect(await analysisSnapshot(page)).toEqual(originalAnalysis);
    await expect.poll(() => new URL(page.url()).searchParams.has('kaleidoscope')).toBe(false);
  });

  test('reduced motion keeps keyboard-selected rainbow colors still on mobile', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openMap(page);
    const toggle = page.locator('#kaleidoscope-toggle');
    const layer = page.locator('.hex-layer');
    const originalFills = await hexFills(page);
    const originalAnalysis = await analysisSnapshot(page);
    await toggle.focus();
    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-color-motion', 'reduced');
    await expect(page.locator('#kaleidoscope-pause')).toBeHidden();
    expect(await hexFills(page)).not.toEqual(originalFills);
    expect(await layer.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
    const frozen = await sampleStillColors(layer);
    expect(frozen.after).toBe(frozen.before);
    expect(await analysisSnapshot(page)).toEqual(originalAnalysis);
    await expectNoHorizontalOverflow(page);

    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.legend')).toBeVisible();
    expect(await hexFills(page)).toEqual(originalFills);
    await expectNoHorizontalOverflow(page);
  });

  test('a shared Kaleidoscope view survives preference changes, selection and opening the full map', async ({page}) => {
    await openMap(page, '?embed=1&kaleidoscope=1&coast=20');
    await expect(page.locator('#kaleidoscope-toggle')).toHaveAttribute('aria-pressed', 'true');
    const choice = page.locator('#world-hex-choice');
    const selected = await choice.locator('option').nth(11).getAttribute('value');
    await choice.selectOption(selected);
    await expect.poll(() => new URL(page.url()).searchParams.get('cell')).toBe(selected);
    expect(new URL(page.url()).searchParams.get('kaleidoscope')).toBe('1');
    const before = await page.locator('.paragraph').textContent();
    await setExtreme(page, 'climate', 100);
    await expect.poll(() => new URL(page.url()).searchParams.get('climate')).toBe('100');
    await expect(page.locator('.paragraph')).not.toHaveText(before);
    expect(new URL(page.url()).searchParams.get('kaleidoscope')).toBe('1');
    const analysis = await analysisSnapshot(page);

    const fullPage = page.locator('.full-page-link');
    const fullUrl = new URL(await fullPage.getAttribute('href'), page.url());
    expect(fullUrl.searchParams.get('kaleidoscope')).toBe('1');
    expect(fullUrl.searchParams.get('cell')).toBe(selected);
    expect(fullUrl.searchParams.get('climate')).toBe('100');
    expect(fullUrl.searchParams.get('coast')).toBe('20');
    expect(fullUrl.searchParams.has('embed')).toBe(false);
    await fullPage.click();
    await expect(page).toHaveURL(fullUrl.href);
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#kaleidoscope-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(await analysisSnapshot(page)).toEqual(analysis);

    await page.reload();
    await expect(page.locator('#world-hex-suitability')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#kaleidoscope-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(fullUrl.href);
    expect(await analysisSnapshot(page)).toEqual(analysis);
  });
});
