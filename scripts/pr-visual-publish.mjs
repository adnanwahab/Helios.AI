// Trusted post-processing of a PR screenshot artifact. Runs only from main.
// Never check out or execute PR code here: artifacts are untrusted binary data.
import {readFile, appendFile} from 'node:fs/promises';
import {join} from 'node:path';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const assetBranch = 'pr-visual-assets';
const marker = '<!-- helios-pr-visual-preview -->';
const run = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')).workflow_run;
if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !run) {
  throw new Error('Missing trusted GitHub workflow context');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function gh(path, method = 'GET', payload) {
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(payload === undefined ? {} : {'content-type': 'application/json'}),
    },
    ...(payload === undefined ? {} : {body: JSON.stringify(payload)}),
  });
  const raw = await response.text();
  const value = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const error = new Error(`GitHub ${method} ${path}: ${response.status} ${value?.message || ''}`);
    error.status = response.status;
    throw error;
  }
  return value;
}
async function optionalGh(path) {
  try {return await gh(path);} catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

let manifest;
try {manifest = JSON.parse(await readFile('pr-visual-output/manifest.json', 'utf8'));} catch {}
const runPrNumbers = (run.pull_requests || []).map(p => p.number);
const number = Number(manifest?.number ?? runPrNumbers[0]);
if (!Number.isSafeInteger(number) || number < 1) {
  throw new Error('Cannot identify this workflow run’s PR');
}
if (runPrNumbers.length && !runPrNumbers.includes(number)) {
  throw new Error('Artifact PR number does not match GitHub workflow-run metadata');
}
const pr = await gh(`/repos/${repo}/pulls/${number}`);
if (pr.state !== 'open' && !pr.merged) {
  console.log(`PR #${number} was closed without merging; keeping previous preview`);
  process.exit(0);
}
const sha = pr.head?.sha;
if (!/^[a-f0-9]{40}$/i.test(sha || '') ||
    manifest?.head_sha && manifest.head_sha !== sha ||
    (run.event === 'pull_request' && run.head_sha && run.head_sha !== sha) ||
    (run.event === 'pull_request' && run.head_repository?.full_name && run.head_repository.full_name !== pr.head.repo?.full_name)) {
  console.log(`Ignoring stale or mismatched screenshot run for PR #${number}`);
  process.exit(0);
}

function approvedNetlifyUrl(raw, previewNumber = number) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && u.hostname.startsWith(`deploy-preview-${previewNumber}--`) &&
        /^[a-z0-9-]+\.netlify\.app$/.test(u.hostname)) return u.origin + '/';
  } catch {}
  return null;
}
// For a merged stacked PR, Netlify may only deploy its still-open parent PR.
// Check that the parent head actually contains the merge before linking to it.
async function containingPreview() {
  if (!pr.merged || !pr.merge_commit_sha || pr.base?.ref === pr.base?.repo?.default_branch) return null;
  const owner = pr.base?.repo?.owner?.login;
  if (!owner || !pr.base?.ref) return null;
  const parents = await gh('/repos/' + repo + '/pulls?state=open&head=' + encodeURIComponent(owner + ':' + pr.base.ref));
  for (const parent of parents) {
    if (parent.head?.repo?.full_name !== repo || parent.head?.ref !== pr.base.ref) continue;
    if (parent.head.sha !== pr.merge_commit_sha) {
      const comparison = await optionalGh('/repos/' + repo + '/compare/' + pr.merge_commit_sha + '...' + parent.head.sha);
      if (!comparison || !['ahead','identical'].includes(comparison.status)) continue;
    }
    const result = await gh('/repos/' + repo + '/commits/' + parent.head.sha + '/status');
    const status = (result.statuses || []).find(s => /netlify\/.*\/deploy-preview/i.test(s.context || '') && s.state === 'success');
    const url = approvedNetlifyUrl(status?.target_url, parent.number);
    if (url) return {url, ready:true, parentNumber:parent.number};
  }
  return null;
}
async function deployment() {
  for (let attempt = 0; attempt < (run.conclusion === 'success' ? 12 : 1); attempt++) {
    const result = await gh(`/repos/${repo}/commits/${sha}/status`);
    const statuses = result.statuses || [];
    const deploymentStatus = statuses.find(s => /netlify\/.*\/deploy-preview/i.test(s.context || ''));
    const url = approvedNetlifyUrl(deploymentStatus?.target_url);
    if (url && deploymentStatus.state === 'success') return {url, ready: true};
    const parentPreview = await containingPreview();
    if (parentPreview) return parentPreview;
    if (attempt < 11 && run.conclusion === 'success') await sleep(10000);
  }
  // The repository's configured Netlify site is heliosailol. This URL is
  // explicitly presented as expected/pending until Netlify confirms a deployment.
  return {url: `https://deploy-preview-${number}--heliosailol.netlify.app/`, ready: false};
}
const live = await deployment();

