import {createPGliteDatabase} from '../src/db-pglite.js';
import {createRuntime} from '../src/runtime.js';

// A fresh in-process Postgres per test. Pass a directory to keep data across restarts.
export async function setup(options = {}) {
  const db = options.db ?? await createPGliteDatabase();
  const runtime = await createRuntime({db, secure: false, adminToken: 'test-admin', origins: [], ...options, db});
  return {...runtime, db};
}

// Starts a browser-like session (cookie plus CSRF token) and returns a poster for writes.
export async function client(runtime, extraHeaders = {}) {
  const r = await runtime.app(new Request('http://localhost/api/session'));
  const session = await r.json();
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const post = (path, body, headers = {}) => runtime.app(new Request('http://localhost' + path, {
    method: 'POST',
    headers: {origin: 'http://localhost', 'content-type': 'application/json', 'x-csrf-token': session.csrfToken, cookie, 'idempotency-key': crypto.randomUUID(), ...extraHeaders, ...headers},
    body: JSON.stringify(body),
  }));
  return {app: runtime.app, cookie, session, post};
}
