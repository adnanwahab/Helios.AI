import {timingSafeEqual} from 'node:crypto';

const same = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const roomPath = /^\/api\/research\/rooms\/([A-Za-z0-9_-]{1,100})(?:\/(brief|plan|control|tasks|frames|contributions)(?:\/([A-Za-z0-9_-]{1,100}))?)?$/;

// Browser writes deliberately pass through createApp's existing session,
// same-origin, CSRF, bounded-body, rate-limit and idempotency protections.
export function createResearchApi({store, health, workerToken, Problem, hash, response}) {
  const writable = () => health.storage === 'supabase-postgres' || (health.storage === 'pglite' && health.runtime === 'node-server');
  const enabled = () => writable() && typeof workerToken === 'string' && workerToken.length >= 32;
  async function readOrWorker(request, url, cookie) {
    const path = url.pathname, method = request.method;
    if (!path.startsWith('/api/research/')) return null;
    if (path === '/api/research/session') return null;
    if (path === '/api/research/status') {
      if (method !== 'GET') return response({error: 'Use GET'}, 405);
      return response({available: true, storage: health.storage, writable: writable(), workerEnabled: enabled(), workerReason: enabled() ? null : 'No research worker adapter is configured. Saving a plan does not start agents.'});
    }
    if (path.startsWith('/api/research/worker/')) {
      if (method !== 'POST') return response({error: 'Use POST'}, 405);
      if (!enabled()) throw new Problem(503, 'No research worker adapter is configured. Saved research plans remain available.');
      if (!same(request.headers.get('authorization'), 'Bearer ' + workerToken)) throw new Problem(403, 'Research worker authorization required.');
      const action = path.slice('/api/research/worker/'.length);
      if (!['claim', 'heartbeat', 'complete'].includes(action)) throw new Problem(404, 'Worker operation not found.');
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Problem(415, 'Use application/json.');
      if (Number(request.headers.get('content-length') || 0) > 32768) throw new Problem(413, 'Worker submission is too large.');
      const chunks = [], reader = request.body?.getReader(); let size = 0;
      if (reader) while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.length;
        if (size > 32768) { await reader.cancel(); throw new Problem(413, 'Worker submission is too large.'); }
        chunks.push(value);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Problem(400, 'Invalid JSON.'); }
      return response(await store.research.worker(action, body));
    }
    const match = path.match(roomPath);
    const history = path.match(/^\/api\/research\/rooms\/([A-Za-z0-9_-]{1,100})\/frames\/([A-Za-z0-9_-]{1,100})\/history$/);
    if (method === 'GET' && history) return response(await store.research.frameHistory(history[1], history[2], url.searchParams.get('beforeRevision')));
    if (method === 'GET' && match?.[2] === 'tasks' && match[3]) return response(await store.research.taskDetail(match[1], match[3]));
    if (method === 'GET' && match && !match[2]) {
      const session = await store.authenticate(cookie);
      return response(await store.research.snapshot(match[1], session?.id));
    }
    if (method !== 'POST') return response({error: 'Research route not found'}, 404);
    if (!writable()) throw new Problem(503, 'Shared research writes require the configured Supabase database.');
    return null;
  }
  async function write(path, body, session, key) {
    if (!path.startsWith('/api/research/')) return null;
    if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new Problem(400, 'A unique Idempotency-Key is required.');
    const match = path.match(roomPath);
    let mutate;
    if (path === '/api/research/rooms') mutate = q => store.research.createIn(q, body, session.id);
    else if (match?.[2] && ((match[2] === 'tasks' && match[3]) || (match[2] === 'frames') || (!['tasks', 'frames'].includes(match[2]) && !match[3]))) mutate = q => store.research.writeIn(q, match[1], match[2], match[3], body, session.id);
    else throw new Problem(404, 'Research operation not found.');
    // Store a small receipt, then re-read the committed shared snapshot. A retry
    // performs no second mutation and can include newer collaborators' changes.
    const receipt = await store.idempotent(session.id, key, hash(path + JSON.stringify(body)), mutate);
    return response(await store.research.snapshot(receipt.roomId, session.id), 201);
  }
  return {readOrWorker, write};
}
