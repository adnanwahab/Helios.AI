import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');

test('Rainbow Brain Realms is a tab on the merged index and routed on Fly, Netlify and Pages', () => {
  const index = source('docs/legacy-home.html');
  expect(index).toContain('id="tab-rainbow"');
  expect(index).toContain('src="/embed/rainbow-brain"');
  expect(index).toContain("activate('rainbow')");
  expect(source('netlify.toml')).toMatch(/from = "\/embed\/rainbow-brain"\s+to = "\/rainbow_brain.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'rainbow_brain.html'");
  expect(source('scripts/build-pages.mjs')).toContain('src="./rainbow_brain.html"');
});

test('Rainbow Brain story covers every year 2019-2033 with all critic lenses filled in', () => {
  const page = source('rainbow_brain.html');
  const data = JSON.parse(page.match(/<script type="application\/json" id="rb-data">([\s\S]*?)<\/script>/)[1]);
  expect(data.years.map(y => y.y)).toEqual(Array.from({length: 15}, (_, i) => 2019 + i));
  expect(data.cats).toHaveLength(6);
  for (const year of data.years) {
    data.cats.forEach((cat, i) => {
      expect(year.a[i]).toHaveLength(cat.fields.length);
      for (const value of year.a[i]) expect(value.length).toBeGreaterThan(0);
    });
  }
});

test('Rainbow Brain page labels illustrative numbers and is not presented as a vote', () => {
  const page = source('rainbow_brain.html');
  expect(page).toContain('illustrative data');
  expect(page).toContain('not votes');
  expect(page).toContain('draft · not law');
  expect(page).toContain('not a forecast');
});
