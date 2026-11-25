# Helios Consensus Lab

An offline, deterministic simulation of 100 synthetic agents reviewing six fictional bills across five stages. The sample is a model/UI test, not human voting, public opinion, a forecast, or actual consent. No AI API, secrets, database, or dependencies are required for the lab.

## Run locally

```sh
cd consensus-lab
bun run simulate --date 2026-11-25 --seed 42 --agents 100
bun run serve --dir out/2026-11-25
```

Open http://127.0.0.1:3000 or open `out/2026-11-25/index.html` directly. Stop the server with Ctrl+C. The report includes a 100-agent voting mosaic, five-stage replay, support timeline, group comparison, individual reasons, original/amended text, version hashes and shareable URL selection state. The six default scenarios and group/assumption fixtures live in `data/`.

```sh
bun run simulate:today  # Chicago calendar date, default daily seed
bun run simulate --bills data/bills.example.json --out out/custom
bun run serve --dir out/custom --port 3010
bun test
```

The daily task is on-demand. It does not fetch legislation or schedule itself. Copy `data/bills.example.json` to provide today's authored proposals and effect assumptions. Changing a seed or date intentionally changes the synthetic population; use the same date and seed for controlled comparisons.

## Output and semantics

| File | Contents |
| --- | --- |
| index.html | Portable, interactive offline report |
| results.json | Full input, agents, stages, reasons, group metrics and vote transitions |
| votes.ndjson | Exact version-bound synthetic agent-stage records (3,000 by default) |
| summary.csv | Counts and denominator-specific support rates for each stage |
| manifest.json | Run identity and SHA-256 checksums |

Generated runs under `out/` are ignored. Every state distinguishes support, opposition, abstention and absence. Support among all eligible agents, submitted responses and decisive votes use distinct denominators; undefined ratios are null. Stages 1–4 are preference checks, not binding ballots. Stage 5 is a fresh simulated ballot on the amended version. An old approval does not become approval of a new revision. Four preset priority groups are design fixtures, not demographic or political classifications.

Policy effects and evidence quality are authored assumptions, not empirical estimates. The model permits support to decrease. No forced consensus or real user data. See `data/model-metadata.json` and `src/simulate.ts` for the complete method.

## Static preview

The Netlify static build generates a fixed, synthetic example at `/consensus-lab/`. Only the example HTML report is published, not local custom outputs. The lab does not touch live ballots, Supabase, the homepage or any existing routes.

## Tests

The Bun test suite covers reproducibility, count reconciliation, exact revision hashes, group denominators, nonparticipation, input validation, safe HTML/CSV and export manifests. The seed-42 regression case checks Third places for everyone: 75 support, 0 oppose, 19 abstain, 6 absent. This is a synthetic test fixture.
