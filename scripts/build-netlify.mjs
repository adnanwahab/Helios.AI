// Copies the static pages into dist/ for Netlify. Only these files are published;
// the source tree, data, scripts and .git stay out of the site.
import {copyFile, cp, mkdir, rm} from 'node:fs/promises';
import {join} from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
const pages = [
  'index.html',
  'helios_ai_landing_page.html',
  'helios_hippie_landing.html',
  'helios_fork.html',
  'helios_100_frontend_demo.html',
  'helios-unified.html',
  'health_wealth_of_nations.html',
  'heliosai-particle-interface.html',
  'communal_science_lab_webgpu (1).html',
];

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
for (const name of pages) await copyFile(join(root, name), join(out, name));
await cp(join(root, 'public'), join(out, 'public'), {recursive: true});
console.log(`Built Netlify static site in dist/ (${pages.length} pages plus public assets).`);
