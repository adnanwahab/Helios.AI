// Reads the blogs that are due now on a running Helios server, the same work
// the scheduled Netlify function does every 15 minutes. Useful locally and
// for a manual run in production.
//
//   HELIOS_ADMIN_TOKEN=... node scripts/blogroll-poll.mjs                 # http://127.0.0.1:3000
//   HELIOS_ADMIN_TOKEN=... node scripts/blogroll-poll.mjs --url https://helioshtml.com --max 40
const flag = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const base = flag('--url') || process.env.HELIOS_URL || 'http://127.0.0.1:3000';
const max = Number(flag('--max') || 25);
const token = process.env.HELIOS_ADMIN_TOKEN;
if (!token) {
  console.error('Set HELIOS_ADMIN_TOKEN to the server\'s maintainer token.');
  process.exit(1);
}
if (!Number.isInteger(max) || max < 1 || max > 200) {
  console.error('--max must be a whole number from 1 to 200.');
  process.exit(1);
}
const response = await fetch(new URL(`/api/blogroll/poll?max=${max}`, base), {method: 'POST', headers: {authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(60000)});
const result = await response.json().catch(() => ({error: 'The server did not answer with JSON.'}));
if (!response.ok) {
  console.error(`Poll failed (${response.status}): ${result.error || 'unknown error'}`);
  process.exit(1);
}
console.log(`Read ${result.ok} blog(s), ${result.failed} failed, ${result.skipped} left for next time; ${result.stillDue} still due (${result.ms} ms).`);
