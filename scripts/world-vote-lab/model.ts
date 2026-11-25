export const DEFAULT_VOTERS = 8_000_000_000;
export const MODEL_VERSION = 'synthetic-cohorts-v1';
export const MAX_VOTERS = 1_000_000_000_000;

export type Outcome = 'yes' | 'no' | 'abstain';
export type Counts = Record<Outcome, number>;
export type Assumptions = { benefit: number; cost: number; autonomy: number; evidence: number; fairness: number };
export const DEFAULT_ASSUMPTIONS: Assumptions = { benefit: 65, cost: 40, autonomy: 65, evidence: 55, fairness: 65 };
export const ASSUMPTION_LABELS: Record<keyof Assumptions, string> = {
  benefit: 'Public benefit', cost: 'Cost burden', autonomy: 'Personal autonomy',
  evidence: 'Evidence quality', fairness: 'Fairness of access',
};

export type Cohort = {
  name: string;
  population: number;
  expectedYesAmongDecided: number;
  expectedAbstention: number;
  counts: Counts;
  coefficients: number[];
};

export type Plan = {
  modelVersion: string;
  proposal: string;
  seed: string;
  population: number;
  assumptions: Assumptions;
  cohorts: Cohort[];
  totals: Counts;
};

export type LiveState = {
  processed: number;
  remaining: number;
  batches: number;
  totals: Counts;
  cohorts: Array<{ name: string; population: number; counted: number; counts: Counts }>;
};

const OUTCOMES: Outcome[] = ['yes', 'no', 'abstain'];
const DIMENSIONS: (keyof Assumptions)[] = ['benefit', 'cost', 'autonomy', 'evidence', 'fairness'];
const ZERO = (): Counts => ({ yes: 0, no: 0, abstain: 0 });
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

// Entirely invented experimental archetypes and population weights, not real demographics.
const ARCHETYPES = [
  { name: 'Public benefit', share: 14, weights: [1.8, -0.7, 0.6, 0.7, 1.2], bias: 0.05 },
  { name: 'Budget stewardship', share: 14, weights: [0.8, -2.1, 0.5, 1.2, 0.6], bias: -0.14 },
  { name: 'Personal autonomy', share: 13, weights: [0.7, -0.6, 2.2, 0.7, 0.8], bias: -0.03 },
  { name: 'Evidence first', share: 13, weights: [0.7, -0.9, 0.7, 2.3, 0.8], bias: -0.12 },
  { name: 'Fairness of access', share: 14, weights: [1.3, -0.6, 0.7, 0.8, 2.1], bias: 0.02 },
  { name: 'Local choice', share: 10, weights: [0.8, -1.1, 1.9, 0.9, 0.7], bias: -0.11 },
  { name: 'Future resilience', share: 12, weights: [1.5, -0.8, 0.7, 1.4, 1.2], bias: 0.01 },
  { name: 'Careful implementation', share: 10, weights: [0.9, -1.5, 0.8, 1.7, 0.9], bias: -0.16 },
];

export function hashSeed(value: string): number {
  let h = 2166136261;
  for (const point of value) h = Math.imul(h ^ point.codePointAt(0)!, 16777619);
  return h >>> 0;
}

export function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number): number {
  const u = Math.max(Number.MIN_VALUE, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/**
 * Bounded aggregate sampling. Exact Bernoulli for small n, inverse CDF for
 * small expected tails, and a rounded normal approximation for large cohorts.
 * This is not an exact binomial sampler for all n and is labeled accordingly.
 */
export function sampleBinomial(n: number, p: number, random: () => number): number {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid binomial parameters');
  if (n === 0 || p === 0) return 0;
  if (p === 1) return n;
  if (p > 0.5) return n - sampleBinomial(n, 1 - p, random);
  if (n < 64) {
    let count = 0;
    for (let i = 0; i < n; i++) if (random() < p) count++;
    return count;
  }
  if (n * p < 30) {
    const uniform = random();
    let term = Math.exp(n * Math.log1p(-p)), cumulative = term, k = 0;
    while (uniform > cumulative && k < n) {
      k++;
      term *= ((n - k + 1) / k) * (p / (1 - p));
      cumulative += term;
      if (term === 0) break;
    }
    return k;
  }
  return clamp(Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(random)), 0, n);
}

/** Exact integer apportionment. Work is bounded by the number of buckets. */
export function apportion(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Invalid apportionment');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (total !== 0) throw new Error('Cannot distribute a nonzero total among zero weights');
    return weights.map(() => 0);
  }
  const exact = weights.map(w => total * (w / sum));
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - counts[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; left > 0; i++, left--) counts[order[i % order.length]!.index]!++;
  return counts;
}

