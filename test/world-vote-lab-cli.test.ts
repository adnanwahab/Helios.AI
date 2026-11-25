import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../scripts/world-vote-lab/cli.ts', import.meta.url));

async function run(args: string[], stopAfterFirst = false) {
  const directory = await mkdtemp(join(tmpdir(), 'helios-world-vote-test-'));
  const start = performance.now();
  const child = spawn(process.execPath, ['run', cliPath, '--proposal', 'A voluntary pilot', '--plain', '--no-color', '--output', directory, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ticks: number[] = [], chunks: string[] = [], errors: string[] = [];
  let pending = '';
  child.stdout.on('data', chunk => {
    const text = chunk.toString(); chunks.push(text); pending += text;
    const lines = pending.split('\n'); pending = lines.pop()!;
    for (const line of lines) if (/^\[\d+\]/.test(line)) {
      ticks.push(performance.now() - start);
      if (stopAfterFirst && ticks.length === 1) child.kill('SIGINT');
    }
  });
  child.stderr.on('data', chunk => errors.push(chunk.toString()));
  const exit = await new Promise<number | null>((res, rej) => { child.on('error', rej); child.on('close', res); });
  const elapsed = performance.now() - start;
  try {
    const result = JSON.parse(await readFile(join(directory, 'results.json'), 'utf8'));
    const summary = await readFile(join(directory, 'summary.md'), 'utf8');
    return { exit, result, summary, ticks, elapsed, stdout: chunks.join(''), stderr: errors.join('') };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('CLI spaces real batch arrivals and completes without a final extra interval', async () => {
  const out = await run(['--voters', '101', '--batch-size', '40', '--interval', '0.08']);
  expect(out.exit).toBe(0);
  expect(out.ticks).toHaveLength(3);
  expect(out.ticks[0]).toBeGreaterThanOrEqual(70);
  for (let i = 1; i < out.ticks.length; i++) expect(out.ticks[i]! - out.ticks[i - 1]!).toBeGreaterThanOrEqual(65);
  expect(out.elapsed - out.ticks.at(-1)!).toBeLessThan(75);
  expect(out.result.status).toBe('complete');
  expect(out.result.processedVotes).toBe(101);
  expect(out.result.totals.yes + out.result.totals.no + out.result.totals.abstain).toBe(101);
  expect(out.summary).toContain('normal approximation');
  expect(out.stderr).toBe('');
}, 5000);

test('Ctrl+C saves a partial count and truthful summary', async () => {
  const out = await run(['--voters', '1000', '--batch-size', '100', '--interval', '0.08'], true);
  expect(out.exit).toBe(130);
  expect(out.result.status).toBe('cancelled');
  expect(out.result.processedVotes).toBeGreaterThan(0);
  expect(out.result.processedVotes).toBeLessThan(1000);
  expect(out.summary).toContain('still in progress');
  expect(out.result.remainingVotes + out.result.processedVotes).toBe(1000);
}, 5000);
