import {Problem, hash} from './store.js';
import {timingSafeEqual} from 'node:crypto';
import {createResearchApi} from './research-api.js';
import {AccountError, createAccountService} from './account.js';

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

export function createApp({store, email, notion = null, morphlab = null, moderator = null, account = createAccountService(), origins = [], adminToken = null, researchWorkerToken = null, secure = true, health = {storage: 'unknown', runtime: 'unknown'}} = {}) {
  if (!store) throw Error('Store required');
  const response = (data, status = 200, extra = {}) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
  const research = createResearchApi({store, health, workerToken: researchWorkerToken, Problem, hash, response});

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
    const accountRoute = path.match(/^\/api\/(research\/)?account\/(config|me)$/);
    let accountContext;
    if (accountRoute) {
      if (method !== 'GET') return response({error: 'Use GET'}, 405);
      const writable = health.storage === 'supabase-postgres' || (health.storage === 'pglite' && health.runtime === 'node-server');
      const scope = accountRoute[1] ? 'research' : 'civic';
      accountContext = {...health, scope, votes: writable && scope === 'civic', research: writable && scope === 'research'};
      // Public capability discovery must remain available to a logged-out or
      // expired session; it does not authenticate or read anyone's saved data.
      if (accountRoute[2] === 'config') return response(account.config(accountContext));
    }
    // Account proof never changes the browser session/CSRF or claims its past
    // guest activity. New signed-in writes use a stable, server-verified actor.
    const identity = await account.identify(request);
    if (accountRoute) return response(account.me(identity, accountContext));
    const researchResponse = await research.readOrWorker(request, url, cookie, identity.actorId);
    if (researchResponse) return researchResponse;

    // A separate, opt-in paid capability. The prompt is sent only after a
    // same-origin, CSRF-protected request and durable per-IP/session limits.
    if (path === '/api/morphlab/config') {
      if (method !== 'GET') return response({error: 'Use GET'}, 405);
      return response(morphlab?.config() ?? {enabled: false, model: null});
    }
    if (path === '/api/morphlab/shape') {
      if (method !== 'POST') return response({error: 'Use POST'}, 405);
      if (!morphlab?.enabled) throw new Problem(503, 'AI shapes are not enabled on this Helios server.');
      if (![url.origin, ...origins].includes(request.headers.get('origin'))) throw new Problem(403, 'A same-origin request is required.');
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Problem(415, 'Use application/json.');
      if (Number(request.headers.get('content-length') || 0) > 2048) throw new Problem(413, 'Prompt is too large.');
      const session = await store.authenticate(cookie);
      if (!session || !equal(request.headers.get('x-csrf-token'), session.csrf)) throw new Problem(403, 'Reload to establish a valid session.');
      const chunks = []; let bytes = 0;
      const reader = request.body?.getReader();
      if (reader) while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2048) { await reader.cancel(); throw new Problem(413, 'Prompt is too large.'); }
        chunks.push(value);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new Problem(400, 'Invalid JSON.'); }
      if (!input || Array.isArray(input) || typeof input !== 'object'
        || Object.keys(input).length !== 1 || typeof input.prompt !== 'string'
        || input.prompt.trim().length < 2 || input.prompt.length > 500) {
        throw new Problem(400, 'Prompt must be 2–500 characters.');
      }
      await store.limit('morphlab:ip:' + hash(remoteIP), 12, 3600000);
      await store.limit('morphlab:session:' + session.id, 8, 3600000);
      try {
        return response({shape: await morphlab.generate(input.prompt.trim()), source: 'openai', model: morphlab.model});
      } catch (error) {
        if (error.code === 'MORPHLAB_BUSY') throw new Problem(429, 'MorphLab is busy. Try again shortly.');
        console.error('MorphLab generation failed:', error?.name || 'Error');
        throw new Problem(502, 'OpenAI could not generate that shape right now.');
      }
    }

    if (method === 'GET' && path === '/api/health') {
      const {goals} = await store.catalog();
      return response({status: 'ok', storage: health.storage, runtime: health.runtime, schemaVersion: 1, seedCount: 100, proposalCount: goals.length, catalogHash: store.catalogHash});
    }
    if (method === 'GET' && (path === '/api/session' || path === '/api/research/session')) {
      if (!(await store.authenticate(cookie))) await store.limit((path === '/api/research/session' ? 'research-session-issue:' : 'session-issue:') + hash(remoteIP), path === '/api/research/session' ? 2000 : 120, 3600000);
      const session = await store.session(cookie);
      return response({csrfToken: session.csrf, expiresAt: new Date(session.expires).toISOString(), signedIn: identity.signedIn, identity: identity.signedIn ? 'Signed-in account; earlier guest activity stays separate' : 'Pseudonymous browser session; not verified civic identity'}, 200,
        session.raw ? {'Set-Cookie': `helios_session=${session.raw}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=7776000${secure ? '; Secure' : ''}`} : {});
    }
    if (method === 'GET' && path === '/api/constitution') {
      const session = await store.authenticate(cookie);
      return response(await store.constitution.board(identity.actorId ?? session?.id));
    }
    if (method === 'GET' && path === '/api/constitution/moderation') {
      if (!adminToken || !equal(request.headers.get('authorization'), 'Bearer ' + adminToken)) throw new Problem(403, 'Maintainer authorization required.');
      return response(await store.constitution.moderationQueue());
    }
    // Shared law votes and updates are enabled on Supabase. Local PGlite
    // development may exercise the contract; deployed Fly PGlite is read-only
    // for these new endpoints, avoiding a second public voting database.
    const lawBoardWritable=health.storage==='supabase-postgres'||(health.storage==='pglite'&&health.runtime==='node-server');
    const lawBoardPath=path.match(/^\/api\/law-board\/(HGA-\d{3})(?:\/(vote|update))?$/);
    if(method==='GET'&&path==='/api/law-board'){
      const session=await store.authenticate(cookie);
      return response({storage:health.storage,writable:lawBoardWritable,records:await store.lawBoard(identity.actorId ?? session?.id)});
    }
    if(method==='GET'&&lawBoardPath&&!lawBoardPath[2])return response(await store.lawHistory(lawBoardPath[1]));
    if(method==='POST'&&lawBoardPath?.[2]&&!lawBoardWritable)throw new Problem(503,'Shared law votes and updates require the configured Supabase database.');
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
    const actor = identity.actorId ?? session.id;
    const researchWritePath = path.startsWith('/api/research/');
    await store.limit((researchWritePath ? 'research-session:' : 'session:') + session.id, researchWritePath ? 40 : 20, 60000);
    await store.limit((researchWritePath ? 'research-ip:' : 'ip:') + hash(remoteIP), researchWritePath ? 12000 : 120, 3600000);
    if (path === '/api/research/rooms') await store.limit('research-create:' + session.id, 10, 3600000);
    if (identity.actorId) await store.limit('account:' + identity.actorId, 60, 60000);
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

    const researchWrite = await research.write(path, body, session, request.headers.get('idempotency-key'), actor);
    if (researchWrite) return researchWrite;
    // A browser can switch accounts without changing its CSRF session. Bind
    // retry receipts to the verified actor to prevent cross-account replays.
    const writeHash = hash((identity.actorId ? identity.actorId + '\n' : '') + path + JSON.stringify(body));

    if (lawBoardPath?.[2]) {
      const key=request.headers.get('idempotency-key');
      if(!key||!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw new Problem(400,'A unique Idempotency-Key is required.');
      const fn=lawBoardPath[2]==='vote'?store.lawVoteIn:store.lawUpdateIn;
      return response(await store.idempotent(session.id,key,writeHash,q=>fn(q,lawBoardPath[1],body,actor)),201);
    }
    const constitutionAction = {'/api/constitution/vote':'vote','/api/constitution/contribute':'contribute','/api/constitution/comment':'comment','/api/constitution/moderate':'moderate'}[path];
    if (constitutionAction) {
      if (constitutionAction === 'moderate' && (!adminToken || !equal(request.headers.get('authorization'), 'Bearer ' + adminToken))) throw new Problem(403, 'Maintainer authorization required.');
      const key = request.headers.get('idempotency-key');
      if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new Problem(400, 'A unique Idempotency-Key is required.');
      const result = await store.idempotent(session.id, key, writeHash, q => store.constitution[constitutionAction](q, body, actor));
      if (moderator?.enabled && body.autoModerationConsent===true && result.status==='pending' &&
          (constitutionAction==='comment'||(constitutionAction==='contribute'&&!result.deduplicated))) {
        // The submission has already committed. Provider failure must not lose it.
        try {
          const kind=constitutionAction==='comment'?'comment':'clause';
          const id=kind==='comment'?result.id:result.clauseId;
          const moderation=await store.constitution.autoModerate(kind,id,body.text.normalize('NFC').trim(),moderator.classify);
          return response({...result,status:moderation.status,moderation:moderation.reason||'reviewed'},201);
        } catch { return response({...result,moderation:'review-unavailable'},201); }
      }
      return response(result, 201);
    }
    if (path === '/api/laws' || (match?.[2] && !match[3])) {
      const key = request.headers.get('idempotency-key');
      if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new Problem(400, 'A unique Idempotency-Key is required.');
      const result = await store.idempotent(session.id, key, writeHash,
        q => (path === '/api/laws' ? store.createIn(q, body, actor) : store.amendIn(q, match[1], body, actor)));
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
      if (error instanceof Problem || error instanceof AccountError) return response({error: error.message}, error.status);
      console.error('Request failed:', error?.name || 'Error');
      return response({error: 'The request could not be completed.'}, 500);
    }
  };
}
