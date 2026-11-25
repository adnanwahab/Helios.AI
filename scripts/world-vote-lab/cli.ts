#!/usr/bin/env bun
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createPlan, createStream, summarize, DEFAULT_VOTERS, DEFAULT_ASSUMPTIONS,
  ASSUMPTION_LABELS, MODEL_VERSION, MAX_VOTERS,
  type Assumptions, type Plan, type LiveState,
} from './model.ts';

type Options = {
  proposal?: string; proposalFile?: string; voters: number; batchSize: number;
  interval: number; seed: string; noColor: boolean; plain: boolean; output?: string;
  assumptions: Assumptions; explicitAssumptions: Set<keyof Assumptions>;
};

const help = `HELIOS · WORLD VOTE LAB

Usage: bun run votes:world [options]

Without --proposal, an interactive terminal asks for a proposal and five
assumed impacts. Higher cost is worse; higher other assumptions are better.

  --proposal TEXT          Proposal to label the experiment
  --proposal-file PATH     Read a multiline proposal from a UTF-8 file
  --voters NUMBER          Represented votes (default: 8b)
  --batch-size NUMBER      Votes released per tick (default: 200m)
  --interval SECONDS       Delay before each tick (default: 2; 0 for fast runs)
  --seed TEXT              Repeatable scenario seed (default: helios-42)
  --benefit 0..100          Assumed public benefit (default: 65)
  --cost 0..100             Assumed cost burden (default: 40)
  --autonomy 0..100         Assumed personal autonomy (default: 65)
  --evidence 0..100         Assumed evidence quality (default: 55)
  --fairness 0..100         Assumed fairness of access (default: 65)
  --output DIRECTORY       Results folder (default: .data/world-vote-lab/<timestamp>)
  --no-color               Disable ANSI colors
  --plain                  Line-based output; no animated screen
  --help                   Show this help

TTY controls: Space or P pauses/resumes. Q saves a partial result and exits.
Ctrl+C also saves the count reached so far. JSON and Markdown are always saved.

This is a synthetic cohort simulation, not a poll. Large cohort counts use a
normal approximation. Proposal text is a label, not an AI interpretation.
The totals are precomputed and then released in paced batches.
`;

const safeText = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').replace(/\r/g, '');
const number = (n: number) => n.toLocaleString('en-US');
const pct = (n: number, total: number) => total ? `${(100 * n / total).toFixed(1)}%` : '—';
const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : number(n);

function numeric(text: string): number {
  const cleaned = text.replace(/[,_]/g, '').trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) throw new Error(`Expected a nonnegative number, received ${JSON.stringify(text)}`);
  const scale: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
  return Number(match[1]) * (match[2] ? scale[match[2].toLowerCase()]! : 1);
}

