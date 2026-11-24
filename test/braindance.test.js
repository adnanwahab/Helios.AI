import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../', import.meta.url);
const source = filename => readFileSync(join(root.pathname, filename), 'utf8');
const page = source('helios_braindance.html');

const day = iso => Date.parse(iso + 'T00:00:00Z');
const scriptDate = name => {
  const m = page.match(new RegExp(name + " = toT\\('(\\d{4}-\\d{2}-\\d{2})'\\)"));
  if (!m) throw new Error('Could not find ' + name + ' in helios_braindance.html');
  return m[1];
};
const events = JSON.parse(page.match(/<script id="bd-events" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const START = scriptDate('T0'), END = scriptDate('T1'), MIRROR = scriptDate('NOW');
const BODIES = [...page.matchAll(/(\w+): \{ a: -?\d/g)].map(m => m[1]);
const TRACKS = ['tech', 'world', 'planet', 'space', 'culture'];
const STATUSES = ['rec', 'sch', 'pln', 'prj'];

test('braindance event log is well formed and in date order', () => {
  expect(events.length).toBeGreaterThan(50);
  expect(BODIES).toContain('moon');
  const ids = new Set();
  let previous = '';
  for (const e of events) {
    const where = 'event ' + e.id;
    expect(e.id, where).toMatch(/^[a-z0-9-]+$/);
    expect(ids.has(e.id), where + ' is a duplicate').toBe(false);
    ids.add(e.id);
    expect(e.d, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(day(e.d)), where).toBe(false);
    expect(e.d >= previous, where + ' is out of date order').toBe(true);
    previous = e.d;
    if (e.e) expect(e.e >= e.d, where + ' ends before it starts').toBe(true);
    expect(e.d >= START && (e.e || e.d) <= END, where + ' is outside ' + START + ' to ' + END).toBe(true);
    expect(TRACKS, where).toContain(e.k);
    expect(STATUSES, where).toContain(e.s);
    if (e.p !== undefined) expect(['m', 'y'], where).toContain(e.p);
    for (const field of ['t', 'x', 'pl']) {
      expect(typeof e[field] === 'string' && e[field].trim().length > 0, where + ' needs ' + field).toBe(true);
      expect(e[field].includes('</'), where + ' text would end the script tag').toBe(false);
    }
    const places = [e.ll !== undefined, e.w !== undefined, e.g === true].filter(Boolean).length;
    expect(places, where + ' needs exactly one of ll, w or g').toBe(1);
    if (e.ll) {
      expect(Math.abs(e.ll[0]) <= 90 && Math.abs(e.ll[1]) <= 180, where).toBe(true);
    }
    if (e.w) expect(BODIES, where).toContain(e.w);
  }
});

test('braindance statuses match the mirror line and every event ahead cites a source', () => {
  for (const e of events) {
    const where = 'event ' + e.id;
    if (e.s === 'rec') {
      expect((e.e || e.d) <= MIRROR, where + ' is recorded but ends after ' + MIRROR).toBe(true);
    } else {
      expect(e.d > MIRROR, where + ' is ' + e.s + ' but dated on or before ' + MIRROR).toBe(true);
      expect(Array.isArray(e.src) && e.src.length > 0, where + ' needs a source').toBe(true);
    }
    for (const [label, url] of e.src || []) {
      expect(label.trim().length > 0, where).toBe(true);
      expect(url, where).toMatch(/^https:\/\/\S+$/);
    }
  }
});

test('braindance is a archived dashboard tab and ships in both Fly/Netlify and fork-safe static builds', () => {
  const index = source('docs/legacy-home.html');
  expect(index).toContain('id="tab-braindance"');
  expect(index).toContain('src="/embed/braindance"');
  expect(index).toContain("activate('braindance')");
  const toml = source('netlify.toml');
  expect(toml).toMatch(/from = "\/braindance"\s+to = "\/helios_braindance.html"/);
  expect(toml).toMatch(/from = "\/embed\/braindance"\s+to = "\/helios_braindance.html"/);
  expect(source('scripts/build-netlify.mjs')).toContain("'helios_braindance.html'");
  const pages = source('scripts/build-pages.mjs');
  expect(pages).toContain("'helios_braindance.html'");
  expect(pages).toContain(`replaceRequired('src="/embed/braindance"', 'src="./helios_braindance.html"')`);
});