const images = [];
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
for (const name of ['desktop.png', 'mobile.png', 'synthesis.png', 'proposal.png', 'government-needs.png', 'government-evaluate.png', 'government-response.png', 'government-measure.png', 'citizen-feedback.png', 'constitution-workbench.png', 'constitution-mobile.png', 'docs-drawer.png', 'docs-iframe.png', 'mystery.png', 'mystery-evidence.png', 'law-atlas.png', 'law-simulator.png', 'mail.png', 'lunch-desktop.png', 'lunch-mobile.png', 'rainbow-pensieve-desktop.png', 'rainbow-pensieve-mobile.png', 'government-ide-desktop.png', 'government-ide-mobile.png']) {
  try {
    const data = await readFile(join('pr-visual-output', name));
    if (!data.subarray(0, 8).equals(pngSignature) || data.length > 10000000) {
      throw new Error(`Invalid PNG artifact: ${name}`);
    }
    images.push({name, data});
  } catch (error) {
    console.log(`Screenshot unavailable: ${name} (${error.message})`);
  }
}

async function publishAssets() {
  const blobs = [];
  for (const file of images) {
    const blob = await gh(`/repos/${repo}/git/blobs`, 'POST', {
      content: file.data.toString('base64'), encoding: 'base64',
    });
    blobs.push({path: `pr-${number}/${sha}/${file.name}`, mode: '100644', type: 'blob', sha: blob.sha});
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const refPath = `/repos/${repo}/git/ref/heads/${assetBranch}`;
    const old = await optionalGh(refPath);
    const oldSha = old?.object?.sha;
    const oldCommit = oldSha ? await gh(`/repos/${repo}/git/commits/${oldSha}`) : null;
    const tree = await gh(`/repos/${repo}/git/trees`, 'POST', {
      ...(oldCommit ? {base_tree: oldCommit.tree.sha} : {}),
      tree: blobs,
    });
    const commit = await gh(`/repos/${repo}/git/commits`, 'POST', {
      message: `Update PR #${number} screenshots at ${sha.slice(0,12)}`,
      tree: tree.sha, parents: oldSha ? [oldSha] : [],
    });
    try {
      if (oldSha) {
        await gh(`/repos/${repo}/git/refs/heads/${assetBranch}`, 'PATCH', {
          sha: commit.sha, force: false,
        });
      } else {
        await gh(`/repos/${repo}/git/refs`, 'POST', {
          ref: `refs/heads/${assetBranch}`, sha: commit.sha,
        });
      }
      return;
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 5) throw error;
      await sleep(600);
    }
  }
}