export function parseArgs(args: string[]): Options {
  const options: Options = {
    voters: DEFAULT_VOTERS, batchSize: 200_000_000, interval: 2, seed: 'helios-42',
    noColor: 'NO_COLOR' in process.env, plain: false,
    assumptions: { ...DEFAULT_ASSUMPTIONS }, explicitAssumptions: new Set(),
  };
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const equal = raw.indexOf('=');
    const flag = equal < 0 ? raw : raw.slice(0, equal);
    if (flag === '--no-color') { options.noColor = true; continue; }
    if (flag === '--plain') { options.plain = true; continue; }
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument ${JSON.stringify(raw)}`);
    const value = equal < 0 ? args[++i] : raw.slice(equal + 1);
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--proposal') options.proposal = value;
    else if (flag === '--proposal-file') options.proposalFile = value;
    else if (flag === '--voters') options.voters = numeric(value);
    else if (flag === '--batch-size') options.batchSize = numeric(value);
    else if (flag === '--interval') options.interval = numeric(value);
    else if (flag === '--seed') options.seed = value;
    else if (flag === '--output') options.output = value;
    else if (Object.hasOwn(DEFAULT_ASSUMPTIONS, flag.slice(2))) {
      const key = flag.slice(2) as keyof Assumptions;
      options.assumptions[key] = numeric(value); options.explicitAssumptions.add(key);
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (options.proposal !== undefined && options.proposalFile !== undefined) throw new Error('Choose either --proposal or --proposal-file');
  if (!Number.isSafeInteger(options.voters) || options.voters < 1 || options.voters > MAX_VOTERS) throw new Error(`--voters must be an integer from 1 to ${number(MAX_VOTERS)}`);
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1) throw new Error('--batch-size must be a positive safe integer');
  if (!Number.isFinite(options.interval) || options.interval < 0 || options.interval > 3600) throw new Error('--interval must be from 0 to 3600 seconds');
  if (Math.ceil(options.voters / options.batchSize) > 100_000) throw new Error('That would require over 100,000 display batches. Increase --batch-size.');
  for (const [key, value] of Object.entries(options.assumptions)) if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`--${key} must be from 0 to 100`);
  if (!options.seed.trim() || options.seed.length > 200) throw new Error('--seed must contain 1–200 characters');
  return options;
}

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line ? line.length + 1 : 0) + word.length > width && line) { lines.push(line); line = ''; }
    if (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      for (let i = 0; i < word.length; i += width) {
        const chunk = word.slice(i, i + width);
        if (chunk.length === width) lines.push(chunk); else line = chunk;
      }
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function bar(share: number, size: number, filled = '━', empty = '─') {
  const n = Math.round(Math.max(0, Math.min(1, share)) * size);
  return filled.repeat(n) + empty.repeat(size - n);
}

async function promptScenario(options: Options): Promise<string> {
  if (options.proposalFile !== undefined) return safeText(await readFile(resolve(options.proposalFile), 'utf8')).trim();
  if (options.proposal !== undefined) return safeText(options.proposal).trim();
  if (!process.stdin.isTTY) throw new Error('Use --proposal TEXT or --proposal-file PATH when input is not an interactive terminal');
  console.log(`\nHELIOS · WORLD VOTE LAB\n${number(options.voters)} synthetic votes, one explicit experiment.\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let proposal = '';
    while (!proposal) proposal = safeText(await rl.question('What proposal should we vote on?\n> ')).trim();
    console.log('\nSet the assumed impacts. Press Enter to keep each default.');
    console.log('These are your model inputs, not facts inferred from the proposal.\n');
    for (const key of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]) {
      if (options.explicitAssumptions.has(key)) continue;
      while (true) {
        const direction = key === 'cost' ? 'higher = more burden' : 'higher = better';
        const answer = (await rl.question(`${ASSUMPTION_LABELS[key]} [${options.assumptions[key]}] (0–100; ${direction}): `)).trim();
        if (!answer) break;
        const value = Number(answer);
        if (Number.isFinite(value) && value >= 0 && value <= 100) { options.assumptions[key] = value; break; }
        console.log('Please enter a number from 0 to 100.');
      }
    }
    return proposal;
  } finally { rl.close(); }
}

