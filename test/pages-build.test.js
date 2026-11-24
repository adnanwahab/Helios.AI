import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

// build-pages.mjs stops when a server-only iframe route is left in the static
// index. Catch a new home tab without a Pages rewrite here, before it reaches main.
test('every home-tab embed is rewritten for the static GitHub Pages preview', () => {
  const embeds = [...source('index.html').matchAll(/src="(\/embed\/[^"]+)"/g)].map(m => m[1]);
  expect(embeds.length).toBeGreaterThan(5);
  const pages = source('scripts/build-pages.mjs');
  for (const route of embeds) expect(pages).toContain(`replaceRequired('src="${route}"'`);
});
