import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/vote-profile-lab/cli.ts", import.meta.url));
const dirs = new Set<string>();
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "helios-profile-votes-"));
  dirs.add(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  dirs.clear();
});
async function run(cwd: string, args: string[]) {
  const child = Bun.spawn({
    cmd: [process.execPath, cli, ...args],
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
  ]);
  return { stdout, stderr, code };
}
async function report(cwd: string, args: string[] = []) {
  const result = await run(cwd, ["--demo", "--fast", "--json", "--no-save", ...args]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

test("full default run accounts for exactly eight billion represented votes", async () => {
  const cwd = await temp();
  const r = await report(cwd);
  expect(r.synthetic).toBe(true);
  expect(r.completed).toBe(true);
  expect(r.modelVersion).toBe("weighted-preferences-v1");
  expect(r.config.population).toBe(8_000_000_000);
  expect(r.snapshot.samplesEvaluated).toBe(80_000);
  expect(r.snapshot.tally).toEqual({ yes: 4_145_200_000, no: 1_228_500_000, abstain: 2_626_300_000 });
  expect(r.totals.counted).toBe(8_000_000_000);
  expect(r.totals.remaining).toBe(0);
  expect(await readdir(cwd)).toEqual([]);
});

test("fixed seed and assumptions are independent of batch size, even with split profile weights", async () => {
  const cwd = await temp();
  const common = ["--population", "103", "--samples", "13", "--seed", "comparison"];
  const a = await report(cwd, [...common, "--batch-size", "7"]);
  const b = await report(cwd, [...common, "--batch-size", "103"]);
  expect(a.snapshot.tally).toEqual(b.snapshot.tally);
  expect(a.snapshot.cohorts).toEqual(b.snapshot.cohorts);
  expect(a.snapshot.counted).toBe(103);
  expect(a.snapshot.samplesEvaluated).toBe(13);
  expect(a.snapshot.cohorts.reduce((sum: number, c: { counted: number }) => sum + c.counted, 0)).toBe(103);
});

test("explicit assumptions, not proposal wording, affect the same fictional population", async () => {
  const cwd = await temp();
  const args = ["--population", "100000", "--samples", "1000", "--seed", "same"];
  const a = await report(cwd, [...args, "--bill", "Example one", "--benefit", "10"]);
  const b = await report(cwd, [...args, "--bill", "Reworded example", "--benefit", "10"]);
  const c = await report(cwd, [...args, "--bill", "Example one", "--benefit", "95"]);
  expect(a.snapshot.tally).toEqual(b.snapshot.tally);
  expect(c.snapshot.tally.yes).toBeGreaterThan(a.snapshot.tally.yes);
});

test("default reports are local under .data and include all three formats", async () => {
  const cwd = await temp();
  const result = await run(cwd, ["--demo", "--population", "31", "--samples", "7", "--batch-size", "10", "--fast", "--json"]);
  expect(result.code).toBe(0);
  const dir = join(cwd, ".data", "vote-profile-lab");
  const names = await readdir(dir);
  expect(names.length).toBe(3);
  const json = names.find(name => name.endsWith(".json"))!;
  expect(JSON.parse(await readFile(join(dir, json), "utf8"))).toEqual(JSON.parse(result.stdout));
  expect(names.some(name => name.endsWith(".md"))).toBe(true);
  const txt = names.find(name => name.endsWith(".txt"))!;
  expect(await readFile(join(dir, txt), "utf8")).toContain("31 represented votes");
});

test("invalid input fails before creating reports", async () => {
  const cwd = await temp();
  for (const args of [["--samples", "0"], ["--interval", "-1"], ["--benefit", "101"], ["--population", "11", "--samples", "12"]]) {
    const result = await run(cwd, ["--demo", ...args]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Error:");
  }
  expect(await readdir(cwd)).toEqual([]);
});

test("plain console reveals every batch and finishes with an explicit synthetic summary", async () => {
  const cwd = await temp();
  const result = await run(cwd, ["--demo", "--population", "11", "--samples", "3", "--batch-size", "4", "--fast", "--plain", "--no-save"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("batch 1/3 | 4/11 synthetic votes");
  expect(result.stdout).toContain("batch 2/3 | 8/11 synthetic votes");
  expect(result.stdout).toContain("batch 3/3 | 11/11 synthetic votes");
  expect(result.stdout).toContain("VOTING COMPLETE");
  expect(result.stdout).toContain("no real people's opinions were measured");
});
