#!/usr/bin/env node
import {workerConfig,createMiniSymphonyWorker} from '../src/mini-symphony-worker.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Mini Symphony research worker\n\nUsage: node scripts/mini-symphony-worker.mjs [--once] [--demo]\n\nRequired environment:\n  HELIOS_RESEARCH_API_BASE_URL   API origin (HTTPS, or local loopback HTTP)\n  HELIOS_RESEARCH_ROOM_ID        Shared room ID from /research?room=...\n  HELIOS_RESEARCH_WORKER_TOKEN   Server-only worker token, at least 32 characters\n  OPENAI_API_KEY                 Required for real research\n  HELIOS_RESEARCH_MODEL          Available Responses model supporting web search\n\nOptional environment:\n  HELIOS_RESEARCH_CONCURRENCY    1–20 concurrent lanes (default 2)\n  HELIOS_RESEARCH_MAX_TASKS      1–1000 claimed tasks per process (default 100)\n  HELIOS_RESEARCH_TIMEOUT_MS     1000–240000 (default 120000)\n  HELIOS_RESEARCH_POLL_MS        1000–60000 (default 5000)\n  HELIOS_RESEARCH_WORKER_ID      Stable operator label; otherwise random per process\n\n--once claims at most one task and exits, including when the queue is paused.\n--demo produces clearly marked synthetic output and permits only loopback APIs.\nSIGINT/SIGTERM stop new claims, cancel current requests, and record interruptions.\nProvider failure pauses dispatch; the room owner reviews and retries explicitly.\nTask limits reset if the process restarts; configure spending limits with your provider.`);
  process.exit(0);
}
if (args.some(arg=>!['--once','--demo'].includes(arg))) {
  console.error('Unknown option. Run with --help.'); process.exit(1);
}
const stop = new AbortController();
process.once('SIGINT',()=>stop.abort());
process.once('SIGTERM',()=>stop.abort());
try {
  const config = workerConfig(process.env,{demo:args.includes('--demo'),once:args.includes('--once')});
  const worker = createMiniSymphonyWorker(config,{log:event=>console.log(JSON.stringify(event))});
  console.log(JSON.stringify({event:'worker_started',mode:config.demo?'local-demo':'research',concurrency:config.concurrency,taskLimit:config.maxTasks}));
  console.log(JSON.stringify({event:'worker_stopped',...(await worker.run({signal:stop.signal}))}));
} catch (error) {
  // All configuration errors are our own bounded messages. Provider payloads,
  // prompts, API URLs, and credentials are never written to the worker log.
  console.error(error.message); process.exitCode=1;
}
