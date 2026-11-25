import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { randomBytes } from 'node:crypto';
import { createRegistry, parseKey, makeHandler } from './security-registry.js';

describe('private registry', () => {
  let db, key, registry;
  beforeEach(() => {
    db = new Database(':memory:');
    key = randomBytes(32);
    registry = createRegistry(db,key);
  });
  afterEach(() => db.close());

  test('only a keyed digest is persisted and exported rows omit email data', () => {
    const email = 'Example@EXAMPLE.test';
    const row = registry.add('Alex',email);
    expect(row.uuid).toMatch(/^[a-f0-9-]{36}$/);
    expect(row.security_level).toBe('green');
    expect(row.active).toBe(true);
    const stored = db.query('SELECT * FROM security_users').get();
    expect(stored.email_hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(email);
    expect(JSON.stringify(stored)).not.toContain('example.test');
    expect(JSON.stringify(db.query('SELECT * FROM security_audit').all())).not.toContain(email);
    expect(JSON.stringify(registry.list())).not.toContain(stored.email_hmac);
    expect(registry.exportCsv()).not.toContain(stored.email_hmac);
    expect(registry.exportCsv()).not.toContain(email);
    expect(() => registry.add('Duplicate','Example@example.test')).toThrow('already registered');
    expect(() => registry.add('leak@example.test','other@example.test')).toThrow();
  });
  test('refuses wrong keys and rejects invalid keys', () => {
    expect(parseKey(key.toString('base64')).equals(key)).toBe(true);
    expect(() => parseKey('')).toThrow();
    expect(() => createRegistry(db,randomBytes(32))).toThrow('Wrong registry key');
    expect(() => createRegistry(db,key)).not.toThrow();
  });
  test('assigned privileges require a verified identity in the integration caller', () => {
    const row = registry.add('Alex','alex@example.test');
    expect(registry.allowsVerifiedEmail('alex@example.test','yellow')).toBe(false);
    const member = registry.edit({...row,security_level:'yellow'});
    expect(registry.allowsVerifiedEmail('alex@example.test','yellow')).toBe(true);
    expect(registry.allowsVerifiedEmail('alex@example.test','red')).toBe(false);
    const admin = registry.edit({...member,security_level:'red'});
    expect(registry.allowsVerifiedEmail('alex@example.test','red')).toBe(true);
    registry.edit({...admin,active:false});
    expect(registry.allowsVerifiedEmail('alex@example.test','green')).toBe(false);
    expect(registry.allowsVerifiedEmail('unknown@example.test','green')).toBe(false);
    expect(registry.allowsVerifiedEmail('alex@example.test','purple')).toBe(false);
    expect(db.query('SELECT COUNT(*) AS n FROM security_audit').get().n).toBe(4);
  });
  test('CSV round trip, quoted names, conflict detection, atomic rejection', () => {
    const a=registry.add('Alex, "A"','a@example.test');
    const b=registry.add('Jamie','b@example.test');
    const csv=registry.exportCsv();
    expect(registry.importCsv(csv)).toHaveLength(2);
    expect(registry.list().find(r=>r.uuid===a.uuid).name).toBe(a.name);
    registry.edit({...b,name:'New name'});
    expect(()=>registry.importCsv(csv.replaceAll('"green"','"red"'))).toThrow('stale');
    expect(registry.list().find(r=>r.uuid===a.uuid).security_level).toBe('green');
    expect(()=>registry.edit({...a,name:'=1+1'})).toThrow();
    expect(()=>registry.importCsv('uuid,name,email\nx,y,z')).toThrow();
    expect(()=>registry.importCsv(csv.replaceAll('"green"','"purple"'))).toThrow();
  });
  test('private routes reject absent tokens, hostile origins, and invalid hosts', async () => {
    const origin='http://127.0.0.1:8766', token='test-local-token';
    const handle=makeHandler(registry,token,origin);
    const request=(path,opts={})=>new Request(origin+path,{...opts,headers:{host:'127.0.0.1:8766',...opts.headers}});
    expect((await handle(request('/'))).status).toBe(200);
    expect((await handle(request('/api/users'))).status).toBe(401);
    expect((await handle(request('/api/export'))).status).toBe(401);
    expect((await handle(request('/api/users',{headers:{host:'evil.example',authorization:'Bearer '+token}}))).status).toBe(403);
    const opts={method:'POST',headers:{authorization:'Bearer '+token,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({name:'Alex',email:'alex@example.test',security_level:'red'})};
    expect((await handle(request('/api/add',opts))).status).toBe(403);
    const added=await handle(request('/api/add',{...opts,headers:{...opts.headers,origin}}));
    expect(added.status).toBe(201);
    expect((await added.json()).security_level).toBe('green');
    const result=await handle(request('/api/users',{headers:{authorization:'Bearer '+token}}));
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.text()).not.toContain('alex@example.test');
    expect(registry.list()).toHaveLength(1);
  });
});
