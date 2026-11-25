import {test, expect} from '@playwright/test';
test('homepage launches the native rainbow Pensieve and a full mission completes', async ({page}, testInfo) => {
  await page.goto('/');
  const launch = page.locator('#rainbow-pensieve-link');
  await expect(launch).toBeVisible();
  await expect(launch).toHaveAttribute('href', './public/rainbow-pensieve.html');
  const [story] = await Promise.all([page.waitForEvent('popup'), launch.click()]);
  await expect(story).toHaveTitle(/Rainbow Pensieve/);
  await expect(story.locator('#spells .spell')).toHaveCount(11);
  await expect(story.locator('#future-title')).toHaveText('Community Discovery Lab');
  await story.locator('#start').click();
  for (const spell of ['eyes','pensieve','vision']) {
    await story.locator('#suggested').click();
    await expect(story.locator('[data-spell="'+spell+'"]')).toHaveAttribute('aria-current','true');
    await story.locator('#cast').click();
  }
  await expect(story.locator('#mission-message')).toContainText('Adventure complete');
  await expect(story.locator('#future-title')).toHaveText('Moonlight shuttle');
  await expect(story.locator('#timeline')).toHaveValue('12');
  await story.locator('#pause').click();
  await story.screenshot({path: testInfo.outputPath('rainbow-pensieve-desktop.png'),fullPage:true,animations:'disabled'});
});
test('spell undo preserves explicit sharing, sources and local-only notes', async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/public/rainbow-pensieve.html');
  await expect(page.locator('#shared-count')).toHaveText('6 shared memories');
  await page.locator('[data-spell="forget"]').click();
  await page.locator('#cast').click();
  await expect(page.locator('#bear-memory')).toContainText('veil');
  await expect(page.locator('#shared-count')).toHaveText('5 shared memories');
  await page.locator('#thought').fill('Private example: I repaired a clock.');
  await page.locator('#add-thought').click();
  await page.locator('#excerpt').fill('A workshop for neighbors');
  await page.locator('#share-thought').click();
  await expect(page.locator('#your-trail')).toBeVisible();
  await page.locator('#undo').click();
  await expect(page.locator('#shared-count')).toHaveText('7 shared memories');
  await expect(page.locator('#thought')).toHaveValue('Private example: I repaired a clock.');
  await expect(page.locator('#sources')).not.toContainText('Private example');
  await expect(page.locator('#sources')).toContainText('A workshop for neighbors');
  await page.locator('#withdraw-thought').click();
  await expect(page.locator('#your-trail')).toBeHidden();
  await expect(page.locator('#shared-count')).toHaveText('6 shared memories');
  for(const spell of ['bloom','senses','wish','pause','chorus','alchemy','alias']) {
    await page.locator('[data-spell="'+spell+'"]').click();
    await page.locator('#cast').click();
    await expect(page.locator('#effect')).not.toBeEmpty();
  }
  await expect(page.locator('#bear-alias')).toContainText('Original source: Professor Honey');
  await page.locator('#reset').click();
  await expect(page.locator('#bear-alias')).toBeEmpty();
  await expect(page.locator('#thought')).toBeEmpty();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  await page.locator('#pause').click();
  await page.screenshot({path:testInfo.outputPath('rainbow-pensieve-mobile.png'),fullPage:true,animations:'disabled'});
});
