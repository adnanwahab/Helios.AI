import {test, expect} from 'bun:test';
import {client, setup} from './helpers.js';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../public/account-config.js';

const userA = {id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test'};
const userB = {id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test'};
const accountHeader = token => ({'x-helios-access-token': token});
const researchInput = {
  title: 'Account-owned research', brief: 'Compare a small housing pilot with the baseline.',
  inputData: 'Illustrative baseline only.', constraints: 'Review evidence before expansion.',
  agentCount: 100, maxConcurrent: 5, collaboratorGoal: 1000,
};

function mockAuth() {
  const calls = [];
  const state = {revokeA: false};
  const fetch = async (url, options = {}) => {
    const headers = new Headers(options.headers || (url instanceof Request ? url.headers : {}));
    calls.push({url: String(url instanceof Request ? url.url : url), headers, options});
    const token = headers.get('authorization')?.replace(/^Bearer /, '');
    if (token === 'user-a' && !state.revokeA) return Response.json(userA);
    if (token === 'user-b') return Response.json(userB);
    if (token === 'empty-user') return Response.json({});
    if (token === 'wrong-id') return Response.json({id: 'not-a-user-uuid', email: 'wrong@example.test'});
    if (token === 'array-id') return Response.json({id: [userA.id]});
    if (token === 'invalid-json') return new Response('not JSON', {headers: {'content-type': 'application/json'}});
    if (token === 'anonymous-user') return Response.json({...userA, is_anonymous: true});
    if (token === 'provider-down') return Response.json({error: 'Unavailable'}, {status: 503});
    if (token === 'network-error') throw new Error('Injected provider network failure');
    return Response.json({error: 'Invalid token'}, {status: 401});
  };
  return {fetch, calls, state};
}

const get = (runtime, path, browser, token, headers = {}) => runtime.app(new Request('http://localhost' + path, {
  headers: {...(browser ? {cookie: browser.cookie} : {}), ...(token === undefined ? {} : accountHeader(token)), ...headers},
}));
async function read(runtime, path, browser, token) {
  const response = await get(runtime, path, browser, token);
  expect(response.status).toBe(200);
  return response.json();
}
async function created(response) {
  expect(response.status).toBe(201);
  return response.json();
}

test('account access is optional and public capability reads do not contact Auth', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    for (const [prefix, scope] of [['/api/account', 'civic'], ['/api/research/account', 'research']]) {
      const config = await read(rt, prefix + '/config');
      expect(config).toMatchObject({available: true, provider: 'supabase', loginOptional: true,
        storage: 'pglite', scope, guestActivitySeparate: true, emailSignInEnabled: false, passwordSignInEnabled: true});
      expect(typeof config.accountPersistence.votes).toBe('boolean');
      expect(typeof config.accountPersistence.research).toBe('boolean');
      expect((await get(rt, prefix + '/config', undefined, 'stale-token')).status).toBe(200);
      const me = await read(rt, prefix + '/me');
      expect(me).toMatchObject({signedIn: false, account: null, persistence: config.accountPersistence});
    }
    const guest = await client(rt);
    const board = await read(rt, '/api/law-board', guest);
    const law = board.records.find(row => row.law.id === 'HGA-001').law;
    expect((await guest.post('/api/law-board/HGA-001/vote', {versionId: law.versionId, position: 'support'})).status).toBe(201);
    const room = await created(await guest.post('/api/research/rooms', researchInput));
    expect(room.room.canSupervise).toBe(true);
    expect(auth.calls).toHaveLength(0);
  } finally { await rt.store.close(); }
});

