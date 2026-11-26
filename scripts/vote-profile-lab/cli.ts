#!/usr/bin/env bun
// @bun

// src/cli.ts
import { randomUUID } from "crypto";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { resolve, join } from "path";
import { createInterface } from "readline/promises";
import { setTimeout as sleep, setImmediate as yieldTurn } from "timers/promises";

// src/engine.ts
var MODEL_VERSION = "weighted-preferences-v1";
var MAX_SAMPLES = 1e6;
var ASSUMPTION_KEYS = [
  "benefit",
  "cost",
  "fairness",
  "freedom",
  "safeguards",
  "clarity"
];
var DEFAULT_ASSUMPTIONS = Object.freeze({
  benefit: 60,
  cost: 45,
  fairness: 60,
  freedom: 65,
  safeguards: 55,
  clarity: 60
});
var LENSES = [
  { id: "budgets", label: "Household budgets", boosts: [0, 2.3, 0, 0, 0, 0] },
  { id: "opportunity", label: "Opportunity", boosts: [2.3, 0, 0, 0, 0, 0] },
  { id: "autonomy", label: "Personal autonomy", boosts: [0, 0, 0, 2.3, 0, 0] },
  { id: "safeguards", label: "Risk & safeguards", boosts: [0, 0, 0, 0, 2.3, 0] },
  { id: "fairness", label: "Fair access", boosts: [0, 0, 2.3, 0, 0, 0] },
  { id: "public", label: "Public benefit", boosts: [1.1, 0, 0.6, 0, 0.6, 0] }
];
var REASON_LABELS = {
  benefit: "Benefit is too uncertain",
  cost: "Cost burden is too high",
  fairness: "Fair access needs work",
  freedom: "More personal choice needed",
  safeguards: "Stronger safeguards needed",
  clarity: "More clarity needed"
};
var YES_REASONS = {
  benefit: "The assumed benefits make this worth supporting.",
  cost: "The assumed cost burden feels manageable.",
  fairness: "The assumed access and distribution look fair enough.",
  freedom: "The assumed room for personal choice helps win me over.",
  safeguards: "The assumed safeguards address my main concern.",
  clarity: "The assumed clarity gives me enough confidence to support it."
};
var NO_REASONS = {
  benefit: "I need stronger assumed benefits before I support this.",
  cost: "The assumed cost burden is my main objection.",
  fairness: "The assumed distribution of benefits is not fair enough for me.",
  freedom: "I want more personal choice in these assumptions.",
  safeguards: "The assumed safeguards do not yet meet my preference.",
  clarity: "The assumed plan needs more clarity before I can support it."
};
var ABSTAIN_REASONS = {
  benefit: "I am undecided about whether the assumed benefits are enough.",
  cost: "I am weighing the assumed cost against the benefit.",
  fairness: "I am undecided about how fairly the assumed benefits are shared.",
  freedom: "I am undecided about the assumed balance of choice and rules.",
  safeguards: "I want to understand the assumed safeguards before deciding.",
  clarity: "I need a clearer assumed plan before deciding."
};
var emptyTally = () => ({ yes: 0, no: 0, abstain: 0 });
function seededRandom(seed) {
  let state = 2166136261;
  for (let i = 0;i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = state + 1831565813 >>> 0;
    let mixed = Math.imul(state ^ state >>> 15, 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}
function validateSimulationConfig(config) {
  if (!Number.isSafeInteger(config.population) || config.population < 1) {
    throw new Error("population must be a positive safe integer");
  }
  if (!Number.isSafeInteger(config.samples) || config.samples < 1 || config.samples > Math.min(config.population, MAX_SAMPLES)) {
    throw new Error(`samples must be an integer from 1 to min(population, ${MAX_SAMPLES})`);
  }
  if (typeof config.seed !== "string" || config.seed.trim().length === 0 || config.seed.length > 1000) {
    throw new Error("seed must be a nonempty string of at most 1000 characters");
  }
  for (const key of ASSUMPTION_KEYS) {
    const value = config.assumptions?.[key];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`${key} must be a finite number from 0 to 100`);
    }
  }
}

