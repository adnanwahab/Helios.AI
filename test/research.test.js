import {test, expect} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPGliteDatabase} from '../src/db-pglite.js';
import {client, setup} from './helpers.js';

const base = '/api/research/rooms';
const workerToken = 'test-worker-token-abcdefghijklmnopqrstuvwxyz';
const workerPost = (runtime, action, input, token = workerToken) => runtime.app(new Request('http://localhost/api/research/worker/' + action, {
  method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + token}, body: JSON.stringify(input),
}));
const brief = {
  title: 'Shared housing futures',
  brief: 'Investigate how a small housing pilot could change everyday life.',
  inputData: 'Baseline: 40 homes, bus every 30 minutes. Treat these as scenario assumptions.',
  constraints: 'Keep uncertainty visible and submit evidence for human review.',
  agentCount: 100,
  maxConcurrent: 8,
  collaboratorGoal: 1000,
};
const frameDraft = {
  title: 'A neighborhood in 2034',
  year: 2034,
  summary: 'Under the proposed pilot, more neighbors may live near shared gardens.',
  assumptions: 'Construction remains affordable and residents opt in.',
  laws: [{id: 'HGA-012', title: 'Backyard homes', change: 'Permit a measured local pilot.'}],
};

async function snapshot(response) {
  const data = await response.json();
  expect({status: response.status, error: data.error}).toEqual({status: 201, error: undefined});
  return data;
}
async function read(runtime, path, browser) {
  const response = await runtime.app(new Request('http://localhost' + path, {
    headers: browser ? {cookie: browser.cookie} : {},
  }));
  expect(response.status).toBe(200);
  return response.json();
}
const frameInput = frame => ({
  revision: frame.revision,
  title: frame.title,
  year: frame.year,
  summary: frame.summary,
  assumptions: frame.assumptions,
  laws: frame.laws,
});

test('research capabilities describe real storage and do not invent connected workers', async () => {
  const rt = await setup({env: {}});
  try {
    const status = await read(rt, '/api/research/status');
    expect(status).toMatchObject({available: true, storage: 'pglite', writable: true, workerEnabled: false});
    const owner = await client(rt);
    const created = await snapshot(await owner.post(base, brief));
    expect(created.room).toMatchObject({...brief, paused: true, canSupervise: true});
    expect(created.frames.length).toBeGreaterThanOrEqual(3);
    expect(created.frames.length).toBeLessThanOrEqual(4);
    expect(created.tasks).toEqual([]);
    expect(created.contributors).toBe(1);
    expect(created.connectedWorkers).toBe(0);
    const visitor = await read(rt, base + '/' + created.room.id);
    expect(visitor.room.canSupervise).toBe(false);
    expect(visitor.connectedWorkers).toBe(0);
    expect(JSON.stringify(visitor)).not.toContain(owner.cookie.split('=')[1]);
    expect((await workerPost(rt, 'claim', {roomId: created.room.id, workerId: 'offline-worker'})).status).toBe(503);
  } finally { await rt.store.close(); }
});

