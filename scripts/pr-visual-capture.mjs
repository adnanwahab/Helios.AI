// Capture the public Helios UI from the PR build. This runs with read-only PR permissions.
import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {chromium} from '@playwright/test';

const output = resolve('pr-visual-output');
await mkdir(output, {recursive: true});
// Backfill historical PRs by rendering their deployed preview. Ordinary
// pull_request runs still render an isolated, credential-free local build.
const remote = process.env.PR_PREVIEW_URL?.trim() || '';
if (remote) {
  const u = new URL(remote);
  if (u.protocol !== 'https:' || !/^deploy-preview-[0-9]+--heliosailol[.]netlify[.]app$/.test(u.hostname)) {
    throw new Error('Expected an HTTPS HeliosAI Netlify deploy-preview URL');
  }
}
const dbPath = remote ? null : await mkdtemp(join(tmpdir(), 'helios-pr-visual-'));
const port = 3137;
const base = remote || `http://127.0.0.1:${port}`;
const server = remote ? null : spawn(process.execPath, ['scripts/dev-server.js'], {
  env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port),
    SUPABASE_DB_URL: '', HELIOS_PGLITE_DIR: dbPath,
    RESEND_API_KEY: '', RESEND_WEBHOOK_SECRET: '', HELIOS_ADMIN_TOKEN: '',
    NOTION_TOKEN: '', NOTION_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server?.stdout.on('data', chunk => process.stdout.write(chunk));
server?.stderr.on('data', chunk => process.stderr.write(chunk));

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
  if (!remote) await waitForServer();
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({
    viewport: {width: 1440, height: 900}, deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  // Capture the research dashboard from its exact route and a measured baseline.
  const researchResponse=await page.goto(base+'/public/law-research.html?law=HGA-031',{waitUntil:'domcontentloaded'});
  if(!remote||(researchResponse?.ok()&&await page.locator('#law-rows').count())){
    await page.locator('#law-rows button[data-law]').first().waitFor({state:'visible',timeout:25000});
    if(await page.locator('#law-rows button[data-law]').count()!==100)throw Error('Expected 100 research proposals');
    await page.locator('#run-one').click();
    await page.locator('#run-status').filter({hasText:'Complete · 1 laws'}).waitFor({timeout:30000});
    await page.screenshot({path:join(output,'law-research-desktop.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'law-research-mobile.png'),animations:'disabled'});
    await page.setViewportSize({width:1440,height:900});
  }
  // The fixed synthetic report is part of the local static build. Capture its exact route.
  const labResponse = await page.goto(base + '/consensus-lab/', {waitUntil:'domcontentloaded'});
  if (!remote || (labResponse?.ok() && await page.locator('#consensus-app').count())) {
    if (!labResponse?.ok()) throw new Error('Consensus Lab route failed');
    await page.locator('#agent-grid button').first().waitFor({state:'visible', timeout:15000});
    if (await page.locator('#agent-grid button').count() !== 100) throw new Error('Expected 100 synthetic agent buttons');
    await page.screenshot({path:join(output,'consensus-lab-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'consensus-lab-mobile.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:1440,height:900});
  }
  // Capture the new workspace first so its artifacts survive unrelated legacy failures.
  const workspaceResponse=await page.goto(base+'/constitution?law=HGA-012&clause=implementation',{waitUntil:'domcontentloaded'});
  if(workspaceResponse?.ok()&&await page.locator('#explorer-title').count()){
    await page.locator('[data-section="HGA-012:implementation"]').waitFor({state:'visible'});
    await page.screenshot({path:join(output,'government-ide-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'government-ide-mobile.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:1440,height:900});
  }
  await page.goto(base + '/', {waitUntil: 'domcontentloaded', timeout: 45000});
  const loop = await page.locator('#journal-form').count() > 0;
  if (loop) await page.locator('#journal').waitFor({timeout: 20000});
  else {
    await page.locator('#tab-helios-ai').waitFor({timeout: 20000});
    await page.frameLocator('#view-helios-ai').locator('body').waitFor({timeout: 30000});
  }
  await page.waitForTimeout(3000);
  await page.screenshot({path: join(output, 'desktop.png'), animations: 'disabled'});

  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(700);
  await page.screenshot({path: join(output, 'mobile.png'), animations: 'disabled'});

  if (await page.locator('#world-map-feature').count()) {
    await page.setViewportSize({width: 1440, height: 1000});
    await page.goto(base + '/world-map?climate=70&cost=45&city=30&nature=60&coast=40', {waitUntil: 'domcontentloaded'});
    await page.locator('#world-hex-suitability[data-ready="true"]').waitFor({timeout: 20000});
    await page.screenshot({path: join(output, 'world-map-desktop.png'), fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: join(output, 'world-map-mobile.png'), fullPage: true, animations: 'disabled'});
    await page.goto(base + '/', {waitUntil: 'domcontentloaded'});
  }

  if(await page.locator('#pr-compose-open').count()){
    await page.goto(base+'/?compose=pr',{waitUntil:'domcontentloaded'});
    await page.locator('#pr-title').fill('Improve the childcare simulator');
    await page.locator('#pr-message').fill('Show the hourly rate and subsidy side by side with a short explanation of the estimated public cost.');
    await page.screenshot({path:join(output,'message-pr-mobile.png'),animations:'disabled'});
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#pr-compose-form button[type=submit]').click();
    await page.screenshot({path:join(output,'message-pr-review.png'),animations:'disabled'});
    await page.locator('#pr-destination').selectOption('github');
    await page.screenshot({path:join(output,'message-pr-github.png'),animations:'disabled'});
    await page.locator('#pr-compose-close').click();
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  }
  await page.setViewportSize({width: 1440, height: 900});
  // The homepage lab embeds the board behind a tab, so capture the standalone atlas unless it is already showing.
  if (!(await page.locator('#law-tiles').isVisible())) await page.goto(base + '/law-atlas.html',{waitUntil:'domcontentloaded'});
  if (await page.locator('#law-tiles').count()) {
    await page.locator('#law-tiles .law-tile').first().waitFor({state:'visible'});
    await page.locator('#laws-workbench').scrollIntoViewIfNeeded();
    await page.screenshot({path: join(output,'law-atlas.png'), animations:'disabled'});
    if(await page.locator('#cannabis-budget').isVisible()) {
      await page.locator('#cannabis-budget').screenshot({path:join(output,'cannabis-desktop.png'),animations:'disabled'});
      await page.setViewportSize({width:390,height:844});
      await page.locator('#cannabis-budget').screenshot({path:join(output,'cannabis-mobile.png'),animations:'disabled'});
      await page.setViewportSize({width:1440,height:900});
      await page.locator('[data-law="HGA-031"]').click();
    }
    if(await page.locator('#childcare-budget').isVisible()) {
      await page.locator('#childcare-budget').screenshot({path:join(output,'childcare-desktop.png'),animations:'disabled'});
      await page.setViewportSize({width:390,height:844});
      await page.locator('#childcare-budget').screenshot({path:join(output,'childcare-mobile.png'),animations:'disabled'});
      await page.setViewportSize({width:1440,height:900});
    }
    await page.locator('#law-search').fill('HGA-011');
    await page.locator('[data-law="HGA-011"]').click();
    await page.locator('#law-input-reach').fill('90');
    await page.screenshot({path: join(output,'law-simulator.png'), animations:'disabled'});
    await page.locator('#law-search').fill('');
  }
  if (loop) {
    await page.goto(base + '/', {waitUntil:'domcontentloaded'});
    // Never submit to a real deployment; these screenshots stop at the editable draft.
    await page.locator('#example').click();
    await page.locator('#journal-form button[type=submit]').click();
    await page.locator('#outcome').fill('Accessible, comfortable bus stops.');
    await page.locator('#approach').fill('Test shaded stops on a voluntary city pilot.');
    await page.screenshot({path: join(output, 'synthesis.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#synthesis-form button[type=submit]').click();
    await page.screenshot({path: join(output, 'proposal.png'), fullPage: true, animations: 'disabled'});
  }
  if (await page.locator('#mode-government').count()) {
    await page.locator('#mode-government').click();
    await page.screenshot({path: join(output, 'government-needs.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#gov-example').click();
    await page.locator('#gov-authority').fill('Municipal transport authority (example)');
    await page.locator('#gov-evidence').fill('Study heat exposure at stops, shelter costs and maintenance options.');
    await page.locator('#gov-dissent').fill('Consult riders and disability advocates; test equitable placement.');
    await page.screenshot({path: join(output, 'government-evaluate.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#gov-evaluate button[type=submit]').click();
    await page.locator('#gov-disposition').selectOption('Request more evidence');
    await page.locator('#gov-reason').fill('Compare accessible shelters and consult riders before recommending a pilot.');
    await page.locator('#gov-owner').fill('Transport planning team (example)');
    await page.screenshot({path: join(output, 'government-response.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#gov-respond button[type=submit]').click();
    await page.locator('#gov-date').fill('2027-02-01');
    await page.screenshot({path: join(output, 'government-measure.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#gov-measure button[type=submit]').click();
    await page.locator('#citizen-feedback').waitFor({state:'visible'});
    await page.screenshot({path: join(output, 'citizen-feedback.png'), fullPage: true, animations: 'disabled'});
  }
  if (await page.locator('#docs-open').count()) {
    await page.goto(base + '/', {waitUntil:'domcontentloaded'});
    await page.locator('#constitution-list .clause-card').first().waitFor({state:'visible'});
    await page.locator('#journal').fill('Our bus stops need accessible shade. Everyone should have a comfortable commute.');
    await page.locator('#review-match').click();
    // Only local practice controls; no connection or public writes.
    await page.locator('[data-clause-vote="support"]').click();
    await page.locator('#clause-comment').fill('Example: prioritize stops with the highest heat exposure.');
    await page.locator('#post-comment').click();
    await page.screenshot({path: join(output, 'constitution-workbench.png'), fullPage: true, animations: 'disabled'});
    await page.locator('#docs-open').click();
    await page.locator('#docs-drawer').waitFor({state:'visible'});
    await page.screenshot({path: join(output, 'docs-drawer.png'), animations: 'disabled'});
    if (await page.locator('#docs-viewer').count()) {
      await page.locator('#docs-links a[data-experience="Neighborhood Consensus"]').click();
      await page.frameLocator('#docs-frame').locator('body').waitFor({state:'visible'});
      await page.screenshot({path: join(output, 'docs-iframe.png'), animations: 'disabled'});
    }
    await page.locator('#docs-close').click();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path: join(output, 'constitution-mobile.png'), fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width:1440,height:900});
  }
  if (await page.locator('#mystery-link').count()) {
    await page.goto(base + '/public/mystery.html',{waitUntil:'domcontentloaded'});
    await page.locator('#scene-title').waitFor({state:'visible'});
    await page.screenshot({path:join(output,'mystery.png'),animations:'disabled'});
    for(const next of ['ledger','receipts','import','decision'])await page.locator('[data-next="'+next+'"]').click();
    await page.screenshot({path:join(output,'mystery-evidence.png'),animations:'disabled'});
    await page.goto(base + '/', {waitUntil:'domcontentloaded'});
  }
  const mailTab = page.locator('#tab-mail');
  if (await mailTab.count()) {
    // Never unlock the operator console or enter any credentials.
    await mailTab.click();
    await page.frameLocator('#view-mail').getByRole('heading', {name: 'Helios · Mail'}).waitFor({timeout: 20000});
    await page.screenshot({path: join(output, 'mail.png'), animations: 'disabled'});
  } else {
    console.log('Mail tab is absent in this historical PR; skipping that screenshot.');
  }
  await page.goto(base + '/grid', {waitUntil:'domcontentloaded'});
  if (await page.locator('#generate').count()) {
    if (await page.locator('#story-open').count()) {
      await page.locator('#story-open').click();
      await page.locator('#story-modal').waitFor({state:'visible'});
      await page.screenshot({path:join(output,'grid-story-desktop.png'),animations:'disabled'});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:join(output,'grid-story-mobile.png'),animations:'disabled'});
      await page.locator('#story-close').click();
      await page.setViewportSize({width:1440,height:900});
      await page.goto(base + '/grid?story=population', {waitUntil:'domcontentloaded'});
      if (await page.locator('#population-chamber').count()) {
        await page.locator('#population-chamber').waitFor({state:'visible'});
        await page.locator('#population-chamber').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(output,'grid-population-desktop.png'),animations:'disabled'});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#population-chamber').scrollIntoViewIfNeeded();
        await page.screenshot({path:join(output,'grid-population-mobile.png'),animations:'disabled'});
        await page.locator('#story-close').click();
        await page.setViewportSize({width:1440,height:900});
      }
    }
    await page.locator('#generate').click({timeout:15000});
    await page.locator('[data-preset="all"]').click();
    await page.locator('#inspect').click();
    await page.locator('[data-prompt]').first().click();
    await page.screenshot({path:join(output,'grid-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'grid-mobile.png'),fullPage:true,animations:'disabled'});
  }
  // Historical preview backfills may not have the new public page.
  await page.goto(base + '/', {waitUntil:'domcontentloaded'});
  if (!(await page.locator('[aria-labelledby="law-assembly-title"]').count())) await page.goto(base + '/law-atlas.html',{waitUntil:'domcontentloaded'});
  if (await page.locator('[aria-labelledby="law-assembly-title"]').count()) {
    await page.setViewportSize({width:1440,height:900});
    await page.locator('[aria-labelledby="law-assembly-title"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,'law-assembly-index.png'),animations:'disabled'});
    await page.goto(base + '/public/helios-law-assembly.html',{waitUntil:'domcontentloaded'});
    for (const id of ['homes','places','water']) {
      const scene=page.locator('#'+id);
      await scene.locator('.finish').click();
      await page.waitForFunction(id=>document.querySelector('#'+id+' .pct')?.textContent==='100% ASSEMBLED',id);
      await page.screenshot({path:join(output,'law-assembly-'+id+'.png'),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#water .replay').click();
    await page.waitForFunction(()=>document.querySelector('#water .pct')?.textContent==='00% ASSEMBLED');
    await page.screenshot({path:join(output,'law-assembly-mobile.png'),animations:'disabled'});
  }
  await page.goto(base + '/lunch', {waitUntil:'domcontentloaded'});
  if (await page.locator('#restaurants [data-place="yark"]').count()) {
    await page.locator('[data-place="yark"]').click();
    await page.locator('[data-place="phat"]').click();
    await page.locator('[data-place="yark"]').click();
    await page.locator('[data-place="yark"]').click();
    await page.setViewportSize({width:1440,height:900});
    await page.screenshot({path:join(output,'lunch-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'lunch-mobile.png'),fullPage:true,animations:'disabled'});
  }
  // Public futures fullscreen story, when present in this preview.
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  if(!(await page.locator('#law-futures-title').count())) await page.goto(base + '/law-atlas.html',{waitUntil:'domcontentloaded'});
  if(await page.locator('#law-futures-title').count()){
    await page.setViewportSize({width:1440,height:900});
    await page.goto(base+'/public/helios-futures.html',{waitUntil:'domcontentloaded'});
    await page.locator('.world').last().waitFor({state:'attached'});
    for(const [id,name] of [['city','city'],['decisions','branches'],['outcomes','street']]){
      if(id==='outcomes')await page.locator('.world').nth(36).click();
      await page.locator('nav a[href="#'+id+'"]').click();
      await page.waitForFunction(id=>{const stage=document.querySelector('#'+id+' .stage');if(!stage)return false;const r=stage.getBoundingClientRect();return r.top>=-2&&r.top<=58&&r.bottom>=innerHeight-5;},id);
      await page.screenshot({path:join(output,'futures-'+name+'.png'),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('nav a[href="#decisions"]').click();
    await page.screenshot({path:join(output,'futures-mobile.png'),animations:'disabled'});
  }
  // Capture the actual playable Rainbow Pensieve, not only the homepage card.
  await page.goto(base + '/', {waitUntil:'domcontentloaded'});
  if (await page.locator('#rainbow-pensieve-link').count()) {
    await page.setViewportSize({width:1440,height:900});
    await page.goto(base + '/public/rainbow-pensieve.html', {waitUntil:'domcontentloaded'});
    await page.locator('#garden-population').waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const status=document.getElementById('garden-view-status');
      return status && !status.textContent.startsWith('Loading');
    }, {timeout:30000}).catch(() => {});
    await page.locator('[data-spell="chorus"]').click();
    await page.locator('#cast').click();
    await page.locator('#garden-viewport, #garden-map').filter({visible:true}).first().scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,'rainbow-pensieve-desktop.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#scene-title').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,'rainbow-pensieve-mobile.png'),animations:'disabled'});
  }
  // Research evidence is retained in the capture artifact. The trusted publisher
  // on main has its own filename allowlist; a PR cannot expand that allowlist.
  await page.goto(base + '/', {waitUntil:'domcontentloaded'});
  if (await page.locator('#research-entry-title').count()) {
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base + '/research', {waitUntil:'domcontentloaded'});
    await page.locator('#agent-grid [data-task]').first().waitFor({state:'visible'});
    await page.waitForFunction(() => !document.getElementById('save-status')?.textContent.includes('Loading'));
    await page.screenshot({path:join(output,'research-desktop.png'),animations:'disabled'});
    await page.locator('#keyframes').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,'keyframe.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '/research', {waitUntil:'domcontentloaded'});
    await page.locator('#agent-grid [data-task]').first().waitFor({state:'visible'});
    await page.waitForFunction(() => !document.getElementById('save-status')?.textContent.includes('Loading'));
    await page.screenshot({path:join(output,'research-mobile.png'),animations:'disabled'});
    await page.locator('#keyframes').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,'keyframe-mobile.png'),animations:'disabled'});
    // The optional account panel is public UI. Never enter credentials or send
    // login email during visual capture; guests can dismiss it and keep working.
    if (await page.locator('[data-open-login]').count()) {
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(base + '/research?open_login=1#coordinator', {waitUntil:'domcontentloaded'});
      await page.locator('#helios-account-dialog').waitFor({state:'visible'});
      await page.waitForFunction(() => !document.getElementById('helios-account-status')?.textContent.includes('Checking'));
      await page.screenshot({path:join(output,'optional-login-desktop.png'),animations:'disabled'});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:join(output,'optional-login-mobile.png'),animations:'disabled'});
      await page.locator('#helios-account-guest').click();
    }
  }
  // The launch dashboard is a public, source-controlled evidence view. Older
  // preview backfills may not contain it; no data is submitted by this capture.
  await page.goto(base + '/launch', {waitUntil:'domcontentloaded'});
  if (await page.locator('[data-launch-progress]').count()) {
    await page.locator('[data-launch-task]').last().waitFor({state:'visible'});
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:join(output,'launch-dashboard-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'launch-dashboard-mobile.png'),fullPage:true,animations:'disabled'});
  }
  await page.goto(base + '/contribute', {waitUntil:'domcontentloaded'});
  if (await page.locator('#paths').count()) {
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:join(output,'contribute-desktop.png'),fullPage:true,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(output,'contribute-mobile.png'),fullPage:true,animations:'disabled'});
  }
  console.log('Captured desktop and mobile screenshots from ' + (remote ? 'Netlify deployment' : 'local PR build'));
} finally {
  await browser?.close().catch(() => {});
  if (server) {
    server.kill('SIGTERM');
    await sleep(1000);
  }
  if (dbPath) await rm(dbPath, {recursive: true, force: true}).catch(() => {});
}
