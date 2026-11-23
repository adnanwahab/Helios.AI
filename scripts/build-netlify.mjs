// Copies the static pages into dist/ for Netlify. Only these files are published;
// the source tree, data, scripts and .git stay out of the site.
import {copyFile, cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildPlanDocument} from '../src/notion.js';
import seedCatalog from '../data/catalog.json' with {type: 'json'};

const root = process.cwd();
const out = join(root, 'dist');
const pages = [
  'index.html',
  'helios_ai_landing_page.html',
  'helios_hippie_landing.html',
  'world_plan_simulator.html',
  'helios_100_frontend_demo.html',
  'helios-unified.html',
  'helios_notion_preview.html',
  'health_wealth_of_nations.html',
  'heliosai-particle-interface.html',
  'communal_science_lab_webgpu (1).html',
  // Crawlers look for these at the site root.
  'robots.txt',
  'sitemap.xml',
];

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
for (const name of pages) await copyFile(join(root, name), join(out, name));
await cp(join(root, 'public'), join(out, 'public'), {recursive: true});
// Fallback for the Notion screen if the API is unreachable.
await writeFile(join(out, 'notion-preview.json'), JSON.stringify(buildPlanDocument(seedCatalog)));
console.log(`Built Netlify static site in dist/ (${pages.length} files plus public assets).`);
