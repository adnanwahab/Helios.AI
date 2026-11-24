import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');
const record = () => JSON.parse(source('long_coil.html').match(/<script type="application\/json" id="coil-data">([\s\S]*?)<\/script>/)[1]);

test('The Long Coil has its own route, a home tab and a place in both static builds', () => {
  const index = source('index.html');
  expect(index).toContain('aria-controls="view-coil">The Long Coil</button>');
  expect(index).toContain('src="/embed/coil"');
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/coil"\s+to = "\/long_coil.html"/);
  expect(toml).toMatch(/from = "\/embed\/coil"\s+to = "\/long_coil.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'long_coil.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain("join(out, 'long_coil.html')");
  expect(pages).toContain('src="./long_coil.html"');
});

test('every Long Coil entry is dated and sourced, and every projection states its tier and basis', () => {
  const entries = record();
  expect([...new Set(entries.map(r => r.k))].sort()).toEqual(['f', 'h', 'p']);
  const problems = [];
  for (const r of entries) {
    const where = `${r.k} ${r.y} ${r.t}`;
    if (!Number.isInteger(r.y)) problems.push(`${where}: year is not a whole number`);
    if (!r.t?.trim()) problems.push(`${where}: no title`);
    if (!r.u && !r.w) problems.push(`${where}: no source`);
    if (r.u && !r.u.startsWith('https://')) problems.push(`${where}: source is not https`);
    if (r.k !== 'f' && !(Number.isInteger(r.c) && r.c >= 0 && r.c <= 7)) problems.push(`${where}: no lineage`);
    if (r.k === 'h' && r.y > 2026) problems.push(`${where}: history after 2026`);
    if (r.k === 'p') {
      if (r.y < 2027 || r.y > 2036) problems.push(`${where}: projection outside 2027 to 2036`);
      if (!['s', 'l', 'p', 'x'].includes(r.r)) problems.push(`${where}: no confidence tier`);
      if (!r.b?.trim()) problems.push(`${where}: does not say what it rests on`);
    }
    if (r.k === 'f') {
      if (!(r.s <= 2026)) problems.push(`${where}: forecast not made by 2026`);
      if (!['t', 'l', 'p', 'w', 'm', 'n'].includes(r.o)) problems.push(`${where}: no outcome`);
    }
  }
  expect(problems).toEqual([]);
});
