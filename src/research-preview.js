// A separately provisioned research database keeps preview collaboration and
// cookies independent of the existing civic service. No database failover.
import {createDatabase} from './db.js';
import {createRuntime} from './runtime.js';

let pending;
export function hasResearchDatabase(env = process.env) {
  return Boolean(env.HELIOS_RESEARCH_DB_URL?.trim());
}

export function getResearchRuntime(env = process.env) {
  if (!hasResearchDatabase(env)) throw Error('Research database is not configured.');
  const schema = env.HELIOS_RESEARCH_DB_SCHEMA || 'helios_research_preview';
  if (schema === 'helios_civic') throw Error('Research previews require a separate private schema.');
  if (!pending) {
    const db = createDatabase({SUPABASE_DB_URL: env.HELIOS_RESEARCH_DB_URL, SUPABASE_CA_CERT: env.HELIOS_RESEARCH_DB_CA}, {schema});
    pending = createRuntime({
      db,
      // This runtime serves only research routes. Avoid initializing unrelated
      // integrations with production credentials in a preview collaboration room.
      env: {NETLIFY: env.NETLIFY, AWS_LAMBDA_FUNCTION_NAME: env.AWS_LAMBDA_FUNCTION_NAME,
        HELIOS_RESEARCH_WORKER_TOKEN: env.HELIOS_RESEARCH_WORKER_TOKEN},
      adminToken: null,
    }).catch(async error => {
      await db.close().catch(() => {});
      pending = undefined;
      throw error;
    });
  }
  return pending;
}

export async function serveResearch(request, remoteIP, env = process.env, {getRuntime = getResearchRuntime} = {}) {
  const headers = new Headers(request.headers);
  const cookie = headers.get('cookie')?.match(/(?:^|;\s*)helios_research_session=([a-f0-9]{64})(?:;|$)/i)?.[1];
  headers.delete('cookie');
  if (cookie) headers.set('cookie', 'helios_session=' + cookie);
  const {app} = await getRuntime(env);
  // Build from the URL so an empty replacement header collection cannot
  // accidentally retain a civic Cookie header in another Fetch implementation.
  const init = {method: request.method, headers, signal: request.signal};
  if (!['GET','HEAD'].includes(request.method)) {init.body = request.body; init.duplex = 'half';}
  const response = await app(new Request(request.url, init), remoteIP);
  const out = new Headers(response.headers);
  const setCookie = out.get('set-cookie');
  if (setCookie) out.set('set-cookie', setCookie.replace(/^helios_session=/, 'helios_research_session=').replace('Path=/api;', 'Path=/api/research;'));
  out.set('X-Helios-Research-Storage', 'isolated-supabase');
  return new Response(response.body, {status: response.status, headers: out});
}
