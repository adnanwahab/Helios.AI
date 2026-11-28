import {test, expect} from 'bun:test';
import handler from '../netlify/functions/api.mjs';
import {SITE_ID} from '../src/fly-civic-gateway.js';

const origin = 'https://deploy-preview-69--heliosailol.netlify.app';
const context = {site: {id:SITE_ID}, ip:'127.0.0.1'};

test('preview reports optional authentication separately from unavailable account storage', async () => {
  // Unit tests run without deployment secrets. No provider request or database
  // connection is needed to inspect capabilities or remain a guest.
  expect(Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.HELIOS_RESEARCH_DB_URL)).toBe(false);
  for (const prefix of ['/api/account', '/api/research/account']) {
    const response = await handler(new Request(origin + prefix + '/config'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const config = await response.json();
    expect(config.loginOptional).toBe(true);
    expect(config.accountPersistence).toEqual({votes:false,research:false,preferences:false});
    expect(config.emailSignInEnabled).toBe(false);
    const me = await handler(new Request(origin + prefix + '/me'), context);
    expect((await me.json()).signedIn).toBe(false);
    const write = await handler(new Request(origin + prefix + '/me', {method:'POST'}), context);
    expect(write.status).toBe(405);
  }
});