test('two participants share frame edits and notes across a database restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'helios-research-test-'));
  let rt;
  try {
    rt = await setup({db: await createPGliteDatabase(directory)});
    const owner = await client(rt), collaborator = await client(rt);
    const created = await snapshot(await owner.post(base, brief));
    const path = base + '/' + created.room.id;
    const joined = await read(rt, path, collaborator);
    expect(joined.room.canSupervise).toBe(false);
    expect(joined.contributors).toBe(1);
    const added = await snapshot(await collaborator.post(path + '/frames', frameDraft));
    const frame = added.frames.find(item => item.title === frameDraft.title);
    expect(frame).toBeDefined();
    expect(added.contributors).toBe(2);
    const text = 'Measure accessibility before expanding the pilot.';
    await snapshot(await collaborator.post(path + '/contributions', {frameId: frame.id, text}));
    const observed = await read(rt, path, owner);
    expect(observed.frames.find(item => item.id === frame.id)).toMatchObject(frameDraft);
    expect(JSON.stringify(observed.activity)).toContain(text);
    expect(observed.contributors).toBe(2);

    await rt.store.close(); rt = null;
    rt = await setup({db: await createPGliteDatabase(directory)});
    const persisted = await read(rt, path, owner);
    expect(persisted.room.canSupervise).toBe(true);
    expect(persisted.frames.find(item => item.id === frame.id)).toMatchObject(frameDraft);
    expect(JSON.stringify(persisted.activity)).toContain(text);
    expect(persisted.contributors).toBe(2);
  } finally {
    if (rt) await rt.store.close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('100 queued research assignments retain their work when planning is requested again', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt);
    const created = await snapshot(await owner.post(base, brief));
    const path = base + '/' + created.room.id;
    const planned = await snapshot(await owner.post(path + '/plan', {revision: created.room.revision}));
    expect(planned.tasks).toHaveLength(100);
    expect(new Set(planned.tasks.map(task => task.id)).size).toBe(100);
    expect(new Set(planned.tasks.map(task => task.slot)).size).toBe(100);
    expect(new Set(planned.tasks.map(task => task.role))).toEqual(new Set(['discover', 'evidence', 'model', 'critique', 'synthesis']));
    expect(planned.tasks.every(task => task.status === 'queued')).toBe(true);
    expect(planned.tasks.every(task => !('prompt' in task) && !('result' in task) && !('notes' in task))).toBe(true);
    expect(planned.room.paused).toBe(true);
    expect(planned.connectedWorkers).toBe(0);
    const first = planned.tasks[0];
    const initialDetail = await read(rt, path + '/tasks/' + first.id, owner);
    expect(typeof initialDetail.prompt).toBe('string');
    expect(initialDetail.prompt.length).toBeGreaterThan(0);
    const revised = await snapshot(await owner.post(path + '/tasks/' + first.id, {revision: first.revision, notes: 'Prioritize the source publication date.'}));
    expect((await read(rt, path + '/tasks/' + first.id, owner)).notes).toBe('Prioritize the source publication date.');
    expect((await owner.post(path + '/plan', {revision: revised.room.revision})).status).toBe(409);
    const retained = await read(rt, path, owner);
    expect(retained.tasks.map(task => task.id)).toEqual(revised.tasks.map(task => task.id));
    expect((await read(rt, path + '/tasks/' + first.id, owner)).notes).toBe('Prioritize the source publication date.');
  } finally { await rt.store.close(); }
});

test('stale keyframe updates fail without replacing a collaborator’s committed text', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt), collaborator = await client(rt);
    const created = await snapshot(await owner.post(base, brief));
    const path = base + '/' + created.room.id;
    const frame = created.frames[0];
    const savedText = 'By this keyframe, residents may have tested one small mobility change.';
    const first = await snapshot(await collaborator.post(path + '/frames/' + frame.id, {...frameInput(frame), summary: savedText}));
    expect(first.frames.find(item => item.id === frame.id).revision).toBeGreaterThan(frame.revision);
    const stale = await owner.post(path + '/frames/' + frame.id, {...frameInput(frame), summary: 'An older draft from a different browser.'});
    expect(stale.status).toBe(409);
    expect(typeof (await stale.json()).error).toBe('string');
    const current = await read(rt, path, owner);
    expect(current.frames.find(item => item.id === frame.id).summary).toBe(savedText);
    expect(current.contributors).toBe(2);
    const historyPath = path + '/frames/' + frame.id + '/history';
    const history = await read(rt, historyPath, owner);
    expect(history.versions.map(item => item.revision)).toEqual([frame.revision + 1, frame.revision]);
    expect(history.versions[0].content.summary).toBe(savedText);
    expect(history.versions[1].content.summary).toBe(frame.summary);
    expect(history.versions.every(item => typeof item.createdAt === 'string' && !('actor' in item))).toBe(true);
    expect(history.nextBeforeRevision).toBeNull();
    const older = await read(rt, historyPath + '?beforeRevision=' + (frame.revision + 1), owner);
    expect(older.versions.map(item => item.revision)).toEqual([frame.revision]);
    expect(older.versions[0].content.summary).toBe(frame.summary);
  } finally { await rt.store.close(); }
});

