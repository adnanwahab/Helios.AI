import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { simulate } from "./simulate.ts";
import { renderReport } from "./report.ts";

// Fixed synthetic example only. Never publish a user's local custom outputs.
const destination = resolve(process.argv[2] ?? "dist/consensus-lab/index.html");
await mkdir(dirname(destination), {recursive:true});
await writeFile(destination, renderReport(simulate({date:"2026-11-25",seed:"42",agentCount:100})));
console.log("Built synthetic Consensus Lab preview: " + destination);
