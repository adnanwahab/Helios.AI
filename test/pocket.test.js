import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('HappyBearLandia Pocket is a homepage tab with routes and builds', () => {
  const index = source('index.html');
  expect(index).toContain('id="tab-pocket"');
  expect(index).toContain('src="/embed/pocket"');
  expect(index).toContain("tabs.pocket.addEventListener");
  expect(source('netlify.toml')).toMatch(/from = "\/pocket"\s+to = "\/happybearlandia_pocket.html"/);
  expect(source('netlify.toml')).toMatch(/from = "\/embed\/pocket"\s+to = "\/happybearlandia_pocket.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'happybearlandia_pocket.html'");
  expect(source('scripts/build-pages.mjs')).toContain("'happybearlandia_pocket.html'");
});

test('Pocket ships a registry snapshot pointing at HappyBearLandia', () => {
  const page = source('happybearlandia_pocket.html');
  const raw = page.match(/<script type="application\/json" id="fallback-registry">([\s\S]*?)<\/script>/)[1];
  const snap = JSON.parse(raw);
  expect(snap.base).toBe('https://happybearlandia.fly.dev/');
  expect(snap.experiences.length).toBeGreaterThan(10);
  for (const x of snap.experiences) expect(x.route.startsWith('/')).toBe(true);
});
