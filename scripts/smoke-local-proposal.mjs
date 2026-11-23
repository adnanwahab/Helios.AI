// End-to-end smoke test restricted to a localhost Docker container.
// Never point this script at the production URL: it intentionally writes test proposals.
import {randomUUID} from 'node:crypto';

const [action, endpoint = 'http://127.0.0.1:18080', id] = process.argv.slice(2);
const base = new URL(endpoint);
if (!['create', 'verify'].includes(action) ||
    base.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
    (base.pathname !== '/' && base.pathname !== '')) {
  console.error('Usage: node scripts/smoke-local-proposal.mjs create|verify http://127.0.0.1:18080 [record-id]');
  process.exit(2);
}

const request = async (path, init = {}) => {
  const response = await fetch(new URL(path, base), {...init, signal: AbortSignal.timeout(20000)});
  const data = await response.json();
  if (!response.ok) throw Error(`${path}: HTTP ${response.status} ${JSON.stringify(data).slice(0,400)}`);
  return {response, data};
};

const health = (await request('/api/health')).data;
if (health.status !== 'ok' || health.seedCount !== 100 || health.storage !== 'pglite' || health.runtime !== 'fly-machine') {
  throw Error('Unexpected local Docker health response');
}

const proposal = {
  title: 'LOCAL SMOKE TEST ONLY: Community proposal',
  category: 'Housing and livable cities',
  sharedGoal: 'Verify safe test database persistence after a container restart.',
  illustrativeLocalOption: 'Create this fixture only in the isolated local test container.',
  risksAndSafeguards: 'Never use this test on production and never mistake the fixture for a public vote.',
  suggestedMeasures: ['Test record reloads after restart'],
};

if (action === 'create') {
  const {response, data: session} = await request('/api/session');
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie || !session.csrfToken) throw Error('Local session setup failed');
  const post = async (path, body) => (await request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': base.origin,
      'Cookie': cookie,
      'X-CSRF-Token': session.csrfToken,
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify(body),
  })).data;

  const created = await post('/api/laws', proposal);
  if (!created.law?.id?.startsWith('HGP-') || created.law.version !== 1) throw Error('Proposal not saved');
  const amended = await post('/api/laws/' + created.law.id + '/amendments', {
    baseVersionId: created.law.versionId,
    reason: 'Exercise the non-binding proposal amendment workflow in isolation.',
    proposal: {...proposal, title: 'LOCAL SMOKE TEST ONLY: Suggested amendment'},
  });
  if (amended.law.version !== 1 || amended.amendments?.length !== 1 ||
      amended.amendments[0].status !== 'proposed') {
    throw Error('Unreviewed amendment was not saved safely');
  }
  process.stdout.write(JSON.stringify({id: created.law.id}) + '\n');
} else {
  if (!/^HGP-[A-Za-z0-9-]+$/.test(id || '')) throw Error('Provide a generated local HGP record ID');
  const result = (await request('/api/laws/' + encodeURIComponent(id))).data;
  if (result.law?.title !== proposal.title ||
      result.law.version !== 1 ||
      result.amendments?.length !== 1 ||
      result.amendments[0].status !== 'proposed') {
    throw Error('Local proposal or unreviewed amendment did not survive the Docker restart');
  }
  console.log('Local PGlite persistence verified after container restart:', id);
}
