import {Problem, hash} from './store.js';
import {timingSafeEqual} from 'node:crypto';

// Static files, redirects and embed routes are served by Netlify's CDN (netlify.toml).
// This module only handles the dynamic paths: /api/*, the email endpoints and the YCR proxy.
const YCR_PRIMARY_ORIGIN = 'https://www.openresearchlab.org';
const YCR_PROXY_PREFIX = '/proxy/ycr';
const YCR_ALLOWED_ORIGINS = new Set(['https://ycr.org', 'https://www.ycr.org', 'https://openresearchlab.org', 'https://www.openresearchlab.org']);

const equal = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const rewriteYcrLocation = location => { try { const u = new URL(location, YCR_PRIMARY_ORIGIN); if (YCR_ALLOWED_ORIGINS.has(u.origin)) return `${YCR_PROXY_PREFIX}${u.pathname}${u.search}${u.hash}`; return location; } catch { return location; } };
const rewriteYcrText = text => text
  .replace(/\s(src|href|action)=(["'])\/(?!\/|proxy\/ycr\/)/gi, (m, attr, quote) => ` ${attr}=${quote}${YCR_PROXY_PREFIX}/`)
  .replace(/url\(\s*(["']?)\/(?!\/|proxy\/ycr\/)/gi, (m, quote) => `url(${quote}${YCR_PROXY_PREFIX}/`)
  .replace(/(["'`])\/dist\//g, `$1${YCR_PROXY_PREFIX}/dist/`)
  .replace(/(["'`])\/favicons\//g, `$1${YCR_PROXY_PREFIX}/favicons/`)
  .replace(/(["'`])\/api\//g, `$1${YCR_PROXY_PREFIX}/api/`)
  .replace(/https?:\/\/(?:www\.)?(?:ycr\.org|openresearchlab\.org)\//gi, `${YCR_PROXY_PREFIX}/`);

export function createApp({store, email, notion = null, origins = [], adminToken = null, secure = true} = {}) {
  if (!store) throw Error('Store required');
  const response = (data, status = 200, extra = {}) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});

  async function ycr(request, url) {
    const path = url.pathname, method = request.method;
    if (!['GET', 'HEAD'].includes(method)) return response({error: 'Method not allowed'}, 405);
    const upstreamPath = path === YCR_PROXY_PREFIX ? '/' : path.slice(YCR_PROXY_PREFIX.length);
    const upstream = new URL(upstreamPath + url.search, YCR_PRIMARY_ORIGIN);
    const accept = request.headers.get('accept') || '*/*';
    const userAgent = request.headers.get('user-agent') || 'Mozilla/5.0';
    const upstreamResponse = await fetch(upstream, {method, redirect: 'manual', headers: {accept, 'user-agent': userAgent}});
    const headers = new Headers(upstreamResponse.headers);
    for (const name of ['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'frame-options']) headers.delete(name);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    const location = headers.get('location');
    if (location) headers.set('location', rewriteYcrLocation(location));
    const type = (headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html') || type.includes('text/css') || type.includes('javascript')) {
      const rewritten = rewriteYcrText(await upstreamResponse.text());
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(method === 'HEAD' ? null : rewritten, {status: upstreamResponse.status, headers});
    }
    return new Response(method === 'HEAD' ? null : upstreamResponse.body, {status: upstreamResponse.status, headers});
  }

  async function api(request, url, remoteIP) {
    const method = request.method, path = url.pathname;
    const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('helios_session='))?.slice(15);

    if (method === 'GET' && path === '/api/health') {
      const {goals} = await store.catalog();
      return response({status: 'ok', storage: 'supabase-postgres', runtime: 'netlify-functions', schemaVersion: 1, seedCount: 100, proposalCount: goals.length, catalogHash: store.catalogHash});
    }
    if (method === 'GET' && path === '/api/session') {
      if (!(await store.authenticate(cookie))) await store.limit('session-issue:' + hash(remoteIP), 120, 3600000);
      const session = await store.session(cookie);
      return response({csrfToken: session.csrf, expiresAt: new Date(session.expires).toISOString(), identity: 'Pseudonymous browser session; not verified civic identity'}, 200,
        session.raw ? {'Set-Cookie': `helios_session=${session.raw}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=7776000${secure ? '; Secure' : ''}`} : {});
    }
    if (method === 'GET' && ['/api/catalog', '/api/laws'].includes(path)) return response(await store.catalog());
    if (path === '/api/notion/preview' && method === 'GET') {
      if (!notion) throw new Problem(503, 'Notion preview is not configured.');
      return response(await notion.preview({fresh: url.searchParams.get('fresh') === '1'}));
    }
    // Publishing writes to the maintainer's Notion workspace, so it takes the admin token, not a browser session.
    if (path === '/api/notion/publish' && method === 'POST') {
      if (!adminToken) throw new Problem(503, 'Maintainer review is not configured.');
      if (!equal(request.headers.get('authorization'), 'Bearer ' + adminToken)) throw new Problem(403, 'Maintainer authorization is required to publish to Notion.');
      if (!notion) throw new Problem(503, 'Notion is not configured.');
      try { return response(await notion.publish(), 201); }
      catch (error) { if (error.status === 503) throw new Problem(503, error.message); throw new Problem(502, 'Notion rejected the page: ' + (error.message || 'unknown error')); }
    }
    const match = path.match(/^\/api\/laws\/([A-Z0-9-]+)(?:\/(amendments)(?:\/([A-Z0-9a-f-]+)\/(accept))?)?$/i);
    if (method === 'GET' && match && !match[2]) return response(await store.detail(match[1]));
    if (method !== 'POST') return response({error: 'Not found'}, 404);

    if (![url.origin, ...origins].includes(request.headers.get('origin'))) throw new Problem(403, 'A same-origin request is required.');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Problem(415, 'Use application/json.');
    const session = await store.authenticate(cookie);
    if (!session || !equal(request.headers.get('x-csrf-token'), session.csrf)) throw new Problem(403, 'Reload the page to establish a valid session.');
    await store.limit('session:' + session.id, 20, 60000);
    await store.limit('ip:' + hash(remoteIP), 120, 3600000);
    if (Number(request.headers.get('content-length') || 0) > 32768) throw new Problem(413, 'Submission is too large.');
    const reader = request.body?.getReader();
    let size = 0; const chunks = [];
    if (reader) while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) { await reader.cancel(); throw new Problem(413, 'Submission is too large.'); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Problem(400, 'Invalid JSON.'); }

    if (path === '/api/laws' || (match?.[2] && !match[3])) {
      const key = request.headers.get('idempotency-key');
      if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new Problem(400, 'A unique Idempotency-Key is required.');
      const result = await store.idempotent(session.id, key, hash(path + JSON.stringify(body)),
        q => (path === '/api/laws' ? store.createIn(q, body, session.id) : store.amendIn(q, match[1], body, session.id)));
      return response(result, 201);
    }
    if (match?.[4]) {
      if (!adminToken) throw new Problem(503, 'Maintainer review is not configured. Amendments remain proposed.');
      if (!equal(request.headers.get('authorization'), 'Bearer ' + adminToken)) throw new Problem(403, 'Maintainer authorization is required to accept an amendment.');
      return response(await store.accept(match[1], match[3]));
    }
    return response({error: 'Not found'}, 404);
  }

  return async function handle(request, remoteIP = 'local') {
    try {
      const url = new URL(request.url), path = url.pathname;
      const emailResponse = email ? await email.handle(request, remoteIP) : null;
      if (emailResponse) return emailResponse;
      if (path === YCR_PROXY_PREFIX || path.startsWith(`${YCR_PROXY_PREFIX}/`)) return await ycr(request, url);
      if (path.startsWith('/api/')) return await api(request, url, remoteIP);
      return response({error: 'Not found'}, 404);
    } catch (error) {
      if (error instanceof Problem) return response({error: error.message}, error.status);
      console.error('Request failed:', error?.name || 'Error');
      return response({error: 'The request could not be completed.'}, 500);
    }
  };
}