test('one account has one law and clause position across devices while guest votes remain separate', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const first = await client(rt, accountHeader('user-a'));
    const second = await client(rt, accountHeader('user-a'));
    const guest = await client(rt);
    const row = board => board.records.find(item => item.law.id === 'HGA-001');
    const law = row(await read(rt, '/api/law-board', guest)).law;
    const path = '/api/law-board/HGA-001/vote';
    expect((await guest.post(path, {versionId: law.versionId, position: 'support'})).status).toBe(201);
    const sharedRetryKey = crypto.randomUUID();
    expect((await first.post(path, {versionId: law.versionId, position: 'support'}, {'idempotency-key': sharedRetryKey})).status).toBe(201);
    // Receipts stay browser-scoped even though the voting principal is shared.
    expect((await second.post(path, {versionId: law.versionId, position: 'oppose'}, {'idempotency-key': sharedRetryKey})).status).toBe(201);
    for (const browser of [first, second]) {
      const current = row(await read(rt, '/api/law-board', browser, 'user-a'));
      expect(current.myVote).toBe('oppose');
      expect(current.votes).toEqual({support: 1, oppose: 1, unsure: 0});
    }
    expect(row(await read(rt, '/api/law-board', guest)).myVote).toBe('support');
    // A login on the guest's browser does not claim or copy the guest position.
    expect(row(await read(rt, '/api/law-board', guest, 'user-a')).myVote).toBe('oppose');

    const vote = '/api/constitution/vote';
    expect((await guest.post(vote, {clauseId: 'S-001', position: 'support'})).status).toBe(201);
    expect((await first.post(vote, {clauseId: 'S-001', position: 'support'})).status).toBe(201);
    expect((await second.post(vote, {clauseId: 'S-001', position: 'unsure'})).status).toBe(201);
    for (const browser of [first, second]) {
      const clause = (await read(rt, '/api/constitution', browser, 'user-a')).clauses.find(item => item.id === 'S-001');
      expect(clause.myVote).toBe('unsure');
      expect(clause.live).toMatchObject({support: 1, oppose: 0, unsure: 1});
    }
    expect((await read(rt, '/api/constitution', guest)).clauses.find(item => item.id === 'S-001').myVote).toBe('support');
  } finally { await rt.store.close(); }
});

test('account room ownership follows the verified account without adopting guest rooms', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const first = await client(rt, accountHeader('user-a'));
    const second = await client(rt, accountHeader('user-a'));
    const different = await client(rt, accountHeader('user-b'));
    const guest = await client(rt);
    const room = await created(await first.post('/api/research/rooms', researchInput));
    const path = '/api/research/rooms/' + room.room.id;
    const otherDevice = await read(rt, path, second, 'user-a');
    expect(otherDevice.room.canSupervise).toBe(true);
    expect(otherDevice.contributors).toBe(1);
    expect((await read(rt, path, different, 'user-b')).room.canSupervise).toBe(false);
    expect((await read(rt, path, guest)).room.canSupervise).toBe(false);
    // Holding the creator's browser cookie alone does not grant account ownership.
    expect((await read(rt, path, first)).room.canSupervise).toBe(false);
    expect((await different.post(path + '/control', {revision: room.room.revision, paused: false})).status).toBe(403);
    expect((await guest.post(path + '/control', {revision: room.room.revision, paused: false})).status).toBe(403);
    const controlled = await created(await second.post(path + '/control', {revision: otherDevice.room.revision, paused: false}));
    expect(controlled.room.paused).toBe(false);
    expect(controlled.contributors).toBe(1);

    const guestRoom = await created(await guest.post('/api/research/rooms', {...researchInput, title: 'Guest work stays separate'}));
    const guestPath = '/api/research/rooms/' + guestRoom.room.id;
    expect((await read(rt, guestPath, guest)).room.canSupervise).toBe(true);
    expect((await read(rt, guestPath, guest, 'user-a')).room.canSupervise).toBe(false);
    const me = await read(rt, '/api/research/account/me', second, 'user-a');
    expect(me).toMatchObject({signedIn: true, account: userA});
  } finally { await rt.store.close(); }
});

test('account tokens are verified again on every request and invalid tokens never become guest writes', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const owner = await client(rt, accountHeader('user-a'));
    const board = await read(rt, '/api/law-board', owner, 'user-a');
    const law = board.records.find(row => row.law.id === 'HGA-001').law;
    const path = '/api/law-board/HGA-001/vote';
    expect((await owner.post(path, {versionId: law.versionId, position: 'support'})).status).toBe(201);
    const before = auth.calls.length;
    expect((await get(rt, '/api/account/me', owner, 'user-a')).status).toBe(200);
    expect((await get(rt, '/api/account/me', owner, 'user-a')).status).toBe(200);
    expect(auth.calls.length - before).toBe(2);
    auth.state.revokeA = true;
    expect((await get(rt, '/api/account/me', owner, 'user-a')).status).toBe(401);
    expect((await get(rt, '/api/law-board', owner, 'bad-token')).status).toBe(401);
    expect((await owner.post(path, {versionId: law.versionId, position: 'oppose'})).status).toBe(401);
    const anonymousRead = await read(rt, '/api/law-board', owner);
    const row = anonymousRead.records.find(item => item.law.id === law.id);
    expect(row.myVote).toBeNull();
    expect(row.votes).toEqual({support: 1, oppose: 0, unsure: 0});
    expect((await read(rt, '/api/account/me', owner)).signedIn).toBe(false);
    auth.state.revokeA = false;
    expect((await read(rt, '/api/law-board', owner, 'user-a')).records.find(item => item.law.id === law.id).myVote).toBe('support');
  } finally { await rt.store.close(); }
});

