import {test, expect} from 'bun:test';
import {hasResearchDatabase, getResearchRuntime, serveResearch} from '../src/research-preview.js';
import {createDatabase} from '../src/db.js';

test('research preview configuration never falls back to citizen database credentials', () => {
  expect(hasResearchDatabase({SUPABASE_DB_URL:'postgres://citizen-db',DATABASE_URL:'postgres://other-db'})).toBe(false);
  expect(hasResearchDatabase({HELIOS_RESEARCH_DB_URL:'  '})).toBe(false);
  expect(hasResearchDatabase({HELIOS_RESEARCH_DB_URL:'postgres://research-db'})).toBe(true);
  expect(() => createDatabase({}, {schema:'public; SELECT 1'})).toThrow('Invalid private database schema');
  expect(() => getResearchRuntime({HELIOS_RESEARCH_DB_URL:'postgres://research-db',HELIOS_RESEARCH_DB_SCHEMA:'helios_civic'})).toThrow('separate private schema');
});

test('research preview forwards only its own session and scopes response cookies to research', async () => {
  const researchCookie='a'.repeat(64), civicCookie='b'.repeat(64);
  let received;
  const response=await serveResearch(new Request('https://preview.example/api/research/session', {
    headers:{cookie:`helios_session=${civicCookie}; helios_research_session=${researchCookie}; other=private`, 'x-csrf-token':'draft-token'},
  }), 'test-client', {}, {getRuntime:async()=>({app:async request=>{
    received=request;
    return Response.json({ok:true},{headers:{'Set-Cookie':`helios_session=${researchCookie}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=7776000; Secure`}});
  }})});
  expect(received.headers.get('cookie')).toBe(`helios_session=${researchCookie}`);
  expect(received.headers.get('x-csrf-token')).toBe('draft-token');
  expect(response.headers.get('set-cookie')).toBe(`helios_research_session=${researchCookie}; HttpOnly; SameSite=Lax; Path=/api/research; Max-Age=7776000; Secure`);
  expect(response.headers.get('x-helios-research-storage')).toBe('isolated-supabase');
});

test('a citizen cookie alone cannot authenticate against the isolated research database', async () => {
  let cookie;
  await serveResearch(new Request('https://preview.example/api/research/rooms/demo',{
    headers:{cookie:'helios_session='+'b'.repeat(64)},
  }), 'test-client', {}, {getRuntime:async()=>({app:async request=>{
    cookie=request.headers.get('cookie');
    return Response.json({room:{canSupervise:false}});
  }})});
  expect(cookie).toBe(null);
});
