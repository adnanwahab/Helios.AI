# Helios · Eight Billion Weighted Vote Lab

One proposal. Eight billion **represented synthetic votes**. Watch the count unfold in a live terminal dashboard.

This is a local, dependency-free research/game tool. It represents 8,000,000,000 votes using 80,000 fictional weighted profiles by default (100,000 votes each). It does not contact people, measure public opinion, infer preferences from bill text, or establish consensus. The existing `votes:world` cohort-sampling model and `simulate:votes` task are unchanged.

## Quick start

From the repository root, with Bun 1.3+:

```sh
bun run votes:8b
```

Type a proposal and accept or tune the assumptions. The dashboard shows the tally, percentage bars, progress, next batch, ETA, preference groups and synthetic explanations. No API key, network or dependency installation is required.

```sh
# Built-in proposal; 250m represented votes every three seconds.
bun run votes:8b --demo

# Type the six assumptions interactively.
bun run votes:8b --bill "A voluntary neighborhood childcare pilot" --tune

# Change pacing and preserve a reproducible seed.
bun run votes:8b --demo --batch-size 100m --interval 5 --seed comparison-01

# Instant JSON result (no report files).
bun run votes:8b --demo --fast --json --no-save

# Local verification.
bun run test:votes:8b
bun run votes:8b --help
```

The default 32 batches take approximately 96 seconds. The 100m/5s example takes 400 seconds. Pauses and speed changes affect elapsed time but not the completed result.

## Keyboard controls

| Key | Action |
| --- | --- |
| Space | Pause/resume |
| + / - | Increase/decrease speed |
| S | Save a partial snapshot |
| Q / Ctrl+C | Stop and save the partial count |

Use `--plain`, `--ascii` or `--no-color` for other terminal environments. Piped output automatically uses plain progress lines; `--json` emits only the final report.

## Compare model assumptions, not real citizens

The six user-supplied assumptions are benefit, cost, fairness, freedom, safeguards and clarity, each between 0 and 100. Higher cost means more perceived burden. The other scores represent more favorable assumed impacts. For example:

```sh
bun run votes:8b --bill "Childcare pilot with public review" \
  --benefit 75 --cost 35 --fairness 70 --freedom 85 \
  --safeguards 70 --clarity 80 --seed comparison-01
```

The program does not analyze the bill's language; its text labels the experiment. Keep the seed and model fixed for a controlled comparison, and adjust assumptions explicitly. All modeled preferences and reasons are invented. The count is exact, but the behavioral model is illustrative, not calibrated against real population data.

Options include `--population 8b`, `--samples 80000`, `--batch-size 250m`, `--interval 3`, `--seed`, `--bill-file PATH`, `--output PATH`, `--no-save` and the six assumption flags. The maximum sample count is one million. Weighted profiles are evaluated once; batches may split a profile's weight so totals remain exact.

## Output

By default completed, stopped and manually saved snapshots are written to the ignored `.data/vote-profile-lab/` directory as unique JSON, TXT and Markdown files. Use `--output PATH` to override or `--no-save` to avoid writing reports. Do not commit private proposal text or report files.

The original example with the default seed and assumptions reproduced these counts:

| Response | Represented votes |
| --- | ---: |
| Yes | 4,145,200,000 |
| No | 1,228,500,000 |
| Abstain | 2,626,300,000 |
| Total | 8,000,000,000 |

These are fictional responses. Partial results explicitly identify counted and remaining votes; abstention is not agreement.

## Integration

The CLI is the standalone TypeScript bundle from the initial vote lab delivery, retained in a single dependency-free file with repository-local defaults. The separate integration test exercises the CLI as a subprocess. No browser routes, database, authentication or production deployments are modified. The normal repository Bun tests discover the new test file.
