import { parseArgs } from "node:util";
import { mkdir, rename, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { simulate, validateBills } from "./simulate.ts";
import { renderReport } from "./report.ts";
import { summaryCSV, votesNDJSON } from "./export.ts";

export function chicagoDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({args, options: {
    date: {type:"string"}, seed: {type:"string"}, agents: {type:"string"}, bills: {type:"string"},
    out: {type:"string"}, quiet: {type:"boolean"}, help: {type:"boolean", short:"h"}
  }, strict:true, allowPositionals:false});
  if (values.help) {
    console.log([
      "Helios Consensus Lab — synthetic scenarios, never real ballots",
      "", "bun run simulate [options]", "",
      "  --date YYYY-MM-DD     Simulation day (default: today in America/Chicago)",
      "  --seed TEXT          Repeatable random seed (default: helios:<date>)",
      "  --agents NUMBER      Synthetic population, 4–2000 (default: 100)",
      "  --bills FILE.json    Today's authored bill batch (see data/bills.example.json)",
      "  --out DIRECTORY      Destination (default: out/<date>)",
      "  --quiet              Suppress terminal summary",
      "  --help               Show this help",
      "", "Defaults use six fictional example proposals, not a live legislative feed.",
      "Custom input must include proposal text plus explicit model assumptions.",
      "Writes index.html, results.json, votes.ndjson, summary.csv, and manifest.json.",
      "No API keys, external dependencies, model API calls, or database writes."
    ].join("\n"));
    return;
  }
  const date = values.date ?? chicagoDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
    throw new Error("--date must be a valid calendar day in YYYY-MM-DD form.");
  }
  const agents = values.agents === undefined ? 100 : Number(values.agents);
  if (!Number.isInteger(agents) || agents < 4 || agents > 2000) throw new Error("--agents must be an integer from 4 to 2000.");
  const seed = values.seed ?? "helios:" + date;
  if (seed.length < 1 || seed.length > 256) throw new Error("--seed must be 1–256 characters.");
  let bills;
  if (values.bills) {
    const file = resolve(values.bills);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw new Error("Bill input file not found: " + values.bills);
    if (info.size > 10_000_000) throw new Error("Bill input exceeds the 10 MB limit.");
    bills = validateBills(JSON.parse(await readFile(file,"utf8")));
  }
  const result = simulate({date, seed, agentCount:agents, bills});
  const output = resolve(values.out ?? join("out", date));
  await mkdir(output, {recursive:true});
  const files: Record<string,string> = {
    "index.html": renderReport(result),
    "results.json": JSON.stringify(result, null, 2) + "\n",
    "votes.ndjson": votesNDJSON(result),
    "summary.csv": summaryCSV(result)
  };
  const manifest = {
    schemaVersion:"1.0.0", synthetic:true, date, seed, modelVersion:result.meta.modelVersion,
    input: values.bills ? "user-supplied-bill-batch" : "fictional-example-bills",
    agentCount:agents, billCount:result.bills.length,
    files: Object.entries(files).map(([name, contents]) => ({name,bytes:Buffer.byteLength(contents),sha256:createHash("sha256").update(contents).digest("hex")}))
  };
  files["manifest.json"] = JSON.stringify(manifest,null,2) + "\n";
  for (const [name,contents] of Object.entries(files)) {
    const destination = join(output,name), temp = destination + ".tmp-" + process.pid;
    await writeFile(temp,contents);
    await rename(temp,destination);
  }
  if (!values.quiet) {
    console.log("\nHelios Consensus Lab • " + date + " • seed " + seed);
    console.log(agents + " synthetic agents × " + result.bills.length + " bills × " + result.stages.length + " stages");
    console.log("Modeled scenarios only; results do not estimate real public opinion.\n");
    for (const bill of result.bills) {
      const first = bill.snapshots[0].metrics, last = bill.snapshots.at(-1)!.metrics;
      console.log(bill.id + "  " + bill.title);
      console.log("  Support " + first.support + "/" + first.eligible + " → " + last.support + "/" + last.eligible + "; oppose " + last.oppose + "; abstain " + last.abstain + "; absent " + last.absent);
    }
    console.log("\nOpen " + join(output,"index.html") + " in a browser, or:");
    console.log("  bun run serve --dir " + JSON.stringify(output));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error("Simulation failed: " + error.message); process.exitCode = 1; });
}
