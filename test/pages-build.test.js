import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

// build-pages.mjs stops when a server-only iframe route is left in the static
// index. Catch a new archived tab without a Pages rewrite here, before it reaches main.
test('every archived-tab embed is rewritten for the static GitHub Pages preview', () => {
  const embeds = [...source('docs/legacy-home.html').matchAll(/src="(\/embed\/[^"]+)"/g)].map(m => m[1]);
  expect(embeds.length).toBeGreaterThan(5);
  const pages = source('scripts/build-pages.mjs');
  for (const route of embeds) expect(pages).toContain(`replaceRequired('src="${route}"'`);
});

// actions/deploy-pages looks the artifact up once. Run in the same job as the upload,
// it sometimes asked before GitHub listed the new artifact and failed the deploy.
test('Pages deploys in its own job, after the job that uploads the artifact', () => {
  const {jobs} = Bun.YAML.parse(source('.github/workflows/pages.yml'));
  const uses = job => (job.steps || []).map(step => step.uses || '');
  const find = action => Object.entries(jobs).find(([, job]) => uses(job).some(u => u.startsWith(action)));
  const upload = find('actions/upload-pages-artifact@');
  const deploy = find('actions/deploy-pages@');
  expect(upload).toBeDefined();
  expect(deploy).toBeDefined();
  expect(deploy[0]).not.toBe(upload[0]);
  expect([deploy[1].needs].flat()).toContain(upload[0]);
  expect(deploy[1].environment?.name).toBe('github-pages');
});