test('only the room owner may supervise the pipeline and all supervision uses current revisions', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt), visitor = await client(rt);
    const created = await snapshot(await owner.post(base, brief));
    const path = base + '/' + created.room.id;
    expect((await visitor.post(path + '/plan', {revision: created.room.revision})).status).toBe(403);
    expect((await visitor.post(path + '/brief', {...brief, revision: created.room.revision, title: 'Taken over'})).status).toBe(403);
    expect((await visitor.post(path + '/control', {revision: created.room.revision, paused: false})).status).toBe(403);
    const edited = await snapshot(await owner.post(path + '/brief', {...brief, revision: created.room.revision, title: 'Reviewed housing futures'}));
    expect(edited.room.title).toBe('Reviewed housing futures');
    expect((await owner.post(path + '/brief', {...brief, revision: created.room.revision})).status).toBe(409);
    const planned = await snapshot(await owner.post(path + '/plan', {revision: edited.room.revision}));
    const task = planned.tasks[0];
    expect((await visitor.post(path + '/tasks/' + task.id, {revision: task.revision, notes: 'Changed by a visitor.'})).status).toBe(403);
    const altered = await snapshot(await owner.post(path + '/tasks/' + task.id, {revision: task.revision, notes: 'Owner review note.'}));
    expect((await owner.post(path + '/tasks/' + task.id, {revision: task.revision, notes: 'Stale note.'})).status).toBe(409);
    const newTask = altered.tasks.find(item => item.id === task.id);
    const running = await owner.post(path + '/tasks/' + task.id, {revision: newTask.revision, notes: '', status: 'running'});
    expect([400, 409]).toContain(running.status);
    expect((await read(rt, path + '/tasks/' + task.id, owner)).notes).toBe('Owner review note.');
  } finally { await rt.store.close(); }
});

test('idempotent submissions return one room, one contribution, and conflict on changed payloads', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt), collaborator = await client(rt);
    const key = crypto.randomUUID();
    const first = await snapshot(await owner.post(base, brief, {'idempotency-key': key}));
    const replay = await snapshot(await owner.post(base, brief, {'idempotency-key': key}));
    expect(replay).toEqual(first);
    expect((await owner.post(base, {...brief, title: 'Different payload'}, {'idempotency-key': key})).status).toBe(409);
    const path = base + '/' + first.room.id;
    const contribution = {frameId: first.frames[0].id, text: 'Count the residents who benefit from the change.'};
    const contributionKey = crypto.randomUUID();
    const added = await snapshot(await collaborator.post(path + '/contributions', contribution, {'idempotency-key': contributionKey}));
    const repeated = await snapshot(await collaborator.post(path + '/contributions', contribution, {'idempotency-key': contributionKey}));
    expect(repeated).toEqual(added);
    const persisted = await read(rt, path, owner);
    expect(persisted.activity.filter(item => JSON.stringify(item).includes(contribution.text))).toHaveLength(1);
    expect(persisted.contributors).toBe(2);
  } finally { await rt.store.close(); }
});

test('research writes enforce CSRF, origin, idempotency and bounded capacity', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt);
    expect((await owner.post(base, brief, {'x-csrf-token': 'wrong'})).status).toBe(403);
    expect((await owner.post(base, brief, {origin: 'https://untrusted.example'})).status).toBe(403);
    expect((await owner.post(base, brief, {'idempotency-key': ''})).status).toBe(400);
    for (const invalid of [{agentCount: 99}, {agentCount: 1001}, {agentCount: 100.5}, {maxConcurrent: 0}, {maxConcurrent: 101}]) {
      expect((await owner.post(base, {...brief, ...invalid})).status).toBe(400);
    }
    const created = await snapshot(await owner.post(base, {...brief, agentCount: 1000, maxConcurrent: 100}));
    expect(created.room.agentCount).toBe(1000);
    expect(created.room.maxConcurrent).toBe(100);
    expect(created.contributors).toBe(1);
    expect(created.connectedWorkers).toBe(0);
  } finally { await rt.store.close(); }
});

test('frame and task IDs cannot cross the boundary between research rooms', async () => {
  const rt = await setup();
  try {
    const owner = await client(rt);
    const first = await snapshot(await owner.post(base, brief));
    const second = await snapshot(await owner.post(base, {...brief, title: 'Transit futures'}));
    const firstPath = base + '/' + first.room.id, secondPath = base + '/' + second.room.id;
    const planned = await snapshot(await owner.post(firstPath + '/plan', {revision: first.room.revision}));
    const frame = first.frames[0], task = planned.tasks[0];
    expect((await owner.post(secondPath + '/frames/' + frame.id, {...frameInput(frame), summary: 'Incorrect room.'})).status).toBe(404);
    expect((await owner.post(secondPath + '/contributions', {frameId: frame.id, text: 'Incorrect room note.'})).status).toBe(404);
    expect((await owner.post(secondPath + '/tasks/' + task.id, {revision: task.revision, notes: 'Incorrect room task.'})).status).toBe(404);
    const retained = await read(rt, firstPath, owner);
    expect(retained.frames.find(item => item.id === frame.id).summary).toBe(frame.summary);
    expect((await read(rt, firstPath + '/tasks/' + task.id, owner)).notes).toBe('');
    expect((await rt.app(new Request('http://localhost' + secondPath + '/tasks/' + task.id))).status).toBe(404);
    expect((await rt.app(new Request('http://localhost' + secondPath + '/frames/' + frame.id + '/history'))).status).toBe(404);
  } finally { await rt.store.close(); }
});

