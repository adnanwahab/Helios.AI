import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('vote radar labels its votes as simulated sample data, not an official ballot', () => {
  const page = source('vote_radar.html');
  expect(page).toContain('Simulated sample data');
  expect(page).toContain('not an official ballot');
  expect(page).toContain('Sample data, not an official ballot.');
});

test('vote radar is routed, linked from the archived dashboard and included in both builds', () => {
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/radar"\s+to = "\/vote_radar.html"/);
  expect(toml).toMatch(/from = "\/embed\/radar"\s+to = "\/vote_radar.html"/);
  const index = source('docs/legacy-home.html');
  expect(index).toContain('id="tab-radar"');
  expect(index).toContain('src="/embed/radar"');
  expect(source('scripts/build-netlify.mjs')).toContain("'vote_radar.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain("'vote_radar.html'");
  expect(pages).toContain('src="./vote_radar.html"');
});

test('vote radar is self-contained: no backend calls and no root-relative assets', () => {
  const page = source('vote_radar.html');
  expect(page).not.toMatch(/fetch\(|XMLHttpRequest|\/api\//);
  expect(page).not.toMatch(/["(]\/public\//);
});
