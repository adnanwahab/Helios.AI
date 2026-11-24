# The Eight Billion Memories

Open `/grid?story=population` (or `/grid.html?story=population` on a static mirror). From the original mystery, enter the memory vault and choose the population chamber. All content is fictional, client-side and separate from real ballots, public submissions, and personal journals.

## Model

- Exactly 8,000,000,000 addressable synthetic identities, internal IDs 0–7,999,999,999. UI IDs are one-based. The hash uses both halves of the ID and a seed. Needs, values, three memory events and their strengths, trust and uncertainty are generated on demand, not stored or claimed to describe real people.
- The illustrative score combines expected benefit weighted by unmet needs and values, implementation burden, relevant positive/negative memories, trust and uncertainty. Thresholds allow support, opposition and undecided. Memories are stable when the proposal changes. They are generated, not collected or learned; there is no longitudinal memory update or calibrated psychological model.
- Browser mode evaluates 16,384 deterministically sampled IDs (one per equal-width stratum) and assigns exact integer weights to those strata. Totals conserve 8B but are weighted synthetic estimates, not an exhaustive run or real-world prediction. The first run per proposal is the comparison baseline.
- Exact mode evaluates every ID in a requested half-open range; run disjoint ranges concurrently on your own compute. It uses no network and does not allocate an eight-billion-element array. Full evaluation is CPU-intensive, not executed in this PR. No runtime or throughput promise.

## Exact-range runner

```sh
node scripts/population-vote.mjs run 0 100000 > shard-a.json
node scripts/population-vote.mjs run 100000 200000 > shard-b.json
node scripts/population-vote.mjs reduce shard-a.json shard-b.json
```

For a full result, generate non-overlapping ranges covering [0, 8000000000), with identical proposal, cost, reliability and seed. The reducer rejects gaps, overlap, inconsistent parameters and invalid tallies; it marks `fullPopulation` true only for complete coverage. This is an exhaustive computation of a toy model, never an election result.

Run `bun test test/population-model.test.js` and `bunx playwright test test/browser/grid.e2e.js` after building the app.
