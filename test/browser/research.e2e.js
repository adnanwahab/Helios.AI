import {readFile} from 'node:fs/promises';
import {test, expect} from '@playwright/test';

async function openDraft(page, {disconnected = false} = {}) {
  if (disconnected) await page.route('**/api/research/status', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({error: 'Shared research is unavailable for this preview.'}),
  }));
  await page.goto('/research');
  await expect(page.locator('#agent-grid [data-task]')).toHaveCount(100);
  await expect(page.locator('#save-status')).not.toContainText('Loading');
}

async function createRoom(page) {
  await openDraft(page);
  await expect(page.locator('#create-room')).toBeEnabled();
  await page.locator('#create-room').click();
  await expect(page).toHaveURL(/\?room=room-[a-f0-9-]+&frame=frame-[a-f0-9-]+/);
  await expect(page.locator('#save-status')).toContainText('Shared room created');
  return new URL(page.url()).searchParams.get('room');
}

test.describe('Research supervision and future keyframes', () => {
  test.setTimeout(45000);

  test('disconnected drafts preserve 1,000 planned slots, inputs, and task direction without shared writes', async ({page}, testInfo) => {
    const posts = [];
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/research/')) posts.push(request.url()); });
    await openDraft(page, {disconnected: true});
    await expect(page.locator('#create-room')).toBeDisabled();
    await expect(page.locator('#worker-count')).toHaveText('0');
    await expect(page.locator('#contributor-count')).toContainText('0 / 1,000');

    const brief = 'Compare accessible gathering places using source-linked evidence and resident priorities.';
    await page.locator('#research-brief').fill(brief);
    await page.locator('#agent-capacity').fill('1000');
    await page.locator('#save-brief').click();
    await expect(page.locator('#save-status')).toContainText('saved in this browser');
    await expect(page.locator('#agent-grid [data-task]')).toHaveCount(1000);
    await page.locator('#queue-plan').click();
    await expect(page.locator('#task-notes')).toBeEnabled();
    await page.locator('#task-notes').fill('Include access for wheelchair users and maintenance costs.');
    await page.locator('#save-task').click();
    await expect(page.locator('#save-status')).toContainText('Supervisor direction saved in this browser');

    await page.reload();
    await expect(page.locator('#agent-grid [data-task]')).toHaveCount(1000);
    await expect(page.locator('#research-brief')).toHaveValue(brief);
    await expect(page.locator('#task-notes')).toHaveValue('Include access for wheelchair users and maintenance costs.');
    await expect(page.locator('#worker-count')).toHaveText('0');
    expect(posts).toEqual([]);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-room').click();
    const download = await downloadPromise;
    const file = testInfo.outputPath('research-draft.json');
    await download.saveAs(file);
    const exported = JSON.parse(await readFile(file, 'utf8'));
    expect(exported.room.brief).toBe(brief);
    expect(exported.tasks).toHaveLength(1000);
    expect(exported.tasks[0].notes).toContain('wheelchair');
    expect(exported.provenance.mode).toBe('browser-draft');
  });

  test('a shared room queues 100 real assignments and reloads saved supervisor direction', async ({page}) => {
    const roomId = await createRoom(page);
    await expect(page.locator('#contributor-count')).toContainText('1 / 1,000');
    await page.locator('#queue-plan').click();
    await expect(page.locator('#agent-grid [data-state="queued"]')).toHaveCount(100);
    await expect(page.locator('#task-notes')).toBeEnabled();
    await expect(page.locator('#task-prompt')).not.toContainText('Loading');
    const selectedId = await page.locator('#agent-grid [aria-pressed="true"]').getAttribute('data-task');
    const direction = 'Cite original local planning records and explicitly record conflicting findings.';
    await page.locator('#task-notes').fill(direction);
    await page.locator('#save-task').click();
    await expect(page.locator('#save-status')).toContainText('Supervisor direction saved with this task');

    const response = await page.request.get(`/api/research/rooms/${roomId}/tasks/${selectedId}`);
    expect(response.ok()).toBe(true);
    expect((await response.json()).notes).toBe(direction);
    await page.reload();
    await expect(page.locator('#task-notes')).toHaveValue(direction);
    await expect(page.locator('#agent-grid [data-state="queued"]')).toHaveCount(100);
    await expect(page.locator('#worker-count')).toHaveText('0');
    await expect(page.locator('#dispatch-state')).toHaveText('Dispatch paused');
    await expect(page.locator('#agent-capacity')).toBeDisabled();
  });

  test('shared room links reconnect from research, agents, and keyframes while keeping the selected frame', async ({page}) => {
    const roomId = await createRoom(page);
    const frameId = new URL(page.url()).searchParams.get('frame');
    for (const route of ['/research', '/agents#coordinator', '/keyframes#keyframes']) {
      await page.goto(route);
      const link = page.locator(`#shared-rooms-list a[data-room-id="${roomId}"]`);
      await expect(link).toBeVisible();
      const href = new URL(await link.getAttribute('href'), page.url());
      expect(href.pathname).toBe(route.split('#')[0]);
      expect(href.searchParams.get('room')).toBe(roomId);
      expect(href.searchParams.get('frame')).toBe(frameId);
      expect(href.hash).toBe(route.includes('#') ? '#' + route.split('#')[1] : '');
      await link.click();
      await expect(page.locator('#save-status')).toContainText('Connected to the shared room');
      expect(new URL(page.url()).searchParams.get('frame')).toBe(frameId);
      await expect(page.locator('#shared-rooms-list')).toContainText('You supervise');
    }
  });

  test('generated research sources are clickable HTTPS links while result markup remains text', async ({page}) => {
    const roomId = await createRoom(page);
    await page.locator('#queue-plan').click();
    await expect(page.locator('#agent-grid [data-state="queued"]')).toHaveCount(100);
    const selectedId = await page.locator('#agent-grid [aria-pressed="true"]').getAttribute('data-task');
    await page.route(`**/api/research/rooms/${roomId}/tasks/${selectedId}`, async route => {
      const response = await route.fetch();
      const task = await response.json();
      await route.fulfill({response, json: {...task, result: 'AI research draft — human review required.\n<img src=x onerror=alert(1)>\nSource (https://example.org/research?finding=1&view=full).\nhttp://insecure.example/reference'}});
    });
    await page.reload();
    await expect(page.locator('#task-result-details')).toBeVisible();
    await page.locator('#task-result-details summary').click();
    const result = page.locator('#task-result');
    await expect(result.locator('a')).toHaveCount(1);
    await expect(result.locator('a')).toHaveAttribute('href', 'https://example.org/research?finding=1&view=full');
    await expect(result.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(result.locator('img')).toHaveCount(0);
    await expect(result).toContainText('<img src=x onerror=alert(1)>');
    await expect(result).toContainText('http://insecure.example/reference');
  });

  test('a new proposed law and generated paragraph persist at the selected future keyframe', async ({page}) => {
    const roomId = await createRoom(page);
    await page.locator('#keyframes').scrollIntoViewIfNeeded();
    await expect(page.locator('#frame-year')).toHaveValue('2028');
    await page.locator('.new-law-details summary').click();
    await page.locator('#new-law-title').fill('Community Repair Spaces Proposal');
    await page.locator('#new-law-change').fill('Test accessible public repair workshops with recurring maintenance funding.');
    await page.locator('#add-new-law').click();
    await expect(page.locator('#frame-laws')).toContainText('Community Repair Spaces Proposal');
    await page.locator('#draft-paragraph').click();
    await expect(page.locator('#frame-summary')).toHaveValue(/Since the 2026 keyframe/);
    await expect(page.locator('#frame-summary')).toHaveValue(/Community Repair Spaces Proposal/);
    const paragraph = await page.locator('#frame-summary').inputValue();
    const frameId = new URL(page.url()).searchParams.get('frame');
    await page.locator('#save-frame').click();
    await expect(page.locator('#save-status')).toContainText('Keyframe revision saved');
    await page.reload();
    await expect(page.locator('#frame-summary')).toHaveValue(paragraph);
    await expect(page.locator('#frame-laws')).toContainText('Community Repair Spaces Proposal');
    expect(new URL(page.url()).searchParams.get('frame')).toBe(frameId);
    await page.locator('#frame-history summary').click();
    await expect(page.locator('#frame-history-list')).toContainText('Revision 2');
    await expect(page.locator('#frame-history-list')).toContainText('Revision 1');
    const state = await (await page.request.get(`/api/research/rooms/${roomId}`)).json();
    const frame = state.frames.find(item => item.id === frameId);
    expect(frame.summary).toBe(paragraph);
    expect(frame.laws.some(law => law.title === 'Community Repair Spaces Proposal')).toBe(true);
  });

  test('two collaborators preserve a stale draft without overwriting the saved revision', async ({page, browser}) => {
    const roomId = await createRoom(page);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    try {
      await other.goto(page.url());
      await expect(other.locator('#save-status')).toContainText('Connected to the shared room');
      await expect(other.locator('#save-brief')).toBeDisabled();
      await expect(other.locator('#save-frame')).toBeEnabled();
      await other.locator('#frame-summary').fill('A collaborator’s alternative future, held as an unsaved draft.');

      await page.locator('#frame-summary').fill('The owner’s revised scenario, saved first for everyone to review.');
      await page.locator('#save-frame').click();
      await expect(page.locator('#save-status')).toContainText('Keyframe revision saved');
      await other.locator('#save-frame').click();
      await expect(other.locator('#save-status')).toContainText('changed while you were editing');
      await expect(other.locator('#frame-summary')).toHaveValue('A collaborator’s alternative future, held as an unsaved draft.');
      await expect(other.locator('#reload-room')).toBeVisible();

      const state = await (await page.request.get(`/api/research/rooms/${roomId}`)).json();
      const frameId = new URL(page.url()).searchParams.get('frame');
      expect(state.frames.find(frame => frame.id === frameId).summary).toBe('The owner’s revised scenario, saved first for everyone to review.');
      await other.locator('#contribution-text').fill('Keep an accessible alternative in the comparison.');
      await other.locator('#post-contribution').click();
      await expect(other.locator('#activity-list')).toContainText('Keep an accessible alternative');
      await expect(other.locator('#frame-summary')).toHaveValue('A collaborator’s alternative future, held as an unsaved draft.');
      await expect(other.locator('#contributor-count')).toContainText('2 / 1,000');
    } finally { await otherContext.close(); }
  });

  test('mobile draft controls and future timeline fit the viewport', async ({page}, testInfo) => {
    await page.setViewportSize({width:390,height:844});
    await openDraft(page, {disconnected: true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#keyframes').scrollIntoViewIfNeeded();
    await page.locator('#frame-timeline [data-frame="first-pilots"]').click();
    await page.locator('#frame-title').fill('An accessible city that makes space for many different ways of living');
    await page.locator('#save-frame').click();
    await expect(page.locator('#save-status')).toContainText('Keyframe saved in this browser');
    await page.locator('#future-year').focus();
    await page.locator('#future-year').press('Home');
    await page.locator('#future-year').press('ArrowRight');
    await expect(page.locator('#year-output')).toHaveText('2026.1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#keyframes').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('research-keyframes-mobile.png'),animations:'disabled'});
  });
});
