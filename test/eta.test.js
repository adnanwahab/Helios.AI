import {test, expect} from 'bun:test';
import '../public/eta.js';
import catalog from '../data/catalog.json' with {type: 'json'};

const {MODEL, NOTE, cycleStart, remainingStages, estimateAll, span, format, ordinal} = globalThis.HeliosETA;
const SUNDAY = new Date('2026-11-22T17:00:00Z');
const day = iso => Date.parse(iso + 'T00:00:00Z');
const goals = () => structuredClone(catalog.goals);

test('all 100 editorial goals get ordered, deterministic arrival estimates', () => {
  const estimates = estimateAll(goals(), {asOf: SUNDAY});
  expect(estimates.size).toBe(100);
  for (const e of estimates.values()) {
    expect(e).toMatchObject({model: MODEL.id, status: 'estimated', cycleStart: '2026-11-23', queueSize: 10});
    expect(day(e.earliest)).toBeLessThanOrEqual(day(e.expected));
    expect(day(e.expected)).toBeLessThanOrEqual(day(e.latest));
    expect(e.stages.map(s => s.key)).toEqual(['assignment', 'review', 'publication', 'ballot']);
    expect(e.stages.at(-1).expected).toBe(e.expected);
  }
  expect(estimateAll(goals(), {asOf: SUNDAY})).toEqual(estimates);
});

test('each category starts its next goal every week, matching Civic Synthesis HFL dates', () => {
  const estimates = estimateAll(goals(), {asOf: SUNDAY});
  // Same model and order as civic synthesis: HGA-001 and HFL-001 both arrive Jan 4, 2027.
  expect(estimates.get('HGA-001')).toMatchObject({queuePosition: 0, startsOn: '2026-11-23', expected: '2027-01-04', earliest: '2026-12-20', latest: '2027-02-08'});
  expect(estimates.get('HGA-010')).toMatchObject({queuePosition: 9, startsOn: '2027-01-25', expected: '2027-03-08'});
  for (const category of catalog.categories) {
    const list = catalog.goals.filter(g => g.category === category).map(g => estimates.get(g.id));
    expect(list.map(e => e.queuePosition)).toEqual([...Array(10).keys()]);
  }
  expect(span(estimates.values())).toEqual({first: '2027-01-04', last: '2027-03-08'});
});

test('community proposals queue after editorial goals in their category, oldest first', () => {
  const list = goals();
  const category = catalog.categories[1];
  list.push({id: 'HGP-b', category, createdAt: '2026-11-21T10:00:00Z', reviewStatus: 'unreviewed', publicVoteStatus: 'not_open'});
  list.push({id: 'HGP-a', category, createdAt: '2026-11-20T10:00:00Z', reviewStatus: 'unreviewed', publicVoteStatus: 'not_open'});
  const estimates = estimateAll(list, {asOf: SUNDAY});
  expect(estimates.get('HGP-a')).toMatchObject({queuePosition: 10, queueSize: 12});
  expect(estimates.get('HGP-b')).toMatchObject({queuePosition: 11, queueSize: 12});
  expect(day(estimates.get('HGP-b').expected)).toBeGreaterThan(day(estimates.get('HGP-a').expected));
});

test('status fields shorten or close the estimate; unknown values fail closed', () => {
  expect(remainingStages({reviewStatus: 'unreviewed', publicVoteStatus: 'not_open'})).toEqual(['assignment', 'review', 'publication', 'ballot']);
  expect(remainingStages({reviewStatus: 'something-new'})).toEqual(['assignment', 'review', 'publication', 'ballot']);
  expect(remainingStages(null)).toEqual(['assignment', 'review', 'publication', 'ballot']);
  expect(remainingStages({reviewStatus: 'approved', publicVoteStatus: 'not_open'})).toEqual(['publication', 'ballot']);
  expect(remainingStages({reviewStatus: 'approved', publicVoteStatus: 'open'})).toEqual(['ballot']);
  expect(remainingStages({reviewStatus: 'approved', publicVoteStatus: 'closed'})).toEqual([]);
  const list = goals();
  list[0] = {...list[0], reviewStatus: 'approved', publicVoteStatus: 'open'};
  list[1] = {...list[1], publicVoteStatus: 'closed', reviewStatus: 'approved'};
  const estimates = estimateAll(list, {asOf: SUNDAY});
  expect(estimates.get('HGA-001')).toMatchObject({queuePosition: null, expected: '2026-11-30', earliest: '2026-11-30', latest: '2026-11-30'});
  expect(estimates.get('HGA-002')).toMatchObject({status: 'arrived', expected: null});
  expect(estimates.get('HGA-003')).toMatchObject({queuePosition: 0, queueSize: 8, expected: '2027-01-04'});
  expect(span(estimates.values()).first).toBe('2026-11-30');
});

test('cycles start the next Monday; estimates are pure', () => {
  expect(new Date(cycleStart(new Date('2026-11-23T23:59:00Z'))).toISOString().slice(0, 10)).toBe('2026-11-23');
  expect(new Date(cycleStart(new Date('2026-11-24T00:00:00Z'))).toISOString().slice(0, 10)).toBe('2026-11-30');
  const before = JSON.stringify(catalog);
  estimateAll(catalog.goals, {asOf: new Date('2027-06-01T00:00:00Z')});
  expect(JSON.stringify(catalog)).toBe(before);
});

test('formatting is UTC and the note disclaims schedules and enactment', () => {
  expect(format('2027-01-04')).toBe('Jan 4, 2027');
  expect([1, 2, 3, 4, 11, 12, 13, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '22nd']);
  for (const text of ['Planning estimate', 'Not a schedule', 'a commitment', 'prediction of enactment', 'official status']) expect(NOTE).toContain(text);
});
