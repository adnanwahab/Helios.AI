import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('Neighborhood Consensus is a archived dashboard tab with routes, builds and no public sitemap entry', () => {
  const index = source('docs/legacy-home.html');
  expect(index).toContain('id="tab-consensus"');
  expect(index).toContain('aria-controls="view-consensus"');
  expect(index).toContain('src="/embed/consensus"');
  expect(index).toContain("tabs.consensus.addEventListener");
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/consensus"\s+to = "\/neighborhood_consensus.html"/);
  expect(toml).toMatch(/from = "\/embed\/consensus"\s+to = "\/neighborhood_consensus.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'neighborhood_consensus.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain("'neighborhood_consensus.html'");
  expect(pages).toContain(`replaceRequired('src="/embed/consensus"', 'src="./neighborhood_consensus.html"')`);
  expect(source('sitemap.xml')).not.toContain('<loc>https://helioshtml.com/consensus</loc>');
  expect(source('index.html')).not.toContain('id="tab-consensus"');
});

test('the page is self-contained, labels its sample data and its script parses', () => {
  const page = source('neighborhood_consensus.html');
  // Works under a GitHub Pages subpath and inside /embed/: no root-relative URLs.
  expect(page).not.toMatch(/(?:src|href)="\/(?!\/)/);
  // Only Google Fonts loads from outside; ballots are never fetched or sent.
  const hosts = new Set([...page.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]));
  expect([...hosts].sort()).toEqual(['fonts.googleapis.com', 'fonts.gstatic.com']);
  expect(page).not.toMatch(/\bfetch\(|XMLHttpRequest|localStorage|sendBeacon/);
  for (const text of ['sample ballots for a made-up neighborhood, not real votes', 'Sample data for a made-up neighborhood', 'nothing is sent or saved'])
    expect(page).toContain(text);
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  expect(scripts).toHaveLength(1);
  expect(() => new Function(scripts[0])).not.toThrow();
});
