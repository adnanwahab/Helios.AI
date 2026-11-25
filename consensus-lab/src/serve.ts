import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { chicagoDay } from "./cli.ts";

const {values} = parseArgs({options:{dir:{type:"string"}, port:{type:"string"}}, strict:true});
const directory = resolve(values.dir ?? join("out",chicagoDay()));
const port = Number(values.port ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be 1–65535.");
if (!await Bun.file(join(directory,"index.html")).exists()) throw new Error("No report in " + directory + ". Run bun run simulate first.");
const types:Record<string,string> = {"index.html":"text/html; charset=utf-8", "results.json":"application/json", "summary.csv":"text/csv; charset=utf-8", "votes.ndjson":"application/x-ndjson", "manifest.json":"application/json"};
const server = Bun.serve({hostname:"127.0.0.1", port, async fetch(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed",{status:405});
  const name = new URL(request.url).pathname.slice(1) || "index.html";
  if (!Object.hasOwn(types,name)) return new Response("Not found",{status:404});
  const file = Bun.file(join(directory,name));
  if (!await file.exists()) return new Response("Not found",{status:404});
  return new Response(request.method === "HEAD" ? null : file,{headers:{"content-type":types[name], "cache-control":"no-store", "x-content-type-options":"nosniff"}});
}});
console.log("Consensus report: " + server.url + " (Ctrl+C to stop)");
