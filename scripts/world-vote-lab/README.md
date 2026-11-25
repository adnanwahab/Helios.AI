# Helios · World Vote Lab

A dependency-free Bun task that prompts for a proposal and streams **8,000,000,000 synthetic votes** through a live console dashboard. Each batch updates yes/no/abstain counts, progress, fictional cohort comparisons, and a written summary. The default is **200 million represented votes every two seconds**: 40 batches in about 80 seconds.

## Run

Run these commands from the Helios repository root. Requires the repository’s supported Bun version (1.3 or newer). No package install or API key is needed.

```bash
bun run votes:world
```

The interactive prompt asks for the proposal, then five assumed impacts from 0 to 100: public benefit, cost burden, personal autonomy, evidence quality, and fairness of access. Press Enter to accept a default. Higher cost burden reduces modeled support; higher values for the other assumptions increase it.

While the live display is running, press **Space** or **P** to pause/resume, **Q** to save a partial result and quit, or **Ctrl+C** to stop and save the count reached so far. The terminal cursor and original screen are restored on exit. Piped output automatically uses plain text.

## Useful commands

```bash
# The included childcare proposal, with the normal 2-second pacing.
bun run votes:world:demo

# Supply a proposal directly and release 100 million votes every 3 seconds.
bun run votes:world --proposal "A voluntary childcare pilot" \
  --batch-size 100m --interval 3 --seed experiment-1

# Make the assumptions explicit and choose an output directory.
bun run votes:world --proposal-file scripts/world-vote-lab/examples/childcare.txt \
  --benefit 80 --cost 35 --autonomy 90 --evidence 65 --fairness 85 \
  --output .data/world-vote-lab/childcare-pilot

# Fast verification of the full eight-billion total.
bun run votes:world --proposal "A voluntary childcare pilot" \
  --interval 0 --batch-size 1b --plain --output .data/world-vote-lab/quick-check

# A small population for trying the interface.
bun run votes:world --proposal "A neighborhood experiment" \
  --voters 1000 --batch-size 100 --interval 2

bun run votes:world --help
bun test test/world-vote-lab.test.ts test/world-vote-lab-cli.test.ts
```

Numbers accept commas, underscores, and `k`, `m`, or `b` suffixes. `--interval` is measured in seconds and accepts decimals. `--no-color` disables colors; `--plain` disables the animated screen. `NO_COLOR` is respected. An existing explicitly chosen output directory receives new `results.json` and `summary.md` files, replacing those filenames if present.

## What the model does

The model has **eight invented preference archetypes**, such as “Budget stewardship” and “Evidence first.” Their population shares and response coefficients are arbitrary experimental inputs. They are not demographics, countries, real voter profiles, or estimated world population proportions.

For each cohort, explicit impact assumptions determine a probability of abstention and a probability of yes among decided votes. A seeded random generator samples aggregate yes/no/abstain counts. Large counts use a **rounded normal approximation to binomial sampling**; small counts use Bernoulli trials or an inverse cumulative calculation. Counts are nonnegative integers and sum **exactly** to the requested total, even though the sampler and behavioral model are approximate.

The final aggregate is calculated once and released proportionally in paced integer batches. The delay is for watching the simulation unfold. Changing the interval or batch size cannot change the final totals. The same proposal, assumptions, population, and seed reproduce the same result. A changed proposal label changes sampling noise; substantial opinion changes come from the explicit assumptions.

**Proposal text is a scenario label and seed input.** This version does not interpret language, call an LLM, model individual memories, or create eight billion people. The written summary is generated directly from the tallies and assumptions. It is an illustrative experiment, not measured public opinion, a forecast, or evidence of consent.

Memory and computation depend on the eight cohorts and display batches, not on the represented population. The program never creates eight billion rows or sends eight billion API requests.

## Outputs

Each run saves a new timestamped folder under `.data/world-vote-lab/` unless `--output` is provided:

- `results.json`: proposal, assumptions, seed, completion status, exact counters, cohort tallies, pacing, and methodology.
- `summary.md`: readable results table, explanatory paragraph, assumptions, and limitations.

Cancelled runs contain only the votes released before cancellation, along with the remaining count. Their summaries explicitly say the count is still in progress. The dashboard percentages use **released votes** as the denominator; the summary separately reports support among yes/no votes so abstentions are not silently discarded.

## Source layout

- `scripts/world-vote-lab/model.ts`: pure seeded aggregate model, integer apportionment, stream state, and summary text.
- `scripts/world-vote-lab/cli.ts`: prompts, live terminal display, pacing, cancellation, and exports.
- `test/world-vote-lab*.test.ts`: exact accounting, deterministic results, monotonic policy inputs, small populations, partial final batches, actual timer spacing, and cancellation behavior.

This aggregate visualization task is separate from `scripts/population-vote.mjs`, which computes exact individual-index shards for the existing population model. No credentials or service configuration are needed.
