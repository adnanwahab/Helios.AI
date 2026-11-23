import {test, expect} from '@playwright/test';

// Avoid all real outbound messages and remote model files in browser CI.
// Production WebGPU inference is a separate compatibility/release test.
async function setUpComposer(page) {
  await page.addInitScript(() => {
    window.__publishCalls = [];
    window.__confirmCalls = [];
    window.__allowPublish = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      if (String(input).includes('/api/publish_draft')) {
        window.__publishCalls.push({url: String(input), method: options?.method, body: options?.body});
        return new Response(JSON.stringify({ok: true, status: 'pending', entryId: 'e2e-test-entry'}), {
          status: 200, headers: {'content-type': 'application/json'},
        });
      }
      return originalFetch(input, options);
    };
    window.confirm = message => {
      window.__confirmCalls.push(message);
      return window.__allowPublish;
    };
  });
  await page.goto('/heliosai-particle-interface.html');
  await expect(page.locator('#message')).toBeVisible();
}

test('the default-off choice never imports or downloads Llama Guard, even when publishing', async ({page}) => {
  const modelRequests = [];
  page.on('request', req => {
    if (/local-llama-guard|onnx-community|transformers@|\.onnx/i.test(req.url())) modelRequests.push(req.url());
  });
  await setUpComposer(page);
  const checkbox = page.locator('#local-guard-opt-in');
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator('#local-guard-help')).toContainText('Off by default');
  await page.locator('#message').fill('Make public buses more accessible.');
  await page.locator('#send').click();
  await expect(page.locator('#status')).toContainText('Civic Synthesis accepted');
  const result = await page.evaluate(() => ({
    confirmations: window.__confirmCalls,
    posts: window.__publishCalls,
  }));
  expect(result.confirmations).toHaveLength(1);
  expect(result.confirmations[0]).toContain('Local AI screening was skipped');
  expect(result.posts).toHaveLength(1);
  expect(result.posts[0].method).toBe('POST');
  expect(modelRequests).toEqual([]);
});

test('checking opt-in alone downloads nothing; Send with an unsafe verdict blocks publishing', async ({page}) => {
  let guardImports = 0;
  await page.route('**/public/local-llama-guard.js', async route => {
    guardImports++;
    await route.fulfill({
      status: 200, contentType: 'text/javascript',
      body: "export async function checkLocalMessage() { return { status: 'unsafe' }; }",
    });
  });
  await setUpComposer(page);
  const choice = page.locator('#local-guard-opt-in');
  await choice.check();
  await page.waitForTimeout(180);
  expect(guardImports).toBe(0);
  await page.locator('#message').fill('Test draft that the mocked guard will block.');
  await page.locator('#send').click();
  await expect(page.locator('#moderation-dialog')).toBeVisible();
  await expect(page.locator('#moderation-title')).toHaveText("sorry, you can't send that.");
  expect(guardImports).toBe(1);
  expect(await page.evaluate(() => window.__publishCalls)).toHaveLength(0);
  await page.locator('#moderation-close').click();
  await expect(page.locator('#message')).toHaveValue('Test draft that the mocked guard will block.');
  await expect(page.locator('#message')).toBeFocused();
  await expect(choice).toBeChecked();
});

test('opted-in safe verdict still requires separate publication confirmation', async ({page}) => {
  let guardImports = 0;
  await page.route('**/public/local-llama-guard.js', async route => {
    guardImports++;
    await route.fulfill({
      status: 200, contentType: 'text/javascript',
      body: "export async function checkLocalMessage() { return { status: 'safe' }; }",
    });
  });
  await setUpComposer(page);
  await page.locator('#local-guard-opt-in').check();
  await page.evaluate(() => { window.__allowPublish = false; });
  await page.locator('#message').fill('Create more public parks.');
  await page.locator('#send').click();
  await expect(page.locator('#send')).toBeEnabled();
  expect(guardImports).toBe(1);
  expect(await page.evaluate(() => window.__publishCalls)).toHaveLength(0);
  const prompts = await page.evaluate(() => window.__confirmCalls);
  expect(prompts[0]).toContain('Local AI screening completed');
  await page.evaluate(() => { window.__allowPublish = true; });
  await page.locator('#send').click();
  await expect(page.locator('#status')).toContainText('Civic Synthesis accepted');
  expect(await page.evaluate(() => window.__publishCalls)).toHaveLength(1);
});

test('an unavailable opt-in model shows a distinct error modal and does not publish', async ({page}) => {
  await page.route('**/public/local-llama-guard.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: "export async function checkLocalMessage() { return { status: 'unavailable' }; }",
  }));
  await setUpComposer(page);
  await page.locator('#local-guard-opt-in').check();
  await page.locator('#message').fill('A draft to review.');
  await page.locator('#send').click();
  await expect(page.locator('#moderation-dialog')).toBeVisible();
  await expect(page.locator('#moderation-title')).toHaveText("We couldn't check that message");
  expect(await page.evaluate(() => window.__publishCalls)).toHaveLength(0);
  await page.locator('#moderation-close').click();
  await expect(page.locator('#message')).toHaveValue('A draft to review.');
});
