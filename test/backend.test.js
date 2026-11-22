import {test, expect} from 'bun:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPGliteDatabase} from '../src/db-pglite.js';
import {client, setup} from './helpers.js';

const proposal = {title: 'A community test proposal', sharedGoal: 'Make shared services easier to use.', category: 'Housing and livable cities', illustrativeLocalOption: 'Test an accessible service desk.', risksAndSafeguards: 'Voluntary participation and transparent costs.', suggestedMeasures: ['Hours saved']};

test('seeds exactly 100 original IDs once and persists proposals/amendments/revisions across restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'helios-test-'));
  let rt = await setup({db: await createPGliteDatabase(dir)});
  try {
    expect((await rt.store.catalog()).goals).toHaveLength(100);
    expect((await rt.store.detail('HGA-002')).law.sourceProposalId).toBe('HFL-002');
    const original = (await rt.store.detail('HGA-002')).law;
    const c = await client(rt);
    const created = await (await c.post('/api/laws', proposal)).json();
    expect(created.law.id).toMatch(/^HGP-/);
    const amended = await (await c.post('/api/laws/HGA-002/amendments', {baseVersionId: original.versionId, reason: 'A clearer outcome.', proposal: {...proposal, title: 'Clearer goal'}})).json();
    expect(amended.law).toEqual(original);
    expect(amended.amendments).toHaveLength(1);
    const accepted = await c.post('/api/laws/HGA-002/amendments/' + amended.amendments[0].id + '/accept', {}, {authorization: 'Bearer test-admin'});
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).law.version).toBe(2);
    await rt.store.close();
    rt = await setup({db: await createPGliteDatabase(dir)});
    expect((await rt.store.catalog()).goals).toHaveLength(101);
    expect((await rt.store.detail(created.law.id)).law.title).toBe(proposal.title);
    const history = await rt.store.detail('HGA-002');
    expect(history.versions).toHaveLength(2);
    expect(history.versions[0].content.title).toBe(original.title);
    expect(history.law.sourceProposalId).toBe('HFL-002');
    expect(history.amendments[0].status).toBe('accepted');
  } finally {
    await rt.store.close().catch(() => {});
    rmSync(dir, {recursive: true, force: true});
  }
});

test('idempotency prevents duplicate records and refuses key reuse for different content', async () => {
  const rt = await setup();
  const c = await client(rt), key = crypto.randomUUID(), headers = {'idempotency-key': key};
  const a = await (await c.post('/api/laws', proposal, headers)).json();
  const b = await (await c.post('/api/laws', proposal, headers)).json();
  expect(a).toEqual(b);
  expect((await rt.store.catalog()).goals).toHaveLength(101);
  expect((await c.post('/api/laws', {...proposal, title: 'Changed'}, headers)).status).toBe(409);
  await rt.store.close();
});

test('stale amendments fail closed, acceptance is restricted, repeated acceptance is idempotent', async () => {
  const rt = await setup();
  const c = await client(rt);
  const law = (await rt.store.detail('HGA-002')).law, body = {baseVersionId: law.versionId, reason: 'Improvement', proposal};
  const r = await c.post('/api/laws/HGA-002/amendments', body);
  expect(r.status).toBe(201);
  const id = (await r.json()).amendments[0].id, path = '/api/laws/HGA-002/amendments/' + id + '/accept';
  expect((await c.post(path, {})).status).toBe(403);
  expect((await c.post(path, {}, {authorization: 'Bearer test-admin'})).status).toBe(200);
  expect((await c.post(path, {}, {authorization: 'Bearer test-admin'})).status).toBe(200);
  expect((await rt.store.detail('HGA-002')).versions).toHaveLength(2);
  expect((await c.post('/api/laws/HGA-002/amendments', body)).status).toBe(409);
  expect((await c.post('/api/laws/HGA-003/amendments', body)).status).toBe(409);
  await rt.store.close();
});

test('cross-origin, missing session/CSRF and malformed/oversized inputs are rejected', async () => {
  const rt = await setup();
  const c = await client(rt);
  expect((await c.post('/api/laws', proposal, {origin: 'https://evil.test'})).status).toBe(403);
  expect((await c.post('/api/laws', proposal, {'x-csrf-token': 'wrong'})).status).toBe(403);
  expect((await c.post('/api/laws', proposal, {cookie: ''})).status).toBe(403);
  expect((await c.post('/api/laws', proposal, {'content-type': 'text/plain'})).status).toBe(415);
  expect((await c.post('/api/laws', {...proposal, title: 'x'.repeat(161)})).status).toBe(400);
  expect((await c.post('/api/laws', {...proposal, id: 'HGA-001'})).status).toBe(400);
  expect((await c.post('/api/laws', {...proposal, category: 'invented'})).status).toBe(400);
  expect((await c.post('/api/laws', {...proposal, risksAndSafeguards: 'x'.repeat(40000)})).status).toBe(413);
  await rt.store.close();
});

test('only API paths are dynamic; secrets and repository files are never served; health and cookies are accurate', async () => {
  const rt = await setup({secure: true});
  const c = await client(rt);
  for (const path of ['/.git/config', '/.env', '/data/catalog.json', '/src/store.js', '/server.js']) {
    expect((await rt.app(new Request('http://localhost' + path))).status).toBe(404);
  }
  const r = await rt.app(new Request('http://localhost/api/session'));
  expect(r.headers.get('set-cookie')).toContain('Secure');
  expect(r.headers.get('set-cookie')).toContain('HttpOnly');
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect((await rt.app(new Request('http://localhost/api/laws/HFL-002'))).status).toBe(404);
  expect((await (await rt.app(new Request('http://localhost/api/health'))).json()).seedCount).toBe(100);
  expect(c.cookie).toContain('helios_session=');
  await rt.store.close();
});

test('persistent rate limits and missing maintainer configuration are explicit', async () => {
  const rt = await setup({adminToken: null});
  const c = await client(rt);
  const law = (await rt.store.detail('HGA-001')).law;
  const r = await (await c.post('/api/laws/HGA-001/amendments', {baseVersionId: law.versionId, reason: 'Review me', proposal})).json();
  expect((await c.post('/api/laws/HGA-001/amendments/' + r.amendments[0].id + '/accept', {})).status).toBe(503);
  await rt.store.limit('test', 1, 60000);
  await expect(rt.store.limit('test', 1, 60000)).rejects.toThrow('Too many');
  await rt.store.close();
});

test('configured HTTPS frontend works behind a TLS-terminating proxy and unlisted origins fail', async () => {
  const rt = await setup({origins: ['https://helioshtml.com', 'https://helios-ai-laws.fly.dev'], secure: true});
  const c = await client(rt);
  expect((await c.post('/api/laws', proposal, {origin: 'https://helioshtml.com'})).status).toBe(201);
  expect((await c.post('/api/laws', proposal, {origin: 'https://helios-ai-laws.fly.dev'})).status).toBe(201);
  expect((await c.post('/api/laws', proposal, {origin: 'https://unlisted.example'})).status).toBe(403);
  await rt.store.close();
});