export function createPlan(options: { proposal: string; seed?: string; population?: number; assumptions?: Assumptions }): Plan {
  const population = options.population ?? DEFAULT_VOTERS;
  if (!Number.isSafeInteger(population) || population < 1 || population > MAX_VOTERS) throw new Error(`Voters must be an integer from 1 to ${MAX_VOTERS}`);
  const proposal = options.proposal.trim();
  if (!proposal || proposal.length > 20_000) throw new Error('Proposal must contain 1–20,000 characters');
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...options.assumptions };
  for (const [key, value] of Object.entries(assumptions)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${key} must be from 0 to 100`);
  }
  const seed = options.seed ?? 'helios-42';
  const populations = apportion(population, ARCHETYPES.map(c => c.share));
  const totals = ZERO();
  const cohorts = ARCHETYPES.map((archetype, index) => {
    const n = populations[index]!;
    const random = randomSource(hashSeed(`${MODEL_VERSION}\0${seed}\0${proposal}\0${archetype.name}`));
    const weighted = DIMENSIONS.reduce((sum, dim, i) => sum + ((assumptions[dim] - 50) / 50) * archetype.weights[i]!, 0);
    const scale = archetype.weights.reduce((sum, weight) => sum + Math.abs(weight), 0);
    const utility = weighted / scale;
    const expectedYesAmongDecided = 1 / (1 + Math.exp(-(utility * 4 + archetype.bias)));
    const expectedAbstention = clamp(0.04 + (1 - assumptions.evidence / 100) * 0.22 + (1 - Math.abs(utility)) * 0.08, 0.02, 0.4);
    const decided = sampleBinomial(n, 1 - expectedAbstention, random);
    const yes = sampleBinomial(decided, expectedYesAmongDecided, random);
    const counts = { yes, no: decided - yes, abstain: n - decided };
    for (const outcome of OUTCOMES) totals[outcome] += counts[outcome];
    return { name: archetype.name, population: n, expectedYesAmongDecided, expectedAbstention, counts, coefficients: [...archetype.weights] };
  });
  return { modelVersion: MODEL_VERSION, proposal, seed, population, assumptions, cohorts, totals };
}

export function createStream(plan: Plan) {
  const remainingBuckets = plan.cohorts.flatMap(c => OUTCOMES.map(outcome => c.counts[outcome]));
  const state: LiveState = {
    processed: 0, remaining: plan.population, batches: 0, totals: ZERO(),
    cohorts: plan.cohorts.map(c => ({ name: c.name, population: c.population, counted: 0, counts: ZERO() })),
  };
  return {
    state,
    next(batchSize: number): LiveState {
      if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Batch size must be a positive safe integer');
      if (state.remaining === 0) return state;
      const count = Math.min(batchSize, state.remaining);
      const released = apportion(count, remainingBuckets);
      released.forEach((value, index) => {
        if (value > remainingBuckets[index]!) throw new Error('Release exceeds available votes');
        remainingBuckets[index]! -= value;
        const cohort = state.cohorts[Math.floor(index / 3)]!;
        const outcome = OUTCOMES[index % 3]!;
        cohort.counts[outcome] += value;
        cohort.counted += value;
        state.totals[outcome] += value;
      });
      state.processed += count;
      state.remaining -= count;
      state.batches++;
      return state;
    },
  };
}

export function summarize(plan: Plan, state: LiveState, complete = state.remaining === 0): string {
  if (state.processed === 0) return 'The simulation is ready. No votes have been released yet. The five explicit assumptions determine how the fictional cohorts respond.';
  const pct = (n: number) => (100 * n / state.processed).toFixed(1);
  const decided = state.totals.yes + state.totals.no;
  const support = decided ? (100 * state.totals.yes / decided).toFixed(1) + '%' : 'unavailable';
  const ranked = state.cohorts.filter(c => c.counted > 0).map(c => ({
    name: c.name, share: c.counts.yes / c.counted,
  })).sort((a, b) => b.share - a.share);
  const high = ranked[0], low = ranked.at(-1);
  const start = complete ? 'The simulated count is complete' : 'The simulated count is still in progress';
  const tally = `${start}: ${state.processed.toLocaleString('en-US')} of ${plan.population.toLocaleString('en-US')} represented votes have been released. Yes accounts for ${pct(state.totals.yes)}%, no for ${pct(state.totals.no)}%, and abstention for ${pct(state.totals.abstain)}% of released votes. Among yes/no votes, support is ${support}.`;
  const comparison = high && low && high.name !== low.name ? ` The strongest yes share is in the fictional “${high.name}” cohort (${(100 * high.share).toFixed(1)}%); the weakest is “${low.name}” (${(100 * low.share).toFixed(1)}%).` : '';
  const evidence = ` These results follow your assumed benefit (${plan.assumptions.benefit}/100), cost burden (${plan.assumptions.cost}/100), autonomy (${plan.assumptions.autonomy}/100), evidence (${plan.assumptions.evidence}/100), and fairness (${plan.assumptions.fairness}/100).`;
  return tally + comparison + evidence + ' This is an illustrative aggregate simulation, not measured public opinion or individually modeled people.';
}
