import {test, expect} from 'bun:test';
import {createApp} from '../src/app.js';
import {createDatabase} from '../src/db.js';
import {setup} from './helpers.js';

test('Fly health reports the real PGlite adapter and machine runtime', async () => {
  const rt = await setup({env: {FLY_APP_NAME: 'helios-ai-laws'}});
  try {
    const response = await rt.app(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.storage).toBe('pglite');
    expect(data.runtime).toBe('fly-machine');
    expect(data.seedCount).toBe(100);
    expect(data.proposalCount).toBe(100);
    expect(data.catalogHash).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await rt.store.close();
  }
});

test('Netlify runtime is labeled correctly without guessing the database', async () => {
  const rt = await setup({env: {AWS_LAMBDA_FUNCTION_NAME: 'helios-api'}});
  try {
    const response = await rt.app(new Request('http://localhost/api/health'));
    expect((await response.json()).runtime).toBe('netlify-functions');
    expect(rt.db.kind).toBe('pglite');
  } finally {
    await rt.store.close();
  }
});

test('Supabase adapter identifies itself without connecting to production', async () => {
  const db = createDatabase({SUPABASE_DB_URL: 'postgresql://example:example@localhost:5432/postgres'});
  try {
    expect(db.kind).toBe('supabase-postgres');
  } finally {
    await db.close();
  }
});

test('health fails closed when the database catalog query fails', async () => {
  const app = createApp({store: {
    catalog: async () => { throw new Error('database unavailable'); },
    catalogHash: 'placeholder',
  }, health: {storage: 'pglite', runtime: 'fly-machine'}});
  const response = await app(new Request('http://localhost/api/health'));
  expect(response.status).toBe(500);
  expect((await response.json()).status).not.toBe('ok');
});