test('authorized workers obey pause and capacity, fence their results, and leave approval to humans', async () => {
  const rt = await setup({env: {HELIOS_RESEARCH_WORKER_TOKEN: workerToken}});
  try {
    expect((await read(rt, '/api/research/status')).workerEnabled).toBe(true);
    const owner = await client(rt);
    const created = await snapshot(await owner.post(base, {...brief, maxConcurrent: 1}));
    const roomId = created.room.id, path = base + '/' + roomId;
    const planned = await snapshot(await owner.post(path + '/plan', {revision: created.room.revision}));
    expect((await workerPost(rt, 'claim', {roomId, workerId: 'worker-a'}, 'incorrect-token')).status).toBe(403);
    const paused = await workerPost(rt, 'claim', {roomId, workerId: 'worker-a'});
    expect(paused.status).toBe(200);
    expect(await paused.json()).toMatchObject({task: null, paused: true});
    const resumed = await snapshot(await owner.post(path + '/control', {revision: planned.room.revision, paused: false}));
    const attempts = await Promise.all(['worker-a', 'worker-b'].map(async workerId => {
      const response = await workerPost(rt, 'claim', {roomId, workerId});
      expect(response.status).toBe(200);
      return response.json();
    }));
    const claimed = attempts.filter(item => item.task);
    expect(claimed).toHaveLength(1);
    expect(attempts.filter(item => item.capacityReached)).toHaveLength(1);
    const task = claimed[0].task;
    expect(task.status).toBe('running');
    expect(typeof task.leaseToken).toBe('string');
    const observed = await read(rt, path, owner);
    expect(observed.connectedWorkers).toBe(1);
    expect(observed.contributors).toBe(1);
    expect(JSON.stringify(observed)).not.toContain(task.leaseToken);
    expect(observed.tasks.find(item => item.id === task.id)).not.toHaveProperty('workerId');

    expect((await workerPost(rt, 'complete', {roomId, taskId: task.id, leaseToken: 'forged-lease', result: 'Forged result.'})).status).toBe(409);
    expect((await owner.post(path + '/tasks/' + task.id, {revision: task.revision, notes: '', status: 'queued'})).status).toBe(409);
    await snapshot(await owner.post(path + '/control', {revision: resumed.room.revision, paused: true}));
    const heartbeat = await workerPost(rt, 'heartbeat', {roomId, taskId: task.id, leaseToken: task.leaseToken});
    expect(heartbeat.status).toBe(200);
    expect(await heartbeat.json()).toMatchObject({ok: true, paused: true});
    const output = 'Primary evidence is incomplete. Proposed pilot needs a locally measured baseline.';
    const submission = {roomId, taskId: task.id, leaseToken: task.leaseToken, result: output};
    const completed = await workerPost(rt, 'complete', submission);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ok: true, status: 'needs_review'});
    expect((await workerPost(rt, 'complete', submission)).status).toBe(409);
    const awaitingReview = await read(rt, path, owner);
    const reviewTask = awaitingReview.tasks.find(item => item.id === task.id);
    expect(reviewTask).toMatchObject({hasResult: true, status: 'needs_review'});
    expect((await read(rt, path + '/tasks/' + task.id, owner)).result).toBe(output);
    expect(awaitingReview.connectedWorkers).toBe(0);
    expect(awaitingReview.contributors).toBe(1);
    const reviewed = await snapshot(await owner.post(path + '/tasks/' + task.id, {revision: reviewTask.revision, notes: 'Evidence checked for this research draft.', status: 'approved'}));
    expect(reviewed.tasks.find(item => item.id === task.id)).toMatchObject({status: 'approved', hasResult: true});
    expect((await read(rt, path + '/tasks/' + task.id, owner)).result).toBe(output);
  } finally { await rt.store.close(); }
});