async function saveResult(options: Options, plan: Plan, state: LiveState, started: string, elapsed: number, status: 'complete' | 'cancelled') {
  const stamp = started.replace(/[:.]/g, '-');
  const directory = resolve(options.output || join('.data', 'world-vote-lab', stamp));
  await mkdir(directory, { recursive: true });
  const summary = summarize(plan, state, status === 'complete');
  const result = {
    schemaVersion: 1, modelVersion: MODEL_VERSION, status, startedAt: started,
    finishedAt: new Date().toISOString(), elapsedSeconds: Number(elapsed.toFixed(3)),
    proposal: plan.proposal, seed: plan.seed, assumptions: plan.assumptions,
    requestedVotes: plan.population, processedVotes: state.processed, remainingVotes: state.remaining,
    totals: state.totals, batches: state.batches,
    pacing: { votesPerBatch: options.batchSize, intervalSeconds: options.interval },
    cohorts: state.cohorts.map((c, i) => ({ ...c, expectedYesAmongDecided: plan.cohorts[i]!.expectedYesAmongDecided, expectedAbstention: plan.cohorts[i]!.expectedAbstention })),
    summary,
    methodology: {
      synthetic: true, realPublicOpinion: false, independentAgentHistories: false,
      sampler: 'Sequential binomial draws per fictional cohort; rounded normal approximation for large expected counts, exact Bernoulli or inverse CDF for small counts.',
      release: 'Final counts are computed once, then released proportionally in integer batches. Pacing is a presentation choice.',
      textRole: 'Proposal text labels the scenario and keys the pseudorandom seed. It is not interpreted by an AI model. Explicit impact assumptions determine probabilities.',
      caveat: 'Counts are exact integers but the behavioral model is invented and aggregate sampling is approximate. No demographic calibration, real voter records, or forecasts.',
    },
  };
  const jsonPath = join(directory, 'results.json'), summaryPath = join(directory, 'summary.md');
  // Export aggregates only; never materialize a row for each represented vote.
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n');
  const escapedProposal = plan.proposal.split('\n').map(line => '> ' + line).join('\n');
  const markdown = `# Helios simulated vote summary\n\n**Status:** ${status}. **Seed:** ${safeText(plan.seed)}. **Model:** ${MODEL_VERSION}.\n\n## Proposal\n\n${escapedProposal}\n\n## Results\n\n| Outcome | Released votes | Share of released votes |\n| --- | ---: | ---: |\n| Yes | ${number(state.totals.yes)} | ${pct(state.totals.yes, state.processed)} |\n| No | ${number(state.totals.no)} | ${pct(state.totals.no, state.processed)} |\n| Abstain | ${number(state.totals.abstain)} | ${pct(state.totals.abstain, state.processed)} |\n\n${summary}\n\n## Assumptions\n\n${Object.entries(plan.assumptions).map(([key, value]) => `- ${ASSUMPTION_LABELS[key as keyof Assumptions]}: ${value}/100`).join('\n')}\n\n## Method\n\nEight fictional preference cohorts represent the requested population. Large cohort outcomes use a normal approximation to binomial sampling; all counts are bounded nonnegative integers and sum exactly to the requested population when complete. Final totals are computed once and released in timed batches. The interval and batch size change the presentation, not the final result. Proposal text is a scenario label and random-seed input; the model does not understand the text or call an LLM. This is an illustrative simulation, not public opinion or a forecast.\n`;
  await writeFile(summaryPath, markdown);
  return { directory, jsonPath, summaryPath, summary };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return 0; }
  const options = parseArgs(args);
  const proposal = await promptScenario(options);
  const plan = createPlan({ proposal, seed: options.seed, population: options.voters, assumptions: options.assumptions });
  const stream = createStream(plan), state = stream.state;
  const started = new Date().toISOString(), start = performance.now();
  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY && !options.plain && process.env.TERM !== 'dumb');
  const color = Boolean(process.stdout.isTTY && !options.noColor && process.env.TERM !== 'dumb');
  const paint = (code: string, text: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  let cancelled = false, signalExit = false, paused = false, nextTick = performance.now() + options.interval * 1000, pulse = 0;
  const abort = () => { cancelled = true; signalExit = true; };
  const input = (chunk: Buffer) => {
    for (const key of chunk.toString()) {
      if (key === '\u0003') abort();
      else if (key.toLowerCase() === 'q') cancelled = true;
      else if (key === ' ' || key.toLowerCase() === 'p') { paused = !paused; if (!paused) nextTick = performance.now() + options.interval * 1000; }
    }
  };
  const originalRaw = process.stdin.isRaw;

  function render() {
    const width = Math.max(30, Math.min(100, (process.stdout.columns || 88) - 2));
    const narrow = width < 65;
    const progress = state.processed / plan.population;
    const remainingBatches = Math.ceil(state.remaining / options.batchSize);
    const elapsed = Math.floor((performance.now() - start) / 1000);
    const waiting = Math.max(0, (nextTick - performance.now()) / 1000);
    const lines: string[] = [];
    lines.push(paint('1;36', 'HELIOS  /  WORLD VOTE LAB'));
    lines.push(paint('2', `${compact(plan.population)} synthetic votes · 8 fictional cohorts`));
    lines.push('');
    const proposalLines = wrap(plan.proposal, width);
    lines.push(...proposalLines.slice(0, 2).map((line, i) => line + (i === 1 && proposalLines.length > 2 ? '…' : '')));
    lines.push(paint('2', `Seed: ${safeText(plan.seed).slice(0, Math.max(8, width - 7))}`));
    lines.push('');
    const barWidth = narrow ? Math.max(6, width - 29) : 25;
    for (const [label, outcome, hue] of [['YES', 'yes', '32'], ['NO', 'no', '35'], ['ABSTAIN', 'abstain', '33']] as const) {
      const value = state.totals[outcome], share = state.processed ? value / state.processed : 0;
      const amount = narrow ? compact(value) : number(value).padStart(13);
      lines.push(`${paint(hue, label.padEnd(8))} ${paint(hue, bar(share, barWidth))} ${pct(value, state.processed).padStart(6)}  ${amount}`);
    }
    lines.push('');
    lines.push(`${paint('36', bar(progress, Math.max(10, width - 9), '█', '░'))} ${(100 * progress).toFixed(1)}%`);
    lines.push(`${compact(state.processed)} / ${compact(plan.population)} released · batch ${state.batches}`);
    const spinner = ['◐', '◓', '◑', '◒'][pulse++ % 4];
    lines.push(state.remaining === 0 ? paint('32', '✓ Count complete') : paused ? paint('33', 'Ⅱ Paused') : `${paint('36', spinner!)} Next batch in ${waiting.toFixed(1)}s · about ${Math.ceil(remainingBatches * options.interval)}s remaining`);
    lines.push(paint('2', `${elapsed}s elapsed · ${compact(options.batchSize)} votes every ${options.interval}s`));
    const rows = process.stdout.rows || 40;
    const maximumCohorts = rows >= 38 ? 8 : rows >= 30 ? 4 : 0;
    if (maximumCohorts) {
      lines.push('');
      lines.push(paint('1', `FICTIONAL COHORTS · yes share of released votes`));
      const ranked = [...state.cohorts].sort((a, b) => (b.counted ? b.counts.yes / b.counted : 0) - (a.counted ? a.counts.yes / a.counted : 0));
      ranked.slice(0, maximumCohorts).forEach(c => lines.push(`${c.name.padEnd(25)} ${pct(c.counts.yes, c.counted).padStart(6)}  ${compact(c.counted)}`));
      if (maximumCohorts < 8) lines.push(paint('2', `Top ${maximumCohorts} shown; all 8 are saved in results.json.`));
    }
    lines.push('');
    const liveSummary = state.processed ? `${pct(state.totals.yes, state.processed)} yes, ${pct(state.totals.no, state.processed)} no, ${pct(state.totals.abstain, state.processed)} abstain. ${state.totals.yes > state.totals.no ? 'Yes currently leads no' : state.totals.no > state.totals.yes ? 'No currently leads yes' : 'Yes and no are tied'} among released votes.` : 'Waiting for the first batch. Explicit assumptions determine the result.';
    lines.push(...wrap(liveSummary, width));
    lines.push(paint('2', 'Aggregate simulation · not measured public opinion'));
    lines.push(paint('2', 'Space/P pause · Q save & quit · Ctrl+C stop'));
    process.stdout.write('\x1b[H' + lines.join('\n') + '\x1b[J');
  }

  function printBatch() {
    console.log(`[${state.batches}] ${number(state.processed)}/${number(plan.population)} · YES ${number(state.totals.yes)} (${pct(state.totals.yes, state.processed)}) · NO ${number(state.totals.no)} (${pct(state.totals.no, state.processed)}) · ABSTAIN ${number(state.totals.abstain)} (${pct(state.totals.abstain, state.processed)})`);
    console.log(summarize(plan, state));
  }

  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);
  if (interactive) {
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', input);
    process.stdout.write('\x1b[?1049h\x1b[?25l');
    render();
  } else {
    console.log(`HELIOS · ${number(plan.population)} SYNTHETIC VOTES\n${plan.proposal}\nSeed ${safeText(plan.seed)} · ${number(options.batchSize)} votes / ${options.interval}s\nModel assumptions: ${Object.entries(options.assumptions).map(([k,v]) => `${k}=${v}`).join(', ')}\nAggregate simulation; final counts are released in paced batches.\n`);
  }
  try {
    while (!cancelled && state.remaining > 0) {
      if (paused) { await delay(100); if (interactive) render(); continue; }
      const wait = nextTick - performance.now();
      if (wait > 0) { await delay(Math.min(wait, 100)); if (interactive) render(); continue; }
      stream.next(options.batchSize);
      if (interactive) render(); else printBatch();
      nextTick = performance.now() + options.interval * 1000;
      if (options.interval === 0) await delay(0);
    }
  } finally {
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    if (interactive) {
      process.stdin.removeListener('data', input); process.stdin.setRawMode(Boolean(originalRaw)); process.stdin.pause();
      process.stdout.write('\x1b[?25h\x1b[?1049l');
    }
  }
  const elapsed = (performance.now() - start) / 1000;
  const status = state.remaining === 0 ? 'complete' : 'cancelled';
  const saved = await saveResult(options, plan, state, started, elapsed, status);
  console.log(`\n${paint('1;36', status === 'complete' ? 'COUNT COMPLETE' : 'PARTIAL COUNT SAVED')} · ${number(state.processed)} represented votes\n`);
  console.log(`${paint('32', 'YES')} ${number(state.totals.yes)} (${pct(state.totals.yes, state.processed)})\n${paint('35', 'NO')} ${number(state.totals.no)} (${pct(state.totals.no, state.processed)})\n${paint('33', 'ABSTAIN')} ${number(state.totals.abstain)} (${pct(state.totals.abstain, state.processed)})\n`);
  console.log(saved.summary + '\n');
  console.log(`Results: ${saved.jsonPath}\nSummary: ${saved.summaryPath}`);
  return signalExit ? 130 : 0;
}

if ((import.meta as ImportMeta & { main?: boolean }).main || import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`Error: ${safeText(error instanceof Error ? error.message : String(error))}\nRun bun run votes:world --help for options.\n`);
    process.exitCode = 1;
  });
}
