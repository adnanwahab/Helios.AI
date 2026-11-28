import {test, expect} from 'bun:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {client, setup} from './helpers.js';
import {createPGliteDatabase} from '../src/db-pglite.js';

const settings = {displayName: 'River', theme: 'dark', reducedMotion: true, favoriteLawIds: ['HGA-002', 'HGA-001']};
const proposal = {kind: 'law', title: 'An accessible service desk', message: 'Try a voluntary local service desk and measure waiting times.', consent: true, rightsConfirmed: true};
const draft = {bill: 'Offer a voluntary childcare pilot.', prompt: 'Explain the funding trade-offs.', modes: ['cost', 'objections'], diagnostics: [], consent: true};
const draftOutput = {revision: 'Offer a capped, voluntary childcare pilot with published funding and independent review.', changes: [{objection: 'The costs are uncertain.', compromise: 'Cap funding and review results before expansion.'}]};
const credentials = {HELIOS_GITHUB_PR_ENABLED: '1', HELIOS_GITHUB_TOKEN: 'github-secret-never-public', CONSENSUS_AI_ENABLED: '1', OPENAI_API_KEY: 'model-secret-never-public', OPENAI_MODEL: 'test-model'};
const headers = token => ({'x-helios-access-token': token});
const auth = async (_url, options) => {
  const token = new Headers(options.headers).get('authorization');
  if (token === 'Bearer user-a') return Response.json({id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test'});
  if (token === 'Bearer user-b') return Response.json({id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test'});
  return Response.json({error: 'Invalid'}, {status: 401});
};
const read = (rt, path, token) => rt.app(new Request('http://localhost' + path, {headers: token ? headers(token) : {}}));

// In-memory GitHub models an interrupted HTTP response after GitHub committed
// its side effect. A retry must discover that same branch/file/PR.
function githubMock({losePullResponse = false} = {}) {
  const state = {calls: [], branches: new Map(), files: new Map(), pulls: [], lost: false};
  const fetch = async (raw, options = {}) => {
    const url = new URL(raw), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    const path = url.pathname.replace('/repos/adnanwahab/HeliosHTML', '');
    state.calls.push({url: String(url), method, body, headers: new Headers(options.headers)});
    expect(url.origin).toBe('https://api.github.com');
    expect(url.pathname.startsWith('/repos/adnanwahab/HeliosHTML/')).toBe(true);
    if (path === '/git/ref/heads/main') return Response.json({ref: 'refs/heads/main', object: {sha: 'a'.repeat(40)}});
    if (path.startsWith('/git/ref/heads/')) {
      const name = path.slice('/git/ref/heads/'.length);
      return state.branches.has(name) ? Response.json({ref: 'refs/heads/' + name, object: {sha: 'a'.repeat(40)}}) : Response.json({}, {status: 404});
    }
    if (path === '/git/refs' && method === 'POST') {
      const name = body.ref.replace('refs/heads/', '');
      if (state.branches.has(name)) return Response.json({}, {status: 422});
      state.branches.set(name, body.sha);
      return Response.json({ref: body.ref}, {status: 201});
    }
    if (path.startsWith('/contents/')) {
      const name = path.slice('/contents/'.length);
      expect(name).toMatch(/^data\/contributions\/proposal-[a-f0-9]{32}\.json$/);
      if (method === 'GET') {
        const value = state.files.get(url.searchParams.get('ref') + ':' + name);
        return value ? Response.json({encoding: 'base64', content: value}) : Response.json({}, {status: 404});
      }
      expect(method).toBe('PUT');
      const key = body.branch + ':' + name;
      if (state.files.has(key)) return Response.json({}, {status: 409});
      state.files.set(key, body.content);
      return Response.json({content: {path: name}}, {status: 201});
    }
    if (path === '/pulls' && method === 'GET') return Response.json(state.pulls.filter(pull => url.searchParams.get('head') === 'adnanwahab:' + pull.head.ref));
    if (path === '/pulls' && method === 'POST') {
      const pull = {number: state.pulls.length + 1, html_url: 'https://github.com/adnanwahab/HeliosHTML/pull/' + (state.pulls.length + 1), state: 'open', draft: body.draft, head: {ref: body.head}, base: {ref: body.base}};
      state.pulls.push(pull);
      if (losePullResponse && !state.lost) { state.lost = true; throw Error('Simulated connection loss, secret should not be public'); }
      return Response.json(pull, {status: 201});
    }
    throw Error('Unexpected mock GitHub request: ' + method + ' ' + path);
  };
  return {state, fetch};
}

test('account preferences persist across devices and restart, isolate accounts, and detect stale revisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'helios-preferences-'));
  let rt = await setup({db: await createPGliteDatabase(dir), accountFetch: auth});
  try {
    const browser = await client(rt, headers('user-a'));
    expect((await read(rt, '/api/account/preferences')).status).toBe(401);
    const initial = await (await read(rt, '/api/account/preferences', 'user-a')).json();
    expect(initial).toMatchObject({revision: 0, updatedAt: null});
    const key = crypto.randomUUID(), body = {expectedRevision: 0, preferences: settings};
    const saved = await browser.post('/api/account/preferences', body, {'idempotency-key': key});
    expect(saved.status).toBe(200);
    const result = await saved.json();
    expect(result).toMatchObject({revision: 1, preferences: {...settings, favoriteLawIds: ['HGA-001', 'HGA-002']}});
    expect(await (await browser.post('/api/account/preferences', body, {'idempotency-key': key})).json()).toEqual(result);
    expect((await browser.post('/api/account/preferences', body)).status).toBe(409);
    expect((await (await read(rt, '/api/account/preferences', 'user-b')).json()).revision).toBe(0);
    const anotherDevice = await client(rt, headers('user-a'));
    expect(await (await read(rt, '/api/account/preferences', 'user-a')).json()).toEqual(result);
    expect((await anotherDevice.post('/api/account/preferences', {expectedRevision: 1, preferences: {...settings, theme: 'light'}})).status).toBe(200);
    await rt.store.close();
    rt = await setup({db: await createPGliteDatabase(dir), accountFetch: auth});
    expect(await (await read(rt, '/api/account/preferences', 'user-a')).json()).toMatchObject({revision: 2, preferences: {theme: 'light'}});
    expect((await (await read(rt, '/api/account/preferences', 'user-b')).json()).revision).toBe(0);
  } finally { await rt.store.close(); rmSync(dir, {recursive: true, force: true}); }
});

test('preferences reject identity injection, invalid values, cross-origin and missing CSRF', async () => {
  const rt = await setup({accountFetch: auth});
  try {
    const browser = await client(rt, headers('user-a')), body = {expectedRevision: 0, preferences: settings};
    expect((await browser.post('/api/account/preferences', {...body, actor: 'someone-else'})).status).toBe(400);
    expect((await browser.post('/api/account/preferences', {...body, preferences: {...settings, role: 'admin'}})).status).toBe(400);
    expect((await browser.post('/api/account/preferences', {...body, preferences: {...settings, favoriteLawIds: ['HGA-999']}})).status).toBe(400);
    expect((await browser.post('/api/account/preferences', body, {origin: 'https://untrusted.test'})).status).toBe(403);
    expect((await browser.post('/api/account/preferences', body, {'x-csrf-token': 'wrong'})).status).toBe(403);
    expect((await browser.post('/api/account/preferences', body, headers('expired'))).status).toBe(401);
    expect((await (await read(rt, '/api/account/preferences', 'user-a')).json()).revision).toBe(0);
  } finally { await rt.store.close(); }
});

test('automatic PRs require account and consent, constrain repo/file, and replay one durable result', async () => {
  const gh = githubMock(), rt = await setup({env: credentials, accountFetch: auth, githubFetch: gh.fetch});
  try {
    const guest = await client(rt), browser = await client(rt, headers('user-a'));
    expect((await guest.post('/api/github/pull-requests', proposal)).status).toBe(401);
    expect((await browser.post('/api/github/pull-requests', {...proposal, rightsConfirmed: false})).status).toBe(400);
    expect((await browser.post('/api/github/pull-requests', {...proposal, repository: 'other/repo'})).status).toBe(400);
    expect((await browser.post('/api/github/pull-requests', proposal, {'x-csrf-token': 'bad'})).status).toBe(403);
    expect(gh.state.calls).toHaveLength(0);
    const key = crypto.randomUUID(), requestHeaders = {'idempotency-key': key};
    const first = await browser.post('/api/github/pull-requests', proposal, requestHeaders);
    expect(first.status).toBe(201);
    const result = await first.json();
    expect(result).toMatchObject({number: 1, url: 'https://github.com/adnanwahab/HeliosHTML/pull/1', draft: true});
    const originalCalls = gh.state.calls.length;
    for (let index = 0; index < 4; index++) expect(await (await browser.post('/api/github/pull-requests', proposal, requestHeaders)).json()).toEqual(result);
    expect(gh.state.calls).toHaveLength(originalCalls);
    expect(gh.state.branches.size).toBe(1); expect(gh.state.files.size).toBe(1); expect(gh.state.pulls).toHaveLength(1);
    const stored = JSON.parse(Buffer.from([...gh.state.files.values()][0], 'base64').toString());
    expect(stored).toMatchObject({title: proposal.title, message: proposal.message, license: 'CC0-1.0'});
    expect(JSON.stringify(stored)).not.toContain('example.test');
    expect(JSON.stringify(result)).not.toContain(credentials.HELIOS_GITHUB_TOKEN);
    for (const call of gh.state.calls) {
      expect(call.headers.get('authorization')).toBe('Bearer ' + credentials.HELIOS_GITHUB_TOKEN);
      expect(call.headers.get('x-helios-access-token')).toBeNull(); expect(call.headers.get('cookie')).toBeNull();
    }
    expect((await browser.post('/api/github/pull-requests', {...proposal, title: 'Different text'}, requestHeaders)).status).toBe(409);
    expect((await browser.post('/api/github/pull-requests', proposal, {...requestHeaders, ...headers('user-b')})).status).toBe(409);
  } finally { await rt.store.close(); }
});

test('retry after lost GitHub response recovers the existing public PR without duplicate effects', async () => {
  const gh = githubMock({losePullResponse: true}), rt = await setup({env: credentials, accountFetch: auth, githubFetch: gh.fetch});
  try {
    const browser = await client(rt, headers('user-a')), requestHeaders = {'idempotency-key': crypto.randomUUID()};
    const failed = await browser.post('/api/github/pull-requests', proposal, requestHeaders);
    expect(failed.status).toBe(502); expect(await failed.text()).not.toContain('secret should not be public');
    const retried = await browser.post('/api/github/pull-requests', proposal, requestHeaders);
    expect(retried.status).toBe(201); expect((await retried.json()).number).toBe(1);
    expect(gh.state.pulls).toHaveLength(1); expect(gh.state.files.size).toBe(1);
  } finally { await rt.store.close(); }
});

test('portable drafting requires consent and CSRF, preserves provider secrecy, and caches successful retries', async () => {
  const calls = [];
  const rt = await setup({env: credentials, draftingFetch: async (url, options) => {
    calls.push({url, options});
    return Response.json({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(draftOutput)}]}]});
  }});
  try {
    const browser = await client(rt), key = crypto.randomUUID(), requestHeaders = {'idempotency-key': key};
    expect((await browser.post('/api/drafting/revise', {...draft, consent: false})).status).toBe(400);
    expect((await browser.post('/api/drafting/revise', draft, {origin: 'https://untrusted.test'})).status).toBe(403);
    expect((await browser.post('/api/drafting/revise', draft, {'x-csrf-token': ''})).status).toBe(403);
    expect(calls).toHaveLength(0);
    const first = await browser.post('/api/drafting/revise', draft, requestHeaders);
    expect(first.status).toBe(200);
    const output = await first.json();
    expect(output).toMatchObject({...draftOutput, model: 'test-model', reviewRequired: true});
    expect(await (await browser.post('/api/drafting/revise', draft, requestHeaders)).json()).toEqual(output);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    const request = JSON.parse(calls[0].options.body);
    expect(request.store).toBe(false); expect(JSON.parse(request.input).bill).toBe(draft.bill);
    expect(JSON.stringify(output)).not.toContain(credentials.OPENAI_API_KEY);
    expect((await rt.store.catalog()).goals).toHaveLength(100);
    expect((await browser.post('/api/drafting/revise', {...draft, prompt: 'Changed'}, requestHeaders)).status).toBe(409);
  } finally { await rt.store.close(); }
});