test('switching accounts on one browser cannot replay another actor’s successful submission', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const browser = await client(rt);
    const board = await read(rt, '/api/law-board', browser);
    const law = board.records.find(row => row.law.id === 'HGA-001').law;
    const votePath = '/api/law-board/HGA-001/vote';
    const body = {versionId: law.versionId, position: 'support'};
    const voteKey = crypto.randomUUID();
    expect((await browser.post(votePath, body, {...accountHeader('user-a'), 'idempotency-key': voteKey})).status).toBe(201);
    expect((await browser.post(votePath, body, {...accountHeader('user-b'), 'idempotency-key': voteKey})).status).toBe(409);
    expect((await browser.post(votePath, body, {'idempotency-key': voteKey})).status).toBe(409);
    const otherAccount = (await read(rt, '/api/law-board', browser, 'user-b')).records.find(row => row.law.id === law.id);
    expect(otherAccount.myVote).toBeNull();
    expect(otherAccount.votes).toEqual({support: 1, oppose: 0, unsure: 0});
    expect((await browser.post(votePath, body, {...accountHeader('user-a'), 'idempotency-key': voteKey})).status).toBe(201);
    const roomKey = crypto.randomUUID();
    const room = await created(await browser.post('/api/research/rooms', researchInput, {...accountHeader('user-a'), 'idempotency-key': roomKey}));
    expect((await browser.post('/api/research/rooms', researchInput, {...accountHeader('user-b'), 'idempotency-key': roomKey})).status).toBe(409);
    expect((await read(rt, '/api/research/rooms/' + room.room.id, browser, 'user-b')).room.canSupervise).toBe(false);
  } finally { await rt.store.close(); }
});

test('account verification uses the fixed Auth origin and does not forward browser cookies or admin authorization', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const browser = await client(rt);
    const response = await get(rt, '/api/account/me', browser, 'user-a', {
      authorization: 'Bearer test-admin', 'x-csrf-token': browser.session.csrfToken,
      'x-auth-provider-url': 'https://untrusted.example/auth/v1/user',
    });
    expect(response.status).toBe(200);
    expect(auth.calls).toHaveLength(1);
    const call = auth.calls[0];
    expect(call.url).toBe(SUPABASE_URL + '/auth/v1/user');
    expect(call.headers.get('authorization')).toBe('Bearer user-a');
    expect(call.headers.get('apikey')).toBe(SUPABASE_PUBLISHABLE_KEY);
    expect(call.headers.get('cookie')).toBeNull();
    expect(call.headers.get('x-csrf-token')).toBeNull();
    expect(call.headers.get('x-auth-provider-url')).toBeNull();
    expect(call.headers.get('x-helios-access-token')).toBeNull();
    expect(JSON.stringify(Object.fromEntries(call.headers))).not.toContain('test-admin');
    expect(call.options.method || 'GET').toBe('GET');
  } finally { await rt.store.close(); }
});

test('malformed or unavailable Auth responses fail closed without inventing an account', async () => {
  const auth = mockAuth(), rt = await setup({accountFetch: auth.fetch});
  try {
    const browser = await client(rt);
    for (const token of ['empty-user', 'wrong-id', 'array-id', 'invalid-json', 'provider-down', 'network-error']) {
      const response = await get(rt, '/api/account/me', browser, token);
      expect(response.status).toBe(503);
      expect(typeof (await response.json()).error).toBe('string');
    }
    for (const token of ['anonymous-user', 'bad-token']) {
      const response = await get(rt, '/api/account/me', browser, token);
      expect(response.status).toBe(401);
      expect(typeof (await response.json()).error).toBe('string');
    }
    const beforeMalformedToken = auth.calls.length;
    for (const token of ['', 'contains whitespace']) expect((await get(rt, '/api/account/me', browser, token)).status).toBe(401);
    expect(auth.calls).toHaveLength(beforeMalformedToken);
    expect((await read(rt, '/api/account/me', browser)).signedIn).toBe(false);
  } finally { await rt.store.close(); }
});
