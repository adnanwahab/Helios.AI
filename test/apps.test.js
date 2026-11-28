import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('the apps page is routed at /apps and /apps/ for Netlify and the Fly server', () => {
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/apps"\s+to = "\/public\/apps.html"/);
  expect(toml).toMatch(/from = "\/apps\/"\s+to = "\/public\/apps.html"/);
});

test('the apps page frames the four sites, and Civic Synthesis through the one route it lets others frame', () => {
  const page = source('public/apps.html');
  for (const url of [
    'https://happybearlandia.fly.dev/',
    'https://civic-synthesis.fly.dev/embed',
    'https://digital-pensieve.fly.dev/',
    'https://helios-ai-laws.fly.dev/',
  ]) expect(page).toContain(`url: '${url}'`);
  // Every other Civic Synthesis route sends frame-ancestors 'self', so Open goes to the full site instead.
  expect(page).toContain("open: 'https://civic-synthesis.fly.dev/'");
  // No root-relative URLs, so the GitHub Pages copy works under a subpath.
  expect(page).not.toMatch(/(?:href|src)="\/(?!\/)/);
});
