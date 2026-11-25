import { describe, expect, test } from 'bun:test';
import { createPlan, createStream, DEFAULT_ASSUMPTIONS, sampleBinomial, randomSource, summarize, apportion } from '../scripts/world-vote-lab/model.ts';
import { parseArgs } from '../scripts/world-vote-lab/cli.ts';

const count = (x: { yes: number; no: number; abstain: number }) => x.yes + x.no + x.abstain;
const scenario = { proposal: 'A voluntary childcare pilot with independent review', seed: 'repeatable' };

describe('aggregate vote accounting', () => {
  test('represents exactly eight billion and releases every integer vote', () => {
    const plan = createPlan(scenario), stream = createStream(plan);
    expect(count(plan.totals)).toBe(8_000_000_000);
    expect(plan.cohorts.reduce((s, c) => s + c.population, 0)).toBe(8_000_000_000);
    let previous = { yes: 0, no: 0, abstain: 0 };
    while (stream.state.remaining) {
      const state = stream.next(200_000_000);
      expect(count(state.totals)).toBe(state.processed);
      for (const key of ['yes', 'no', 'abstain'] as const) {
        expect(state.totals[key]).toBeGreaterThanOrEqual(previous[key]);
        expect(Number.isSafeInteger(state.totals[key])).toBe(true);
      }
      for (const c of state.cohorts) {
        expect(count(c.counts)).toBe(c.counted);
        expect(c.counted).toBeLessThanOrEqual(c.population);
      }
      previous = { ...state.totals };
    }
    expect(stream.state.totals).toEqual(plan.totals);
    expect(stream.state.batches).toBe(40);
  });

  test('partial final batch and very small populations stay exact', () => {
    for (const population of [1, 2, 7, 8, 11, 101, 1003]) {
      const plan = createPlan({ ...scenario, population }), stream = createStream(plan);
      while (stream.state.remaining) stream.next(40);
      expect(stream.state.processed).toBe(population);
      expect(stream.state.totals).toEqual(plan.totals);
      expect(stream.state.batches).toBe(Math.ceil(population / 40));
      const batches = stream.state.batches;
      stream.next(40);
      expect(stream.state.batches).toBe(batches);
    }
  });

  test('same inputs are deterministic; presentation batch size cannot change final results', () => {
    const a = createPlan(scenario), b = createPlan(scenario);
    expect(a).toEqual(b);
    const streamA = createStream(a), streamB = createStream(b);
    while (streamA.state.remaining) streamA.next(377_777_777);
    while (streamB.state.remaining) streamB.next(2_000_000_000);
    expect(streamA.state.totals).toEqual(streamB.state.totals);
    expect(createPlan({ ...scenario, seed: 'another-seed' }).totals).not.toEqual(a.totals);
  });

  test('higher costs reduce every cohort support probability; benefit increases it', () => {
    const lowCost = createPlan({ ...scenario, assumptions: { ...DEFAULT_ASSUMPTIONS, cost: 0 } });
    const highCost = createPlan({ ...scenario, assumptions: { ...DEFAULT_ASSUMPTIONS, cost: 100 } });
    const highBenefit = createPlan({ ...scenario, assumptions: { ...DEFAULT_ASSUMPTIONS, cost: 100, benefit: 100 } });
    lowCost.cohorts.forEach((c, i) => {
      expect(c.expectedYesAmongDecided).toBeGreaterThan(highCost.cohorts[i]!.expectedYesAmongDecided);
      expect(highBenefit.cohorts[i]!.expectedYesAmongDecided).toBeGreaterThan(highCost.cohorts[i]!.expectedYesAmongDecided);
    });
  });

  test('boundary samplers and apportionment are bounded integer counts', () => {
    const random = randomSource(42);
    for (const n of [0, 1, 63, 100, 8_000_000_000]) for (const p of [0, 1e-9, 0.2, 0.5, 0.999999999, 1]) {
      const sampled = sampleBinomial(n, p, random);
      expect(Number.isSafeInteger(sampled)).toBe(true);
      expect(sampled).toBeGreaterThanOrEqual(0);
      expect(sampled).toBeLessThanOrEqual(n);
    }
    expect(apportion(7, [0, 1, 0, 2])).toEqual([0, 2, 0, 5]);
    expect(apportion(0, [0, 0])).toEqual([0, 0]);
    expect(() => apportion(1, [0, 0])).toThrow();
  });

  test('zero-count and partial explanations do not claim completion', () => {
    const plan = createPlan({ ...scenario, population: 101 }), stream = createStream(plan);
    expect(summarize(plan, stream.state)).toContain('No votes');
    stream.next(40);
    const text = summarize(plan, stream.state);
    expect(text).toContain('still in progress');
    expect(text).toContain('40 of 101');
    expect(text).not.toContain('NaN');
  });

  test('CLI validates options and accepts convenient billion/million suffixes', () => {
    expect(parseArgs(['--voters', '8b', '--batch-size=200m']).voters).toBe(8_000_000_000);
    expect(() => parseArgs(['--voters', '0'])).toThrow();
    expect(() => parseArgs(['--interval', '-1'])).toThrow();
    expect(() => parseArgs(['--cost', '101'])).toThrow();
    expect(() => parseArgs(['--batch-size', '1'])).toThrow();
    expect(() => parseArgs(['--toString', '1'])).toThrow();
    expect(() => createPlan({ ...scenario, assumptions: { ...DEFAULT_ASSUMPTIONS, benefit: NaN } })).toThrow();
  });
});
