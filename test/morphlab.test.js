import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMorphLabService, sanitizeShape, SHAPE_SCHEMA} from '../src/morphlab.js';
import {createApp} from '../src/app.js';
import {Problem} from '../src/store.js';

const point = (x = 0, y = 0, z = 0) => ({x, y, z});
const shape = {title: 'My jellyfish', description: 'A floating creature.', palette: 'ocean', parts: [{kind: 'ellipsoid', center: point(), size: point(1, 2, 1), rotation: point(), color: 'accent', weight: 1, path: []}]};

test('MorphLab is disabled by default and config never exposes a token', async () => {
  const disabled = createMorphLabService({env: {OPENAI_API_KEY: 'secret'}});
  assert.deepEqual(disabled.config(), {enabled: false, model: null});
  await assert.rejects(disabled.generate('jellyfish'), /not configured/);
  const enabled = createMorphLabService({env: {MORPHLAB_ENABLED: '1', OPENAI_API_KEY: 'secret'}});
  assert.equal(enabled.config().enabled, true);
  assert.ok(!JSON.stringify(enabled.config()).includes('secret'));
});

test('declarative geometry is clamped and unknown primitives cannot execute', () => {
  const safe = sanitizeShape({...shape, parts: [{...shape.parts[0], kind: 'eval', center: point(999, -999, 0), size: point(-10, 100, 0)}]});
  assert.equal(safe.parts[0].kind, 'ellipsoid');
  assert.deepEqual(safe.parts[0].center, point(8, -8, 0));
  assert.deepEqual(safe.parts[0].size, point(0.025, 6, 0.025));
  assert.throws(() => sanitizeShape({parts: []}), /no renderable shape/);
  assert.equal(SHAPE_SCHEMA.additionalProperties, false);
});

test('calls Responses API server-side with strict schema, store:false and sanitized return', async () => {
  let captured;
  const service = createMorphLabService({env: {MORPHLAB_ENABLED: '1', OPENAI_API_KEY: 'server-secret', OPENAI_MODEL: 'gpt-4.1-mini'}, fetchImpl: async (url, options) => {
    captured = {url, options};
    return Response.json({status: 'completed', output: [{content: [{type: 'output_text', text: JSON.stringify(shape)}]}]});
  }});
  const result = await service.generate('a glowing jellyfish');
  assert.equal(result.title, 'My jellyfish');
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.options.headers.Authorization, 'Bearer server-secret');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.ok(body.input.includes('a glowing jellyfish'));
  assert.ok(!JSON.stringify(result).includes('server-secret'));
});

test('rejects provider failure and unrenderable AI output', async () => {
  const env = {MORPHLAB_ENABLED: '1', OPENAI_API_KEY: 'secret'};
  const badStatus = createMorphLabService({env, fetchImpl: async () => new Response('oops', {status: 429})});
  await assert.rejects(badStatus.generate('rocket'), /unsuccessful/);
  const badShape = createMorphLabService({env, fetchImpl: async () => Response.json({output: [{content: [{type: 'output_text', text: '{}'}]}]})});
  await assert.rejects(badShape.generate('rocket'), /no renderable shape/);
});

function fixture({enabled = true, failRateLimit = false} = {}) {
  const limits = [];
  const store = {
    authenticate: async value => value === 'session123' ? {csrf: 'csrf123', id: 'user123'} : null,
    limit: async key => {limits.push(key); if (failRateLimit) throw new Problem(429, 'Too many requests.');},
  };
  const morphlab = {
    enabled, model: 'test-model',
    config: () => ({enabled, model: enabled ? 'test-model' : null}),
    generate: async () => shape,
  };
  const app = createApp({store, morphlab, origins: ['https://helioshtml.com']});
  const post = (prompt = 'jellyfish', headers = {}) => app(new Request('https://helioshtml.com/api/morphlab/shape', {
    method: 'POST',
    headers: {'content-type': 'application/json', origin: 'https://helioshtml.com', cookie: 'helios_session=session123', 'x-csrf-token': 'csrf123', ...headers},
    body: JSON.stringify({prompt}),
  }), '192.0.2.1');
  return {app, post, limits};
}

test('shape endpoint requires origin, session and CSRF; returns bounded AI recipe', async () => {
  const {app, post, limits} = fixture();
  const config = await (await app(new Request('https://helioshtml.com/api/morphlab/config'))).json();
  assert.deepEqual(config, {enabled: true, model: 'test-model'});
  const ok = await post();
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).shape.title, 'My jellyfish');
  assert.equal(limits.length, 2);
  assert.equal((await post('jellyfish', {origin: 'https://evil.test'})).status, 403);
  assert.equal((await post('jellyfish', {'x-csrf-token': 'wrong'})).status, 403);
  assert.equal((await post('jellyfish', {cookie: ''})).status, 403);
  assert.equal((await post('x')).status, 400);
  assert.equal((await post('x'.repeat(2100))).status, 413);
  assert.equal((await post('jellyfish', {'content-type': 'text/plain'})).status, 415);
});

test('disabled shape endpoint is 503 and rate limits fail closed', async () => {
  assert.equal((await fixture({enabled: false}).post()).status, 503);
  assert.equal((await fixture({failRateLimit: true}).post()).status, 429);
});
