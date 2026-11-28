import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('three-editor merge is routed, built for Fly and Pages, and has a home tab', () => {
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/merge"\s+to = "\/three_editor_merge.html"/);
  expect(toml).toMatch(/from = "\/embed\/merge"\s+to = "\/three_editor_merge.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'three_editor_merge.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain("'three_editor_merge.html'");
  expect(pages).toContain(`replaceRequired('src="/embed/merge"', 'src="./three_editor_merge.html"')`);
  const index = source('docs/legacy-home.html');
  expect(index).toContain('aria-controls="view-merge">Three-Editor Merge</button>');
  expect(index).toContain('src="/embed/merge"');
  expect(index).toContain("tabs.merge.addEventListener('click', () => activate('merge'));");
});

test('three-editor merge says its journals are samples and keeps its S3 layout in architecture.md', () => {
  const page = source('three_editor_merge.html');
  expect(page).toContain('8,000,000,000 sample journals generated from their numbers');
  // The S3 write-up lives in architecture.md, not in a panel on the page.
  expect(page).not.toContain('id="drawer"');
  expect(page).not.toContain('S3 layout');
  expect(page).toContain('The layout and its rules are in architecture.md.');
  // The page has no root-relative URLs, so the GitHub Pages copy works under a subpath.
  expect(page).not.toMatch(/(?:href|src)="\/(?!\/)/);
  const doc = source('architecture.md');
  expect(doc).toContain('## Journal storage on S3 (`/merge`)');
  expect(doc).toContain('s3://helios-journals/');
  // The example keys match the tooltips the page shows (checked in test/browser/merge.e2e.js).
  expect(doc).toContain('`v1/l00/pages/41234/567.g0004.ndjson.gz` | 89');
  expect(doc).toContain('`v1/l01/pages/20617/283.g0003.ndjson.gz` | 94');
});