class VoteSimulation {
  config;
  random;
  baseWeight;
  remainder;
  quality;
  totals = emptyTally();
  cohortTotals = LENSES.map(({ id, label }) => ({
    id,
    label,
    tally: emptyTally(),
    counted: 0
  }));
  objectionTotals = {
    benefit: 0,
    cost: 0,
    fairness: 0,
    freedom: 0,
    safeguards: 0,
    clarity: 0
  };
  voices = [];
  counted = 0;
  evaluated = 0;
  active;
  constructor(config) {
    validateSimulationConfig(config);
    this.config = Object.freeze({ ...config, assumptions: Object.freeze({ ...config.assumptions }) });
    this.random = seededRandom(config.seed);
    this.baseWeight = Math.floor(config.population / config.samples);
    this.remainder = config.population % config.samples;
    this.quality = ASSUMPTION_KEYS.map((key) => (key === "cost" ? 100 - config.assumptions[key] : config.assumptions[key]) / 100);
  }
  get snapshot() {
    return {
      tally: { ...this.totals },
      counted: this.counted,
      population: this.config.population,
      samplesEvaluated: this.evaluated,
      samples: this.config.samples,
      cohorts: this.cohortTotals.map((cohort) => ({ ...cohort, tally: { ...cohort.tally } })),
      objections: ASSUMPTION_KEYS.map((id) => ({
        id,
        label: REASON_LABELS[id],
        votes: this.objectionTotals[id]
      })).sort((a, b) => b.votes - a.votes),
      recent: this.voices.map((voice) => ({ ...voice }))
    };
  }
  advanceTo(targetVotes) {
    if (!Number.isSafeInteger(targetVotes) || targetVotes < this.counted || targetVotes > this.config.population) {
      throw new Error("targetVotes must be a safe integer between the current count and population");
    }
    while (this.counted < targetVotes) {
      if (!this.active)
        this.active = this.nextProfile();
      const amount = Math.min(targetVotes - this.counted, this.active.remaining);
      const { vote, cohortIndex, objection } = this.active;
      this.totals[vote] += amount;
      const cohort = this.cohortTotals[cohortIndex];
      cohort.tally[vote] += amount;
      cohort.counted += amount;
      if (vote !== "yes")
        this.objectionTotals[objection] += amount;
      this.counted += amount;
      this.active.remaining -= amount;
      if (this.active.remaining === 0)
        this.active = undefined;
    }
    return this.snapshot;
  }
  nextProfile() {
    const index = this.evaluated;
    if (index >= this.config.samples)
      throw new Error("representative allocation exhausted");
    const weight = this.baseWeight + (index < this.remainder ? 1 : 0);
    const cohortIndex = Math.floor(this.random() * LENSES.length);
    const lens = LENSES[cohortIndex];
    const weights = ASSUMPTION_KEYS.map((_, i) => 0.4 + this.random() + lens.boosts[i]);
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    const utility = weights.reduce((sum, value, i) => sum + value * this.quality[i], 0) / weightSum;
    const threshold = 0.5 + (this.random() - 0.5) * 0.5;
    const personalBias = (this.random() - 0.5) * 0.16;
    const margin = utility - threshold + personalBias;
    const uncertaintyBand = 0.035 + (1 - this.quality[5]) * 0.12;
    const vote = margin > uncertaintyBand ? "yes" : margin < -uncertaintyBand ? "no" : "abstain";
    let objectionIndex = 0;
    let strengthIndex = 0;
    for (let i = 1;i < weights.length; i++) {
      if ((1 - this.quality[i]) * weights[i] > (1 - this.quality[objectionIndex]) * weights[objectionIndex]) {
        objectionIndex = i;
      }
      if (this.quality[i] * weights[i] > this.quality[strengthIndex] * weights[strengthIndex]) {
        strengthIndex = i;
      }
    }
    const objection = ASSUMPTION_KEYS[objectionIndex];
    const reason = vote === "yes" ? YES_REASONS[ASSUMPTION_KEYS[strengthIndex]] : vote === "no" ? NO_REASONS[objection] : ABSTAIN_REASONS[objection];
    this.voices.push({ id: index + 1, cohort: lens.label, vote, weight, reason });
    if (this.voices.length > 5)
      this.voices.shift();
    this.evaluated++;
    return { cohortIndex, vote, objection, remaining: weight };
  }
}

// src/options.ts
var DEMO_BILL = "A voluntary neighborhood childcare pilot with a capped budget and public review";
var DIMENSIONS = ["benefit", "cost", "fairness", "freedom", "safeguards", "clarity"];
function parseCount(raw, label) {
  const normalized = raw.replace(/[,_]/g, "").trim();
  const match = /^(\d+(?:\.\d*)?|\.\d+)([kmb])?$/i.exec(normalized);
  if (!match)
    throw new Error(`${label} must be a positive integer (suffixes k, m, b are accepted).`);
  const multiplier = { k: 1000, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() ?? ""] ?? 1;
  const value = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${label} must be a positive safe integer.`);
  return value;
}
function parseRating(raw, label) {
  if (!/^\d+(?:\.\d+)?$/.test(raw.trim()))
    throw new Error(`${label} must be a number from 0 to 100.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error(`${label} must be between 0 and 100.`);
  return value;
}
function parseArgs(argv) {
  const values = new Map;
  const booleans = new Set;
  const flags = new Set(["plain", "ascii", "no-color", "no-save", "json", "demo", "fast", "tune", "help"]);
  const keyed = new Set(["bill", "bill-file", "population", "samples", "batch-size", "interval", "seed", "output", ...DIMENSIONS]);
  for (let i = 0;i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--")
      continue;
    if (arg === "-h") {
      booleans.add("help");
      continue;
    }
    if (!arg.startsWith("--"))
      throw new Error(`Unexpected argument: ${arg}. Use --bill "your proposal".`);
    const equals = arg.indexOf("=");
    const key = arg.slice(2, equals < 0 ? undefined : equals);
    if (flags.has(key)) {
      if (equals >= 0)
        throw new Error(`--${key} does not take a value.`);
      booleans.add(key);
    } else if (keyed.has(key)) {
      const value = equals >= 0 ? arg.slice(equals + 1) : argv[++i];
      if (value === undefined || equals < 0 && value.startsWith("--"))
        throw new Error(`--${key} requires a value.`);
      values.set(key, value);
    } else
      throw new Error(`Unknown option: --${key}. Run --help to see the available options.`);
  }
  if (values.has("bill") && values.has("bill-file"))
    throw new Error("Choose either --bill or --bill-file.");
  const population = parseCount(values.get("population") ?? "8b", "Population");
  const samples = parseCount(values.get("samples") ?? String(Math.min(80000, population)), "Samples");
  if (samples > population || samples > 1e6)
    throw new Error("Samples must not exceed the population or 1,000,000.");
  const batchSize = parseCount(values.get("batch-size") ?? String(Math.min(250000000, population)), "Batch size");
  const intervalRaw = values.get("interval") ?? "3";
  if (!/^(\d+(?:\.\d*)?|\.\d+)$/.test(intervalRaw))
    throw new Error("Interval must be seconds between 0 and 3600.");
  const seconds = Number(intervalRaw);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600)
    throw new Error("Interval must be seconds between 0 and 3600.");
  const seed = values.get("seed") ?? "helios-2026";
  if (seed.trim().length === 0 || seed.length > 200)
    throw new Error("Seed must contain 1 to 200 characters, with at least one non-space character.");
  const assumptions = { ...DEFAULT_ASSUMPTIONS };
  for (const dimension of DIMENSIONS) {
    if (values.has(dimension))
      assumptions[dimension] = parseRating(values.get(dimension), dimension);
  }
  const json = booleans.has("json");
  const bill = values.get("bill") ?? (booleans.has("demo") && !values.has("bill-file") ? DEMO_BILL : undefined);
  if (bill !== undefined && (!bill.trim() || bill.length > 20000))
    throw new Error("Bill must contain 1 to 20,000 characters.");
  const output = values.get("output") ?? ".data/vote-profile-lab";
  if (!output.trim())
    throw new Error("Output directory cannot be empty.");
  return {
    bill: bill?.trim(),
    billFile: values.get("bill-file"),
    population,
    samples,
    batchSize,
    intervalMs: booleans.has("fast") ? 0 : Math.round(seconds * 1000),
    seed,
    assumptions,
    output,
    plain: booleans.has("plain") || json,
    ascii: booleans.has("ascii"),
    noColor: booleans.has("no-color") || json,
    noSave: booleans.has("no-save"),
    json,
    demo: booleans.has("demo"),
    tune: booleans.has("tune"),
    help: booleans.has("help")
  };
}
var HELP = `HELIOS / EIGHT BILLION \u2014 a fictional voting laboratory

Usage:
  bun run votes:8b                            Interactive bill prompt + live console
  bun run votes:8b --demo                      Run the included fictional scenario
  bun run votes:8b --bill "Your proposal"      Supply a proposal without prompting
  bun run votes:8b --demo --fast --json        Immediate machine-readable result

Pacing and model:
  --population 8b       Total represented votes (positive safe integer)
  --samples 80000       Weighted synthetic profiles (maximum 1,000,000)
  --batch-size 250m     Votes revealed in each batch
  --interval 3          Seconds between batches, including the first (0\u20133600)
  --fast                Set interval to zero
  --seed helios-2026    Repeatable fictional population
  --tune                Prompt for the six assumptions before starting
  --benefit N           Perceived benefit, 0\u2013100
  --cost N              Perceived burden, 0\u2013100 (higher means more burden)
  --fairness N          Perceived fairness, 0\u2013100
  --freedom N           Voluntariness/autonomy, 0\u2013100
  --safeguards N        Safeguards, 0\u2013100
  --clarity N           Clarity, 0\u2013100

Input and output:
  --bill-file PATH      Read a UTF-8 proposal from a file instead of --bill
  --output PATH        Directory for unique JSON, TXT and Markdown reports
  --no-save            Disable report files
  --plain              Append one progress line per batch (automatic for pipes)
  --json               Output only the final JSON object; no interactive prompt
  --ascii              Use ASCII symbols
  --no-color           Disable ANSI colors (also honors NO_COLOR)
  -h, --help           Show this help

Live controls: Space pause/resume \xB7 + faster \xB7 - slower \xB7 s snapshot \xB7 q stop
Ctrl-C stops safely and saves a partial report unless --no-save is set.

Defaults: 32 batches \xD7 3 seconds \u2248 96 seconds. Each of 80,000 profiles
represents 100,000 votes. This is weighted simulation, not eight billion
independent evaluations or a real poll. Bill text labels the scenario;
the six explicit assumptions drive decisions. No network or API key is needed.
`;