let hosted = false;
let assetError = '';
if (images.length) {
  try {
    await publishAssets();
    hosted = true;
  } catch (error) {
    assetError = error.message;
    console.error('Could not publish preview images:', error);
  }
}
const baseImageUrl = `https://raw.githubusercontent.com/${repo}/${assetBranch}/pr-${number}/${sha}`;
const imageUrl = name => `${baseImageUrl}/${name}?v=${sha.slice(0,12)}`;
const sourceRun = `https://github.com/${repo}/actions/runs/${run.id}`;
const lines = [
  marker,
  '### HeliosAI visual review',
  '',
  `**Deploy preview:** [Open the PR site](${live.url})${live.parentNumber ? ' (containing parent PR #' + live.parentNumber + ')' : live.ready ? '' : ' (expected URL; Netlify has not confirmed it ready yet)'}`,
  '',
];
if (hosted && images.some(x => x.name === 'desktop.png')) {
  lines.push(`![Desktop screenshot of HeliosAI PR #${number}](${imageUrl('desktop.png')})`, '');
}
if (hosted && images.some(x => x.name === 'mobile.png')) {
  lines.push('<details><summary>Mobile screenshot</summary>', '',
    `<img alt="Mobile screenshot of HeliosAI PR #${number}" width="390" src="${imageUrl('mobile.png')}">`, '',
    '</details>', '');
}
for (const [name, label] of [['synthesis.png', 'Citizen 2 · Synthesize'], ['proposal.png', 'Citizen 3 · Decide / proposed law'], ['government-needs.png', 'Government 1 · Understand'], ['government-evaluate.png', 'Government 2 · Evaluate'], ['government-response.png', 'Government 3 · Respond'], ['government-measure.png', 'Government 4 · Measure'], ['citizen-feedback.png', 'Citizen feedback preview'], ['constitution-workbench.png', 'Three-lane constitution workbench'], ['constitution-mobile.png', 'Constitution workbench on mobile'], ['docs-drawer.png', 'Docs & experiments tabs'], ['docs-iframe.png', 'Docs archive with selected experience embedded'], ['mystery.png', 'The Missing Amendment · mystery game'], ['mystery-evidence.png', 'Recovered evidence and fictional review'], ['law-atlas.png', 'Front-page 100-law atlas'], ['law-simulator.png', 'Interactive law simulator'], ['lunch-desktop.png', 'Family lunch vote · desktop'], ['lunch-mobile.png', 'Family lunch vote · mobile'], ['rainbow-pensieve-desktop.png', 'Rainbow Pensieve · garden game'], ['rainbow-pensieve-mobile.png', 'Rainbow Pensieve · mobile'], ['government-ide-desktop.png', 'Government IDE · linked workspace'], ['government-ide-mobile.png', 'Government IDE · mobile']]) {
  if (hosted && images.some(x => x.name === name)) {
    lines.push('<details><summary>' + label + '</summary>', '',
      `![${label}](${imageUrl(name)})`, '', '</details>', '');
  }
}
if (hosted && images.some(x => x.name === 'mail.png')) {
  lines.push('<details><summary>Mail tab (locked operator view)</summary>', '',
    `![Mail tab screenshot](${imageUrl('mail.png')})`, '',
    '</details>', '');
}
if (!hosted) {
  lines.push(`**Screenshot:** Not published (${run.conclusion === 'success' ? 'asset hosting failed' : 'capture failed'}). [View capture run](${sourceRun}).`, '');
}
lines.push(
  `Screenshot source: ${run.event === 'workflow_dispatch' ? 'public Netlify deploy preview' : 'local, credential-free PR build'} at \`${sha.slice(0,12)}\`.`,
  `[Capture logs and downloadable artifacts](${sourceRun})`,
  '',
  '_Automatically refreshed after new commits. Preview screenshots contain only publicly visible UI; private inbox content and credentials are never captured._',
);
const body = lines.join('\n');

let previous = null;
for (let page = 1; page <= 10; page++) {
  const comments = await gh(`/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
  previous = comments.find(x => x.body?.includes(marker));
  if (previous || comments.length < 100) break;
}
if (previous) {
  await gh(`/repos/${repo}/issues/comments/${previous.id}`, 'PATCH', {body});
  console.log(`Updated preview comment for PR #${number}`);
} else {
  await gh(`/repos/${repo}/issues/${number}/comments`, 'POST', {body});
  console.log(`Added preview comment for PR #${number}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### PR #${number} visual preview\n\n${body}\n`);
}
if (assetError) throw new Error('Screenshot hosting failed: ' + assetError);