test('disabled or failed integrations report failure and never invent results or delivery dates', async () => {
  const rt = await setup({env: {}, accountFetch: auth, githubFetch: () => { throw Error('Unexpected network'); }});
  try {
    const browser = await client(rt, headers('user-a'));
    for (const path of ['/api/github/config', '/api/drafting/config']) {
      const result = await read(rt, path, 'expired');
      expect(result.status).toBe(200); expect((await result.json()).enabled).toBe(false);
    }
    expect((await browser.post('/api/github/pull-requests', proposal)).status).toBe(503);
    expect((await browser.post('/api/drafting/revise', draft)).status).toBe(503);
    const emailConfig = await (await read(rt, '/api/email/config')).json();
    expect(emailConfig).toMatchObject({subscriptionsEnabled: true, deliveryEnabled: false, delayHours: 72});
    const signup = await browser.post('/api/email/subscribe', {email: 'test@example.test'});
    expect(signup.status).toBe(202);
    const saved = await signup.json();
    expect(saved.deliveryEnabled).toBe(false); expect(saved.message).toContain('no delivery date is confirmed');
    const availability = await (await read(rt, '/api/features', 'expired')).json();
    expect(availability.features.find(item => item.id === 'drafting').available).toBe(false);
  } finally { await rt.store.close(); }
  const failed = await setup({env: credentials, draftingFetch: async () => Response.json({error: credentials.OPENAI_API_KEY}, {status: 500})});
  try {
    const browser = await client(failed);
    const response = await browser.post('/api/drafting/revise', draft);
    expect(response.status).toBe(502); expect(await response.text()).not.toContain(credentials.OPENAI_API_KEY);
  } finally { await failed.store.close(); }
});