// src/report.ts
var countFormat = new Intl.NumberFormat("en-US");
var pct = (value) => `${value.toFixed(2)}%`;
var count = (value) => countFormat.format(value);
var metric = (votes, counted, population) => ({
  count: votes,
  percentOfCounted: counted === 0 ? null : 100 * votes / counted,
  percentOfPopulation: 100 * votes / population
});
var assumptionDescriptions = {
  benefit: "Expected benefit in the fictional model; higher favors support.",
  cost: "Perceived cost in the fictional model; higher increases resistance.",
  fairness: "Perceived fairness; higher favors support.",
  freedom: "Perceived freedom or voluntary participation; higher favors support.",
  safeguards: "Perceived protections and oversight; higher favors support.",
  clarity: "Perceived clarity of the proposal; higher favors support."
};
function buildReport(input) {
  const config = structuredClone(input.config);
  const snapshot = structuredClone(input.snapshot);
  const { tally, counted, population } = snapshot;
  return {
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    synthetic: true,
    generatedAt: new Date().toISOString(),
    startedAt: input.startedAt,
    status: input.status,
    completed: input.status === "completed" && counted === population,
    bill: input.bill,
    config,
    snapshot,
    pacing: {
      batchSize: input.batchSize,
      intervalMs: input.intervalMs,
      elapsedMs: Math.max(0, input.elapsedMs)
    },
    totals: {
      counted,
      remaining: population - counted,
      percentCounted: 100 * counted / population,
      yes: metric(tally.yes, counted, population),
      no: metric(tally.no, counted, population),
      abstain: metric(tally.abstain, counted, population)
    },
    methodology: "A seeded, fictional preference model evaluates representative profiles and assigns each an integer weight. " + "Weighted votes sum to the configured population; these are not individually simulated real people. " + "Bill text labels the scenario and is not interpreted by an LLM or language parser. " + "The six explicit assumptions and seeded profiles determine the votes. " + "Cohorts are invented preference lenses, not measured demographic groups. " + "Objections and sample voices are model-generated explanations. " + "These results are not polling, predictions, consent, signatures, or an actual public vote."
  };
}
function summarize(report) {
  const { totals, snapshot, config } = report;
  const bill = report.bill.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  const opening = report.completed ? `Completed the fictional vote on \u201C${bill}\u201D: ${count(totals.counted)} represented votes were counted using ${count(snapshot.samplesEvaluated)} weighted profiles.` : `${report.status === "stopped" ? "Stopped" : "Snapshot of"} the fictional vote on \u201C${bill}\u201D after ${count(totals.counted)} of ${count(config.population)} represented votes (${pct(totals.percentCounted)}), with ${count(totals.remaining)} remaining.`;
  const distribution = totals.counted > 0 ? `Of the counted votes, ${count(totals.yes.count)} voted yes (${pct(totals.yes.percentOfCounted)}), ${count(totals.no.count)} voted no (${pct(totals.no.percentOfCounted)}), and ${count(totals.abstain.count)} abstained (${pct(totals.abstain.percentOfCounted)}).` : "No votes have been counted yet, so support percentages are not available.";
  const unanimous = report.completed ? totals.yes.count === config.population ? "This configured model reached unanimous yes; that does not establish real-world agreement." : `This configured model did not reach unanimous yes: ${count(totals.no.count + totals.abstain.count)} represented votes were no or abstain.` : "This is a partial result, so it does not establish a final level of support.";
  const topReasons = snapshot.objections.filter((objection) => objection.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, 2);
  const concerns = topReasons.length > 0 ? `The leading modeled reasons among no and abstain votes were ${topReasons.map((reason) => `${reason.label.toLowerCase()} (${count(reason.votes)} represented votes)`).join(" and ")}.` : "";
  const explanation = "The six assumptions drive these synthetic results; the bill's wording is a label, and no real people's opinions were measured.";
  return [opening, distribution, unanimous, concerns, explanation].filter(Boolean).join(" ");
}
function mdCell(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mdText(value) {
  return mdCell(value).replace(/([*_[\]`#])/g, "\\$1");
}
function voteRow(label, value) {
  return `| ${label} | ${count(value.count)} | ${value.percentOfCounted === null ? "\u2014" : pct(value.percentOfCounted)} | ${pct(value.percentOfPopulation)} |`;
}
function toMarkdown(report) {
  const { snapshot, config, totals } = report;
  const lines = [
    "# HELIOS \u2014 Eight Billion Vote Lab",
    "",
    "> SYNTHETIC SIMULATION \u2014 weighted fictional profiles; not a poll or prediction.",
    "",
    "## Scenario",
    "",
    mdText(report.bill),
    "",
    `**Status:** ${report.completed ? "Completed" : report.status === "stopped" ? "Stopped \u2014 partial result" : "Snapshot \u2014 partial result"}`,
    "",
    mdText(summarize(report)),
    "",
    "## Vote summary",
    "",
    "| Choice | Represented votes | % of counted votes | % of configured population |",
    "| --- | ---: | ---: | ---: |",
    voteRow("Yes", totals.yes),
    voteRow("No", totals.no),
    voteRow("Abstain", totals.abstain),
    `| **Counted** | **${count(totals.counted)}** | **${totals.counted > 0 ? "100.00%" : "\u2014"}** | **${pct(totals.percentCounted)}** |`,
    `| Remaining | ${count(totals.remaining)} | \u2014 | ${pct(100 * totals.remaining / config.population)} |`,
    "",
    "Percentages in the first percentage column use only counted votes. The final column uses the full configured population, including votes not yet counted. Rounding may prevent displayed percentages from adding to exactly 100%.",
    "",
    "## Explicit model assumptions",
    "",
    "All scores run from 0 to 100. Changing the bill text alone does not change votes.",
    "",
    "| Assumption | Score | Meaning |",
    "| --- | ---: | --- |"
  ];
  for (const key of Object.keys(assumptionDescriptions)) {
    lines.push(`| ${key} | ${config.assumptions[key]} | ${assumptionDescriptions[key]} |`);
  }
  lines.push("", "## Fictional preference lenses", "", "These are model groupings, not real demographic estimates. Percent yes uses the counted votes in each lens.", "", "| Lens | Counted | Yes | No | Abstain | % yes within counted |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const cohort of snapshot.cohorts) {
    const tally = cohort.tally;
    lines.push(`| ${mdCell(cohort.label)} | ${count(cohort.counted)} | ${count(tally.yes)} | ${count(tally.no)} | ${count(tally.abstain)} | ${cohort.counted === 0 ? "\u2014" : pct(100 * tally.yes / cohort.counted)} |`);
  }
  lines.push("", "## Modeled objections", "", "Each represented no or abstain vote contributes to one primary model reason. These are generated explanations, not written comments from real people.", "", "| Primary model reason | Represented no or abstain votes |", "| --- | ---: |");
  const objections = snapshot.objections.filter((value) => value.votes > 0).sort((a, b) => b.votes - a.votes);
  for (const reason of objections)
    lines.push(`| ${mdCell(reason.label)} | ${count(reason.votes)} |`);
  if (objections.length === 0)
    lines.push("| No modeled objections counted | 0 |");
  lines.push("", "## Reproducibility", "", `- Model version: ${report.modelVersion}`, `- Schema version: ${report.schemaVersion}`, `- Seed: ${mdText(config.seed)}`, `- Configured represented population: ${count(config.population)}`, `- Representative profiles: ${count(config.samples)}`, `- Profiles evaluated so far: ${count(snapshot.samplesEvaluated)}`, `- Batch size: ${count(report.pacing.batchSize)} represented votes`, `- Current interval: ${report.pacing.intervalMs / 1000} seconds`, `- Elapsed time: ${(report.pacing.elapsedMs / 1000).toFixed(2)} seconds`, `- Started: ${report.startedAt}`, `- Report generated: ${report.generatedAt}`, "", "The seed, population, sample count, assumptions, and model version determine the final tally. Batch size and pacing change the reveal, not the completed result. The JSON report retains this configuration and the full aggregate snapshot.", "", "## Method and interpretation", "", report.methodology, "");
  return lines.join(`
`);
}

// src/ui.ts
var number = new Intl.NumberFormat("en-US");
var segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
function stripAnsi(value) {
  return String(value).replace(/(?:\u001b\]|\u009d)[\s\S]*?(?:\u0007|\u001b\\|\u009c|$)/g, "").replace(/\u001b[P^_X][\s\S]*?(?:\u001b\\|\u009c|$)/g, "").replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "").replace(/\u001b[ -/]*[@-~]/g, "");
}
function sanitize(value) {
  return stripAnsi(String(value)).replace(/[\r\n\t]+/g, " ").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "").replace(/\s+/g, " ").trim();
}
function graphemeWidth(value) {
  if (/^[\p{Mark}\u200d\ufe0e\ufe0f]+$/u.test(value))
    return 0;
  if (/\p{Emoji_Presentation}|\p{Regional_Indicator}|\ufe0f/u.test(value))
    return 2;
  const cp = value.codePointAt(0) ?? 0;
  return cp >= 4352 && (cp <= 4447 || cp === 9001 || cp === 9002 || cp >= 11904 && cp <= 42191 && cp !== 12351 || cp >= 44032 && cp <= 55203 || cp >= 63744 && cp <= 64255 || cp >= 65040 && cp <= 65049 || cp >= 65072 && cp <= 65135 || cp >= 65280 && cp <= 65376 || cp >= 65504 && cp <= 65510 || cp >= 131072 && cp <= 262141) ? 2 : 1;
}
function visibleWidth(value) {
  let width = 0;
  for (const { segment } of segmenter.segment(stripAnsi(value)))
    width += graphemeWidth(segment);
  return width;
}
function fit(value, width, ellipsis = "...") {
  if (width <= 0)
    return "";
  const safe = stripAnsi(String(value)).replace(/[\r\n\t]/g, " ").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "");
  if (visibleWidth(safe) <= width)
    return safe;
  const suffix = width >= ellipsis.length ? ellipsis : "";
  let result = "";
  let used = 0;
  for (const { segment } of segmenter.segment(safe)) {
    const next = graphemeWidth(segment);
    if (used + next > width - suffix.length)
      break;
    result += segment;
    used += next;
  }
  return result + suffix;
}
function pad(value, width) {
  return value + " ".repeat(Math.max(0, width - visibleWidth(value)));
}
function compact(value) {
  if (value >= 1e9)
    return `${(value / 1e9).toFixed(2).replace(/\.00$/, "")}B`;
  if (value >= 1e6)
    return `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1000)
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return number.format(value);
}
function percent(value, total) {
  return `${(total > 0 ? 100 * value / total : 0).toFixed(1)}%`;
}
function duration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  if (seconds >= 60)
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${seconds}s`;
}
function theme(options) {
  const enabled = options.color !== false;
  const codes = {
    cyan: "\x1B[38;5;87m",
    violet: "\x1B[38;5;141m",
    green: "\x1B[38;5;84m",
    red: "\x1B[38;5;210m",
    amber: "\x1B[38;5;221m",
    white: "\x1B[38;5;255m",
    muted: "\x1B[38;5;245m"
  };
  return {
    ink: (text, tone, bold = false) => enabled ? `${bold ? "\x1B[1m" : ""}${codes[tone]}${text}\x1B[0m` : text,
    glyph: options.ascii ? { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|", ml: "+", mr: "+", full: "#", empty: ".", dot: "*", sep: "|" } : { tl: "\u256D", tr: "\u256E", bl: "\u2570", br: "\u256F", h: "\u2500", v: "\u2502", ml: "\u251C", mr: "\u2524", full: "\u2501", empty: "\u2500", dot: "\u25CF", sep: "\xB7" }
  };
}
function stateLabel(state) {
  if (state.stopped)
    return "STOPPED";
  if (state.done)
    return "COMPLETE";
  if (state.paused)
    return "PAUSED";
  return "LIVE";
}
function renderDashboard(state, options = {}) {
  const width = Math.max(8, Math.floor(options.width ?? 100));
  const height = Math.max(1, Math.floor(options.height ?? 32));
  const { ink, glyph: g } = theme(options);
  const inner = Math.max(1, width - 6);
  const status = stateLabel(state);
  const total = state.yes + state.no + state.abstain;
  const statusTone = state.paused ? "amber" : state.stopped ? "red" : "green";
  const line = (value = "", tone) => {
    const content = tone ? ink(fit(value, inner), tone) : value;
    return `${ink(g.v, "muted")}  ${pad(content, inner)}  ${ink(g.v, "muted")}`;
  };
  const plainLine = (value = "", tone = "white") => line(value, tone);
  const rule = ink(g.ml + g.h.repeat(width - 2) + g.mr, "muted");
  const top = ink(g.tl + g.h.repeat(width - 2) + g.tr, "muted");
  const bottom = ink(g.bl + g.h.repeat(width - 2) + g.br, "muted");
  if (width < 34 || height < 14) {
    const lines = [
      "HELIOS / EIGHT BILLION",
      `SYNTHETIC | ${status}`,
      ...state.notice ? [sanitize(state.notice)] : [],
      `${compact(state.counted)} / ${compact(state.population)} counted`,
      `YES ${compact(state.yes)}  ${percent(state.yes, total)}`,
      `NO ${compact(state.no)}  ${percent(state.no, total)}`,
      `ABSTAIN ${compact(state.abstain)}  ${percent(state.abstain, total)}`,
      `${number.format(state.samples)} weighted profiles`,
      `Batch ${state.batch}/${state.batches} | ETA ${duration(state.remainingMs)}`,
      "Bill labels the toy assumptions.",
      "Space pause | +/- speed",
      "s save | q stop"
    ];
    return lines.slice(0, height).map((entry, index) => ink(fit(entry, width), index < 2 ? "cyan" : "white")).join(`
`);
  }
  const shareBar = (barWidth) => {
    if (total === 0)
      return ink(g.empty.repeat(barWidth), "muted");
    const yesWidth = Math.min(barWidth, Math.round(state.yes / total * barWidth));
    const noWidth = Math.min(barWidth - yesWidth, Math.round(state.no / total * barWidth));
    const monochrome = options.color === false;
    return ink((monochrome ? "Y" : g.full).repeat(yesWidth), "green") + ink((monochrome ? "N" : g.full).repeat(noWidth), "red") + ink((monochrome ? "." : g.full).repeat(barWidth - yesWidth - noWidth), "amber");
  };
  const progressBar = () => {
    const complete = Math.min(inner, Math.max(0, Math.round(state.counted / Math.max(1, state.population) * inner)));
    return ink(g.full.repeat(complete), "cyan") + ink(g.empty.repeat(inner - complete), "muted");
  };
  const assumptions = Object.entries(state.assumptions).map(([key, value]) => `${key[0].toUpperCase() + key.slice(1)} ${value}`);
  const footer = inner >= 65 ? [plainLine("SPACE pause/resume   +/- speed   S save snapshot   Q stop", "muted")] : [plainLine("SPACE pause/resume  +/- speed", "muted"), plainLine("S save snapshot    Q stop", "muted")];
  if (state.notice)
    footer.unshift(plainLine(sanitize(state.notice), "amber"));
  if (width < 76 || height < 23) {
    const rows = [
      top,
      plainLine("HELIOS / EIGHT BILLION", "cyan"),
      plainLine(`SYNTHETIC ${g.sep} ${compact(state.samples)} profiles ${g.sep} ${status}`, "violet"),
      plainLine(`BILL ${sanitize(state.bill)}`),
      plainLine("Toy assumptions drive these votes.", "muted"),
      rule
    ];
    for (const [label, count, tone] of [["YES", state.yes, "green"], ["NO", state.no, "red"], ["ABSTAIN", state.abstain, "amber"]]) {
      const right = percent(count, total);
      const exact = number.format(count);
      const left = fit(`${label.padEnd(7)} ${exact.length + 9 + right.length <= inner ? exact : compact(count)}`, inner - right.length - 1);
      rows.push(line(ink(pad(left, Math.max(0, inner - right.length)) + right, tone)));
    }
    rows.push(line(shareBar(inner)), plainLine(`${compact(state.counted)} / ${compact(state.population)} ${g.sep} ${percent(state.counted, state.population)} counted`), line(progressBar()));
    const available = height - rows.length - footer.length - 2;
    if (available >= 1)
      rows.push(plainLine(`Batch ${state.batch}/${state.batches} ${g.sep} ETA ${duration(state.remainingMs)}`, "muted"));
    if (available >= 2)
      rows.push(plainLine(`${compact(state.batchSize)} every ${(state.intervalMs / 1000).toFixed(1)}s ${g.sep} next ${state.paused ? "paused" : state.done || state.stopped ? "--" : duration(state.nextBatchMs ?? state.intervalMs)}`, "muted"));
    if (available >= 4) {
      rows.push(plainLine(assumptions.slice(0, 3).join("  "), "violet"));
      rows.push(plainLine(assumptions.slice(3).join("  "), "violet"));
    }
    rows.push(rule, ...footer, bottom);
    if (rows.length <= height)
      return rows.join(`
`);
    return [...rows.slice(0, height - footer.length - 1), ...footer, bottom].join(`
`);
  }
  const heading = "HELIOS / EIGHT BILLION";
  const statusText = fit(`${g.dot} ${status}  ${g.sep}  BATCH ${state.batch}/${state.batches}`, inner - heading.length - 1);
  const rows = [
    top,
    line(ink(heading, "cyan", true) + " ".repeat(Math.max(1, inner - heading.length - statusText.length)) + ink(statusText, statusTone, true)),
    plainLine(`SYNTHETIC ${g.sep} ${number.format(state.samples)} weighted profiles ${g.sep} Seed ${sanitize(state.seed)}`, "violet"),
    rule,
    plainLine(`BILL  ${sanitize(state.bill)}`),
    plainLine("Bill text labels this scenario; model assumptions drive votes.", "muted"),
    plainLine()
  ];
  const column = Math.floor(inner / 3);
  const tallyCells = [
    { name: "YES", count: state.yes, tone: "green" },
    { name: "NO", count: state.no, tone: "red" },
    { name: "ABSTAIN", count: state.abstain, tone: "amber" }
  ];
  rows.push(line(tallyCells.map((cell) => ink(pad(`${cell.name}  ${percent(cell.count, total)}`, column), cell.tone, true)).join("")));
  rows.push(line(tallyCells.map((cell) => ink(pad(number.format(cell.count), column), "white", true)).join("")));
  rows.push(line(shareBar(inner)));
  rows.push(plainLine("Shares of counted votes; abstentions remain in the denominator.", "muted"));
  rows.push(plainLine());
  const countLabel = `${number.format(state.counted)} / ${number.format(state.population)} counted`;
  const progress = percent(state.counted, state.population);
  rows.push(line(ink(pad(countLabel, inner - progress.length), "white") + ink(progress, "cyan", true)), line(progressBar()));
  rows.push(plainLine(`${compact(state.batchSize)} every ${(state.intervalMs / 1000).toFixed(1)}s  ${g.sep}  Next ${state.paused ? "paused" : state.done || state.stopped ? "--" : duration(state.nextBatchMs ?? state.intervalMs)}  ${g.sep}  Elapsed ${duration(state.elapsedMs)}  ${g.sep}  ETA ${state.paused ? "paused" : duration(state.remainingMs)}`, "muted"));
  rows.push(plainLine(`MODEL /100  ${assumptions.slice(0, 3).join("  ")}`, "violet"));
  rows.push(plainLine(`            ${assumptions.slice(3).join("  ")}`, "violet"));
  let space = height - rows.length - footer.length - 2;
  if (space >= 4 && state.cohorts.length) {
    rows.push(plainLine(), plainLine("PREFERENCE LENSES / FICTIONAL PROFILES", "cyan"));
    space -= 2;
    const shown = Math.min(state.cohorts.length, Math.max(1, space - (space > 8 ? 4 : 0)));
    const nameWidth = Math.min(26, Math.floor(inner * 0.32));
    const barWidth = Math.max(8, inner - nameWidth - 23);
    for (const cohort of state.cohorts.slice(0, shown)) {
      const count = cohort.yes + cohort.no + cohort.abstain;
      const ratio = count > 0 ? cohort.yes / count : 0;
      const fill = Math.round(ratio * barWidth);
      const label = pad(fit(cohort.name, nameWidth - 1), nameWidth);
      rows.push(line(ink(label, "white") + ink(g.full.repeat(fill), "green") + ink(g.empty.repeat(barWidth - fill), "muted") + ink(`  ${percent(cohort.yes, count).padStart(6)} yes`, "green")));
      space--;
    }
  }
  if (space >= 3 && state.voices.length) {
    const voice = state.voices[state.voices.length - 1];
    rows.push(plainLine(), plainLine(`SYNTHETIC VOICE ${g.sep} ${sanitize(voice.name)} ${g.sep} ${sanitize(voice.vote).toUpperCase()} ${g.sep} represents ${compact(voice.weight)}`, "cyan"), plainLine(`"${sanitize(voice.text)}"`, "muted"));
    space -= 3;
  }
  if (space >= 2 && state.objections.length) {
    const objection = state.objections[0];
    rows.push(plainLine(), plainLine(`Leading model concern: ${sanitize(objection.name)} (${compact(objection.count)} weighted votes)`, "amber"));
  }
  rows.push(rule, ...footer, bottom);
  return rows.join(`
`);
}
function renderWelcome(options = {}) {
  const width = Math.max(8, Math.floor(options.width ?? 100));
  const { ink, glyph: g } = theme(options);
  const lines = [
    ink(fit("HELIOS / EIGHT BILLION", width), "cyan", true),
    ink(g.h.repeat(Math.min(width, 70)), "muted"),
    ink(fit("One proposal. Eight billion simulated votes. Watch the count unfold.", width), "white"),
    ink(fit("Default model: 80,000 fictional profiles represent 8 billion votes.", width), "violet"),
    ink(fit("Your model assumptions drive the vote; bill text is a scenario label.", width), "muted"),
    ink(fit("Default: 250 million votes every 3 seconds, for about 96 seconds.", width), "muted")
  ];
  return lines.slice(0, Math.max(1, options.height ?? lines.length)).join(`
`);
}
function renderPlainProgress(state) {
  const total = state.yes + state.no + state.abstain;
  return `[${stateLabel(state)}] batch ${state.batch}/${state.batches} | ${number.format(state.counted)}/${number.format(state.population)} synthetic votes (${percent(state.counted, state.population)}) | YES ${number.format(state.yes)} (${percent(state.yes, total)}) | NO ${number.format(state.no)} (${percent(state.no, total)}) | ABSTAIN ${number.format(state.abstain)} (${percent(state.abstain, total)}) | ETA ${state.paused ? "paused" : duration(state.remainingMs)}`;
}

// src/cli.ts
var terminalSafe = (text) => text.split(`
`).map(sanitize).join(`
`);

class PromptCancelled extends Error {
}
async function promptForScenario(options, color) {
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (options.billFile) {
    if ((await stat(options.billFile)).size > 1e5)
      throw new Error("Bill file is too large; use at most 20,000 characters.");
    options.bill = (await readFile(options.billFile, "utf8")).trim();
    if (!options.bill || options.bill.length > 20000)
      throw new Error("Bill file must contain 1 to 20,000 characters.");
  }
  if (!options.bill && (!terminal || options.json)) {
    throw new Error('Provide --bill "your proposal", --bill-file PATH, or --demo when running without a terminal.');
  }
  const needsPrompt = !options.bill || options.tune;
  if (!needsPrompt)
    return options.bill;
  if (!terminal || options.json)
    throw new Error("--tune needs an interactive terminal. Use the six rating flags in scripts.");
  process.stdout.write(renderWelcome({ width: process.stdout.columns || 80, color, ascii: options.ascii }) + `

`);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const abort = new AbortController;
  const cancel = () => abort.abort();
  readline.on("SIGINT", cancel);
  readline.on("close", cancel);
  process.on("SIGTERM", cancel);
  const ask = (question) => readline.question(question, { signal: abort.signal });
  try {
    while (!options.bill) {
      const value = (await ask(`  What proposal should this world vote on?
  > `)).trim();
      if (value && value.length <= 20000)
        options.bill = value;
      else
        process.stdout.write(`  Enter a proposal with 1 to 20,000 characters.
`);
    }
    process.stdout.write(`
  Bill text names the scenario. These explicit assumptions drive the votes:
`);
    process.stdout.write("  " + DIMENSIONS.map((key) => `${key} ${options.assumptions[key]}`).join("  \xB7  ") + `
`);
    process.stdout.write(`  Ratings are 0\u2013100. Higher cost means more burden; higher other ratings help.

`);
    const tune = options.tune || /^(y|yes)$/i.test((await ask("  Tune the assumptions before voting? [y/N] ")).trim());
    if (tune) {
      for (const key of DIMENSIONS) {
        for (;; ) {
          const answer = (await ask(`  ${key} [${options.assumptions[key]}]: `)).trim();
          if (!answer)
            break;
          try {
            options.assumptions[key] = parseRating(answer, key);
            break;
          } catch (error) {
            process.stdout.write(`  ${terminalSafe(error.message)}
`);
          }
        }
      }
    }
    return options.bill;
  } catch (error) {
    if (abort.signal.aborted)
      throw new PromptCancelled;
    throw error;
  } finally {
    readline.removeListener("SIGINT", cancel);
    readline.removeListener("close", cancel);
    process.removeListener("SIGTERM", cancel);
    readline.close();
  }
}
async function saveReport(report, directory, name) {
  const base = join(directory, name);
  const contents = [JSON.stringify(report, null, 2) + `
`, summarize(report) + `
`, toMarkdown(report)];
  const paths = [base + ".json", base + ".txt", base + ".md"];
  for (let i = 0;i < paths.length; i++)
    await writeFile(paths[i], contents[i], { encoding: "utf8", flag: "wx" });
  return paths;
}
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== "dumb" && !options.plain);
  const color = Boolean(process.stdout.isTTY && !options.noColor && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb");
  const bill = await promptForScenario(options, color);
  const config = {
    population: options.population,
    samples: options.samples,
    seed: options.seed,
    assumptions: options.assumptions
  };
  const simulation = new VoteSimulation(config);
  const outputDirectory = resolve(options.output);
  if (!options.noSave)
    await mkdir(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const started = performance.now();
  const batches = Math.ceil(config.population / options.batchSize);
  let intervalMs = options.intervalMs;
  let deadline = started + intervalMs;
  let nextWhilePaused = intervalMs;
  let paused = false;
  let stopped = false;
  let interrupted = false;
  let batch = 0;
  let snapshot = simulation.snapshot;
  let snapshotRequested = false;
  let snapshotNumber = 0;
  let notice = "";
  let lastFrame = "";
  let raw = false;
  let inAlternateScreen = false;
  const previousRaw = Boolean(process.stdin.isRaw);
  const requestStop = (signal = false) => {
    stopped = true;
    interrupted ||= signal;
  };
  const onSignal = () => requestStop(true);
  const onEnd = () => requestStop();
  const onKey = (data) => {
    const key = data.toString();
    if (key === "\x03") {
      requestStop(true);
      return;
    }
    if (key.length !== 1)
      return;
    if (key === "q" || key === "Q") {
      requestStop();
      return;
    }
    if (key === " ") {
      const now = performance.now();
      if (paused) {
        paused = false;
        deadline = now + nextWhilePaused;
      } else {
        paused = true;
        nextWhilePaused = Math.max(0, deadline - now);
      }
      return;
    }
    if (key === "+" || key === "=" || key === "-") {
      intervalMs = key === "-" ? Math.min(3600000, intervalMs === 0 ? 250 : intervalMs * 2) : intervalMs <= 50 ? 0 : Math.max(50, Math.round(intervalMs / 2));
      if (paused)
        nextWhilePaused = intervalMs;
      else
        deadline = performance.now() + intervalMs;
      notice = `Pacing: ${(intervalMs / 1000).toFixed(2)} seconds per batch`;
      return;
    }
    if (key.toLowerCase() === "s") {
      if (options.noSave)
        notice = "Saving is disabled by --no-save.";
      else
        snapshotRequested = true;
    }
  };
  const state = () => {
    const now = performance.now();
    const nextBatchMs = paused ? nextWhilePaused : Math.max(0, deadline - now);
    return {
      bill,
      seed: config.seed,
      population: config.population,
      counted: snapshot.counted,
      ...snapshot.tally,
      batch,
      batches,
      batchSize: options.batchSize,
      intervalMs,
      remainingMs: snapshot.counted === config.population ? 0 : Math.max(0, batches - batch - 1) * intervalMs + nextBatchMs,
      nextBatchMs,
      elapsedMs: now - started,
      paused,
      done: snapshot.counted === config.population,
      stopped,
      samples: config.samples,
      samplesEvaluated: snapshot.samplesEvaluated,
      assumptions: { ...config.assumptions },
      cohorts: snapshot.cohorts.map((cohort) => ({ name: cohort.label, ...cohort.tally })),
      voices: snapshot.recent.map((voice) => ({ name: `Profile ${voice.id.toLocaleString("en-US")} \xB7 ${voice.cohort}`, vote: voice.vote, text: voice.reason, weight: voice.weight })),
      objections: snapshot.objections.filter((reason) => reason.votes > 0).map((reason) => ({ name: reason.label, count: reason.votes })),
      notice
    };
  };
  const report = (status) => buildReport({
    bill,
    config,
    snapshot,
    status,
    startedAt,
    elapsedMs: performance.now() - started,
    batchSize: options.batchSize,
    intervalMs
  });
  const draw = (force = false) => {
    if (!tty)
      return;
    const frame = renderDashboard(state(), {
      width: process.stdout.columns || 100,
      height: Math.max(1, (process.stdout.rows || 32) - 1),
      color,
      ascii: options.ascii
    });
    if (force || frame !== lastFrame) {
      process.stdout.write("\x1B[H\x1B[0J" + frame);
      lastFrame = frame;
    }
  };
  const cleanup = () => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.stdin.removeListener("data", onKey);
    process.stdin.removeListener("end", onEnd);
    if (raw) {
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      raw = false;
    }
    if (inAlternateScreen) {
      process.stdout.write("\x1B[0m\x1B[?25h\x1B[?1049l");
      inAlternateScreen = false;
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    if (tty) {
      process.stdin.setRawMode(true);
      raw = true;
      process.stdin.resume();
      process.stdin.on("data", onKey);
      process.stdin.on("end", onEnd);
      process.stdout.write("\x1B[?1049h\x1B[?25l");
      inAlternateScreen = true;
      draw(true);
    } else if (!options.json) {
      process.stdout.write(renderWelcome({ width: 88, color: false, ascii: options.ascii }) + `
`);
      process.stdout.write(`Proposal: ${sanitize(bill)}
`);
      process.stdout.write(`Assumptions: ${DIMENSIONS.map((key) => `${key}=${config.assumptions[key]}`).join(" \xB7 ")}
`);
      process.stdout.write(`${batches.toLocaleString("en-US")} batches, ${(intervalMs / 1000).toFixed(2)}s between batches. Seed: ${sanitize(config.seed)}

`);
    }
    while (!stopped && snapshot.counted < config.population) {
      if (snapshotRequested) {
        snapshotRequested = false;
        const name = `vote-${runId}-snapshot-${++snapshotNumber}`;
        try {
          await saveReport(report("snapshot"), outputDirectory, name);
          notice = `Snapshot ${snapshotNumber} saved \xB7 ${snapshot.counted.toLocaleString("en-US")} votes`;
        } catch (error) {
          notice = `Snapshot could not be saved: ${error.message}`;
        }
      }
      if (!paused && performance.now() >= deadline) {
        const amount = Math.min(options.batchSize, config.population - snapshot.counted);
        snapshot = simulation.advanceTo(snapshot.counted + amount);
        batch += 1;
        deadline = performance.now() + intervalMs;
        if (!tty && !options.json)
          process.stdout.write(renderPlainProgress(state()) + `
`);
      }
      draw();
      if (snapshot.counted < config.population && !stopped) {
        if (!paused && intervalMs === 0)
          await yieldTurn();
        else
          await sleep(paused ? 80 : Math.min(80, Math.max(1, deadline - performance.now())));
      }
    }
    draw(true);
  } finally {
    cleanup();
  }
  const final = report(snapshot.counted === config.population ? "completed" : "stopped");
  if (options.json)
    process.stdout.write(JSON.stringify(final, null, 2) + `
`);
  else {
    if (tty)
      process.stdout.write(renderDashboard(state(), { width: process.stdout.columns || 100, height: Math.max(1, (process.stdout.rows || 32) - 1), color, ascii: options.ascii }) + `
`);
    process.stdout.write(`
` + (final.completed ? "VOTING COMPLETE" : "VOTING STOPPED \u2014 PARTIAL RESULT") + `

`);
    process.stdout.write(terminalSafe(summarize(final)) + `
`);
  }
  if (!options.noSave) {
    try {
      const paths = await saveReport(final, outputDirectory, `vote-${runId}-${final.status}`);
      if (!options.json)
        process.stdout.write(`
Saved reports:
` + paths.map((path) => "  " + sanitize(path)).join(`
`) + `
`);
    } catch (error) {
      process.stderr.write(`
Could not save reports: ${terminalSafe(error.message)}
The result above is still available.
`);
      process.exitCode = 1;
    }
  }
  if (interrupted && !process.exitCode)
    process.exitCode = 130;
}
if (import.meta.main) {
  main().catch((error) => {
    if (error instanceof PromptCancelled) {
      process.stderr.write(`
Cancelled before voting started.
`);
      process.exitCode = 130;
    } else {
      process.stderr.write(`Error: ${terminalSafe(error.message)}
Run bun run votes:8b --help for usage.
`);
      process.exitCode = 1;
    }
  });
}
export {
  main
};
