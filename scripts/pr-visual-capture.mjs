// Capture the public Helios UI from the PR build. This runs with read-only PR permissions.
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from '@playwright/test';

const output = resolve('pr-visual-output');
await mkdir(output, {recursive: true});
const dbPath = await mkdtemp(join(tmpdir(), 'helios-pr-visual-'));
const port = 3137;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/dev-server.js'], {
  env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port),
    SUPABASE_DB_URL: '', HELIOS_PGLITE_DIR: dbPath,
    // No live credentials should ever be used when taking PR screenshots.
    RESEND_API_KEY: '', RESEND_WEBHOOK_SECRET: '', HELIOS_ADMIN_TOKEN: '',
    NOTION_TOKEN: '', NOTION_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => process.stdout.write(chunk));
server.stderr.on('data', chunk => process.stderr.write(chunk));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForServer() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Dev server exited: ${server.exitCode}`);
    try {
      const res = await fetch(base + '/api/health', {signal: AbortSignal.timeout(3000)});
      if (res.ok) return;
    } catch {}
    await sleep(750);
  }
  throw new Error('Local preview server did not become ready');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({
    viewport: {width: 1440, height: 900}, deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await page.goto(base + '/', {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.locator('#tab-helios-ai').waitFor({timeout: 20000});
  await page.frameLocator('#view-helios-ai').locator('body').waitFor({timeout: 30000});
  await page.waitForTimeout(3000);
  await page.screenshot({path: join(output, 'desktop.png'), animations: 'disabled'});

  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(700);
  await page.screenshot({path: join(output, 'mobile.png'), animations: 'disabled'});

  // The mail console is deliberately unauthenticated in screenshot mode.
  await page.setViewportSize({width: 1440, height: 900});
  await page.locator('#tab-mail').click();
  await page.frameLocator('#view-mail').getByRole('heading', {name: 'Helios · Mail'}).waitFor({timeout: 20000});
  await page.screenshot({path: join(output, 'mail.png'), animations: 'disabled'});
  console.log('Captured homepage desktop, homepage mobile, and private mail UI (locked).');
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
  await sleep(1000);
  await rm(dbPath, {recursive: true, force: true}).catch(() => {});
}
