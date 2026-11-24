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

test('three-editor merge says its journals are samples and its S3 requests are simulated', () => {
  const page = source('three_editor_merge.html');
  expect(page).toContain('8,000,000,000 sample journals generated from their numbers');
  expect(page).toContain('each request is logged here instead of sent');
  // The page has no root-relative URLs, so the GitHub Pages copy works under a subpath.
  expect(page).not.toMatch(/(?:href|src)="\/(?!\/)/);
  expect(source('docs/journal-merge-s3.md')).toContain('s3://helios-journals/');
});
