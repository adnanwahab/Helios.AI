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
  'law-atlas.html',
  'welcome.html',
  'helios_mail.html',
  'helios_ai_landing_page.html',
  'helios_hippie_landing.html',
  'helios_fork.html',
  'helios_braindance.html',
  'world_plan_simulator.html',
  'vote_radar.html',
  'happybearlandia_pocket.html',
  'eight_billion_map.html',
  'three_editor_merge.html',
  'grid.html',
  'lunch.html',
  'helios_100_frontend_demo.html',
  'heliosai_acts_orbit.html',
  'support_every_country.html',
  'neighborhood_consensus.html',
  'long_coil.html',
  'helios-unified.html',
  'helios_notion_preview.html',
  'health_wealth_of_nations.html',
  'heliosai-particle-interface.html',
  'sand_castle.html',
  'sunshine_breakfast.html',
  'communal_science_lab_webgpu (1).html',
  'rainbow_brain.html',
  'morphlab.html',
  'morphlab-offline-demo.html',
  // Crawlers look for these at the site root.
  'robots.txt',
  'sitemap.xml',
];

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
for (const name of pages) await copyFile(join(root, name), join(out, name));
await copyFile(join(root, 'docs', 'legacy-home.html'), join(out, 'experiments.html'));
await cp(join(root, 'public'), join(out, 'public'), {recursive: true});
// The public editorial catalog is bundled for offline simulations; no database rows or secrets.
await writeFile(join(out, 'public', 'law-catalog.json'), JSON.stringify(seedCatalog));
// Fallback for the Notion screen if the API is unreachable.
await writeFile(join(out, 'notion-preview.json'), JSON.stringify(buildPlanDocument(seedCatalog)));
await writeFile(join(out, 'grid-catalog.json'), JSON.stringify({goals: seedCatalog.goals}));
console.log(`Built Netlify static site in dist/ (${pages.length} files plus public assets).`);
