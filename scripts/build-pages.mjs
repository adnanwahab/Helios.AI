// Build a fork-safe, static GitHub Pages preview without exposing the Bun backend.
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPlanDocument } from '../src/notion.js';
import seedCatalog from '../data/catalog.json' with { type: 'json' };

const root = process.cwd();
const out = join(root, 'dist-pages');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const demos = [
  'helios_ai_landing_page.html',
  'helios_mail.html',
  'helios_hippie_landing.html',
  'helios_fork.html',
  'world_plan_simulator.html',
  'helios_100_frontend_demo.html',
  'helios-unified.html',
  'communal_science_lab_webgpu (1).html',
  'health_wealth_of_nations.html',
  'heliosai-particle-interface.html'
];
for (const name of demos) {
  await copyFile(join(root, name), join(out, name));
}
await cp(join(root, 'public'), join(out, 'public'), { recursive: true });

// The Notion screen reads /api/notion/preview on the live app; Pages gets a build-time snapshot.
const notionPage = (await readFile(join(root, 'helios_notion_preview.html'), 'utf8')).replaceAll('href="/public/', 'href="./public/');
await writeFile(join(out, 'helios_notion_preview.html'), notionPage);
await writeFile(join(out, 'notion-preview.json'), JSON.stringify(buildPlanDocument(seedCatalog)));

let index = await readFile(join(root, 'index.html'), 'utf8');
function replaceRequired(from, to) {
  if (!index.includes(from)) throw new Error('Expected entry-page route missing: ' + from);
  index = index.replaceAll(from, to);
}

// Pages uses /owner/repository/, not a server rooted at /. Relative paths
// work in the original repo and in forks regardless of repository name.
index = index.replaceAll('href="/public/', 'href="./public/');
index = index.replaceAll('src="/public/', 'src="./public/');
replaceRequired('src="/embed/helios-ai"', 'src="./helios_ai_landing_page.html"');
replaceRequired('src="/embed/hippie"', 'src="./helios_hippie_landing.html"');
replaceRequired('src="/embed/fork"', 'src="./helios_fork.html"');
replaceRequired('src="/embed/notion"', 'src="./helios_notion_preview.html"');
replaceRequired('src="/embed/world-plan"', 'src="./world_plan_simulator.html"');
replaceRequired('src="/embed/goals"', 'src="./helios_100_frontend_demo.html"');
replaceRequired('src="/embed/unified"', 'src="./helios-unified.html"');
replaceRequired('src="/embed/dynamicland"', 'src="./communal_science_lab_webgpu%20(1).html"');
replaceRequired('src="/embed/mail"', 'src="./helios_mail.html"');
replaceRequired('src="/proxy/ycr/"', 'src="./pages-ycr.html"');

// Email signup and shared proposal writes need the Bun backend. Do not
// pretend the static mirror can submit them or quietly send fork visitors'
// information to the original project's backend.
const signup = /<iframe\s+class="signup"[\s\S]*?<\/iframe>/i;
if (!signup.test(index)) throw new Error('Could not find signup iframe');
index = index.replace(signup, '<a class="pages-live-link" href="https://helioshtml.com/" target="_blank" rel="noopener noreferrer" title="Signup and persistent proposals require the live backend">Static preview · Open live app ↗</a>');
index = index.replace('</style>', [
  '  .pages-live-link { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:999px; color:var(--active); text-decoration:none; white-space:nowrap; font-size:12px; font-weight:700; padding:10px 14px; }',
  '  .pages-live-link:focus-visible { outline:2px solid var(--active); outline-offset:3px; }',
  '  @media (max-width:900px) { .pages-live-link { width:100%; } }',
  '</style>'
].join('\n'));
index = index.replace('Helios.AI · Merged index', 'Helios.AI · Static preview');

if (index.includes('src="/embed/') || index.includes('src="/proxy/') || index.includes('src="/signup')) {
  throw new Error('Server-only iframe route remains in Pages index');
}
await writeFile(join(out, 'index.html'), index);

// The server normally fetches and rewrites this third-party page. GitHub
// Pages cannot proxy it and the remote site may disallow iframe embedding.
const ycr = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>YC Research · External link</title>',
  '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#e7eef9;font:16px system-ui,sans-serif}main{max-width:520px;padding:32px;text-align:center}a{color:#7ce4cf;font-weight:700}</style>',
  '</head><body><main><h1>YC Research</h1>',
  '<p>This page is proxied by the live Bun app and cannot be embedded in the static Pages preview.</p>',
  '<p><a href="https://www.openresearchlab.org/" target="_blank" rel="noopener noreferrer">Open YC Research in a new tab ↗</a></p>',
  '</main></body></html>'
].join('\n');
await writeFile(join(out, 'pages-ycr.html'), ycr);

// Manifest icon and navigation URLs must also be relative to a fork's base.
const manifestPath = join(out, 'public', 'site.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const icon of manifest.icons || []) {
  if (typeof icon.src === 'string') icon.src = icon.src.replace(/^\/public\//, './');
}
manifest.start_url = '../';
manifest.scope = '../';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(out, '.nojekyll'), '');

console.log('Built GitHub Pages static preview in dist-pages/');
