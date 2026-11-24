import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('welcome is optional, clearly labeled and discoverable on archived dashboard', () => {
  const index = source('docs/legacy-home.html');
  const guide = source('welcome.html');
  expect(index).toContain('href="/welcome"');
  expect(index).toContain('New here? Start here');
  expect(index).not.toContain('window.location.href="/welcome"');
  expect(guide).toContain('not a government election');
  expect(guide).toContain('Support / Unsure / Oppose');
  expect(guide).toContain('not transmitted, tallied, or public votes');
  expect(guide).toContain('public and saved to the shared library for review');
  expect(guide).toContain('no requirement to sign up');
  expect(guide).toContain('href="/laws"');
  expect(guide).toContain('href="https://civic-synthesis.fly.dev/votes"');
});

test('welcome is included in both Fly and fork-safe static builds', () => {
  expect(source('scripts/build-netlify.mjs')).toContain("'welcome.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain('welcome.html');
  expect(pages).toContain('href="./helios_100_frontend_demo.html"');
  expect(pages).toContain('href="./index.html"');
  expect(source('netlify.toml')).toMatch(/from = "\/welcome"\s+to = "\/welcome.html"/);
});

test('proposal UI does not describe demo positions as official votes', () => {
  const library = source('helios_100_frontend_demo.html');
  expect(library).toContain('No official votes are collected here.');
  expect(library).toContain('do not contact any server or count as votes');
  expect(library).toContain('Civic Synthesis advisory discussion');
});