test('expired worker leases stop counting and cannot submit or be silently retried', async () => {
  const rt = await setup({env: {HELIOS_RESEARCH_WORKER_TOKEN: workerToken}});
  try {
    const owner = await client(rt);
    const created = await snapshot(await owner.post(base, {...brief, maxConcurrent: 1}));
    const roomId = created.room.id, path = base + '/' + roomId;
    const planned = await snapshot(await owner.post(path + '/plan', {revision: created.room.revision}));
    await snapshot(await owner.post(path + '/control', {revision: planned.room.revision, paused: false}));
    const firstResponse = await workerPost(rt, 'claim', {roomId, workerId: 'lost-worker'});
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()).task;
    await rt.db.query('UPDATE research_tasks SET lease_until=$1 WHERE id=$2', [Date.now() - 1000, first.id]);
    expect((await read(rt, path, owner)).connectedWorkers).toBe(0);
    expect((await workerPost(rt, 'heartbeat', {roomId, taskId: first.id, leaseToken: first.leaseToken})).status).toBe(409);
    expect((await workerPost(rt, 'complete', {roomId, taskId: first.id, leaseToken: first.leaseToken, result: 'Too late.'})).status).toBe(409);
    const nextResponse = await workerPost(rt, 'claim', {roomId, workerId: 'next-worker'});
    expect(nextResponse.status).toBe(200);
    const next = (await nextResponse.json()).task;
    expect(next).toBeTruthy();
    expect(next.id).not.toBe(first.id);
    const observed = await read(rt, path, owner);
    expect(observed.tasks.find(item => item.id === first.id)).toMatchObject({status: 'needs_review', hasResult: false});
    expect((await read(rt, path + '/tasks/' + first.id, owner)).result).toBe('');
    expect(observed.connectedWorkers).toBe(1);
    expect(observed.contributors).toBe(1);
    const expired = observed.tasks.find(item => item.id === first.id);
    expect((await owner.post(path + '/tasks/' + expired.id, {revision: expired.revision, notes: 'No output was delivered.', status: 'approved'})).status).toBe(409);
    await rt.db.query('UPDATE research_tasks SET lease_until=$1 WHERE id=$2', [Date.now() - 1000, next.id]);
    const retried = await snapshot(await owner.post(path + '/tasks/' + next.id, {revision: next.revision, notes: 'Reviewed the expired lease; retry this assignment.', status: 'queued'}));
    expect(retried.tasks.find(item => item.id === next.id).status).toBe('queued');
    expect(retried.connectedWorkers).toBe(0);
    expect((await workerPost(rt, 'complete', {roomId, taskId: next.id, leaseToken: next.leaseToken, result: 'An invalidated worker result.'})).status).toBe(409);
  } finally { await rt.store.close(); }
});

test('1000-slot room snapshots stay small while full research outputs load on demand', async () => {
  const rt = await setup({env: {HELIOS_RESEARCH_WORKER_TOKEN: workerToken}});
  try {
    const owner = await client(rt);
    const created = await snapshot(await owner.post(base, {...brief, agentCount: 1000, maxConcurrent: 100}));
    const roomId = created.room.id, path = base + '/' + roomId;
    const planned = await snapshot(await owner.post(path + '/plan', {revision: created.room.revision}));
    expect(planned.tasks).toHaveLength(1000);
    expect(new Set(planned.tasks.map(task => task.id)).size).toBe(1000);
    expect(Buffer.byteLength(JSON.stringify(planned))).toBeLessThan(350000);
    await snapshot(await owner.post(path + '/control', {revision: planned.room.revision, paused: false}));
    const claimResponse = await workerPost(rt, 'claim', {roomId, workerId: 'large-result-worker'});
    expect(claimResponse.status).toBe(200);
    const task = (await claimResponse.json()).task;
    const output = 'Complete output must load separately: ' + 'x'.repeat(15900);
    const completed = await workerPost(rt, 'complete', {roomId, taskId: task.id, leaseToken: task.leaseToken, result: output});
    expect(completed.status).toBe(200);
    const observed = await read(rt, path, owner);
    const serialized = JSON.stringify(observed);
    expect(Buffer.byteLength(serialized)).toBeLessThan(350000);
    expect(serialized).not.toContain(output);
    expect(serialized).not.toContain(task.leaseToken);
    expect(observed.tasks.every(item => !('prompt' in item) && !('notes' in item) && !('result' in item) && !('leaseToken' in item))).toBe(true);
    expect(observed.tasks.find(item => item.id === task.id)).toMatchObject({hasResult: true, status: 'needs_review'});
    const detail = await read(rt, path + '/tasks/' + task.id, owner);
    expect(detail.result).toBe(output);
    expect(detail.prompt.length).toBeGreaterThan(0);
    expect(detail).not.toHaveProperty('leaseToken');
    expect(detail).not.toHaveProperty('workerId');
    expect(observed.contributors).toBe(1);
  } finally { await rt.store.close(); }
});
