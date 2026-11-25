import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('homepage keeps civic workflow and opens the 100-proposal workshop on demand', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#journal')).toBeVisible();
  await expect(page.locator('#communal-science-lab')).toBeVisible();
  await expect(page.locator('#research-workshop-panel')).toBeHidden();
  await page.locator('[data-research-feature="HGA-051"]').click();
  await expect(page.locator('#law-count')).toHaveText('101');
  await expect(page.locator('#law-id')).toContainText('HGA-051');
  await expect(page.locator('#law-tiles .law-tile')).toHaveCount(101);
  await expect(page.locator('#law-chart')).toBeVisible();
  await page.locator('#law-input-effect').fill('40');
  await expect(page.locator('#law-value-effect')).toHaveText('40%');
  await page.locator('#law-reset').click();
  await expect(page.locator('#law-value-effect')).not.toHaveText('40%');
  await page.locator('#law-search').fill('HGA-012');
  await expect(page.locator('#law-tiles .law-tile')).toHaveCount(1);
  await page.locator('#law-tiles [data-law="HGA-012"]').click();
  await expect(page).toHaveURL(/[?&]law=HGA-012(?:[&#]|$)/);
  await page.reload();
  await expect(page.locator('#law-id')).toContainText('HGA-012');
  await expect(page.locator('#research-workshop-panel')).toBeVisible();
  await page.locator('#communal-science-lab').screenshot({path:test.info().outputPath('public-workshop.png')});
});

test('research planner has twenty slots; exported mission is local and unscheduled', async ({page}) => {
  await page.goto('/?law=HGA-051&labView=research');
  await expect(page.locator('#research-research-panel')).toBeVisible();
  await expect(page.locator('.research-bench')).toHaveCount(4);
  await expect(page.locator('.research-agent')).toHaveCount(20);
  await page.locator('.research-agent[data-slot="11"]').click();
  await expect(page.locator('#research-selected-role')).toContainText('Scenario designer');
  await page.locator('#research-question').fill('What changes with a different rollout assumption?');
  await page.locator('#research-minutes').fill('15');
  await page.locator('#research-budget').fill('2');
  await expect(page.locator('#research-proposal')).toHaveValue('HGA-051');
  const downloaded=page.waitForEvent('download');
  await page.locator('#research-export').click();
  const download=await downloaded;
  const mission=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(mission).toMatchObject({status:'draft_not_scheduled',proposalId:'HGA-051',slot:11,minutes:15,budgetUsd:2,inputVersion:null,requiresVersionResolution:true});
  await expect(page.locator('#research-mission-status')).toContainText('Nothing was queued or transmitted');
  await page.locator('#communal-science-lab').screenshot({path:test.info().outputPath('research-lab.png')});
  await page.reload();
  await expect(page.locator('#research-research-panel')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#communal-science-lab').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('the lab shares ?law= with the linked-law workshop and stays closed until opened', async ({page}) => {
  await page.goto('/?law=HGA-012');
  await expect(page.locator('#research-workshop-panel')).toBeHidden();
  await page.locator('#research-workshop-tab').click();
  await expect(page.locator('#law-id')).toContainText('HGA-012');
  await page.locator('#law-tiles [data-law="HGA-091"]').click();
  await expect(page).toHaveURL(/[?&]law=HGA-091(?:[&#]|$)/);
  expect(new URL(page.url()).searchParams.has('labLaw')).toBe(false);
});
