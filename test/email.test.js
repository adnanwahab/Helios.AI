import {test, expect} from 'bun:test';
import {createHmac, randomBytes} from 'node:crypto';
import {openStore} from '../src/store.js';
import {createApp} from '../server.js';
import {createEmail, emailConfig, buildMessage, classifyReply, clientIP, normalizeEmail, verifyWebhook} from '../src/email.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const secretBytes = randomBytes(24), secret = 'whsec_' + secretBytes.toString('base64');

function setup({env = {}, respond} = {}) {
  const store = openStore(':memory:');
  let t = Date.parse('2026-11-20T15:00:00Z');
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({url: String(url), init, body: init.body ? JSON.parse(init.body) : null});
    const [status, data] = await (respond || (() => [200, {id: 're_' + calls.length}]))(String(url), init, calls.length);
    return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  };
  const config = emailConfig({RESEND_API_KEY: 're_test', EMAIL_FROM: 'Helios <hello@example.org>', RESEND_WEBHOOK_SECRET: secret, ...env});
  const logs = [], log = {warn: m => logs.push(m), error: m => logs.push(m)};
  const email = createEmail({store, origins: ['https://helioshtml.com'], config, fetch, now: () => t, log, sendGapMs: 0});
  const app = email.wrap(createApp({store}));
  return {store, email, app, calls, logs, advance: ms => { t += ms; }, now: () => t,
    row: address => store.db.query('SELECT * FROM email_subscribers WHERE email_hash=(SELECT email_hash FROM email_subscribers WHERE email=?)').get(address),
    rows: () => store.db.query('SELECT * FROM email_subscribers').all()};
}
const signup = (app, body, {origin = 'http://localhost', type = 'application/json', ip = '203.0.113.7'} = {}) =>
  app(new Request('http://localhost/api/email/subscribe', {method: 'POST', headers: {origin, 'content-type': type},
    body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString()}), ip);
function signedHeaders(body, now, id = 'msg_' + crypto.randomUUID()) {
  const ts = String(Math.floor(now / 1000));
  return {'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64'), 'content-type': 'application/json'};
}
const received = (from, extra = {}) => JSON.stringify({type: 'email.received', created_at: '2026-11-23T15:00:00Z',
  data: {email_id: 'in_' + crypto.randomUUID(), from, to: ['reply@helios.resend.app'], subject: 'Re: Yes, no, or edit', message_id: '<a@b>', created_at: '2026-11-23T15:00:00Z', attachments: [], ...extra}});

test('signup stores one normalized address, keeps the first send date, and refuses bad input', async () => {
  const s = setup();
  try {
    const first = await signup(s.app, {email: '  Ada@Example.ORG ', source: 'https://happybearlandia.fly.dev/world?x=1'});
    expect(first.status).toBe(202);
    expect((await first.json()).ok).toBe(true);
    const row = s.row('ada@example.org');
    expect(row.status).toBe('scheduled');
    expect(row.send_at).toBe(s.now() + 72 * HOUR);
    expect(row.source).toBe('https://happybearlandia.fly.dev');
    s.advance(HOUR);
    expect((await signup(s.app, {email: 'ada@example.org'})).status).toBe(202);
    expect(s.rows()).toHaveLength(1);
    expect(s.row('ada@example.org').send_at).toBe(row.send_at);
    expect((await signup(s.app, {email: 'not-an-email'})).status).toBe(400);
    expect((await signup(s.app, {email: 'bot@example.org', company: 'Spam Inc'})).status).toBe(202);
    expect(s.rows()).toHaveLength(1);
    expect((await signup(s.app, {email: 'x@example.org'}, {origin: 'https://evil.example'})).status).toBe(403);
    expect((await signup(s.app, {email: 'x@example.org'}, {origin: 'https://helioshtml.com'})).status).toBe(202);
    expect((await signup(s.app, {email: 'y@example.org'}, {type: 'text/plain'})).status).toBe(415);
  } finally { s.store.close(); }
});

test('no-JavaScript form posts get a small result page, and signups are rate limited per client', async () => {
  const s = setup();
  try {
    const ok = await signup(s.app, {email: 'grace@example.org', layout: 'inline'}, {type: 'application/x-www-form-urlencoded'});
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/html');
    expect(await ok.text()).toContain('Thanks! Your one email arrives in about three days.');
    expect(s.row('grace@example.org').status).toBe('scheduled');
    const bad = await signup(s.app, {email: 'nope', layout: 'inline'}, {type: 'application/x-www-form-urlencoded'});
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('href="/signup?layout=inline"');
    for (let i = 0; i < 20; i++) await signup(s.app, {email: `u${i}@example.org`}, {ip: '198.51.100.1'});
    expect((await signup(s.app, {email: 'last@example.org'}, {ip: '198.51.100.1'})).status).toBe(429);
    expect((await signup(s.app, {email: 'other@example.org'}, {ip: '198.51.100.2'})).status).toBe(202);
  } finally { s.store.close(); }
});

test('sends exactly one email after 72 hours with Yes/No/Edit links into Civic Synthesis', async () => {
  const s = setup({env: {EMAIL_REPLY_TO: 'reply@helios.resend.app'}});
  try {
    await signup(s.app, {email: 'ada@example.org'});
    s.advance(72 * HOUR - 60000);
    expect((await s.email.tick()).sent).toBe(0);
    expect(s.calls).toHaveLength(0);
    s.advance(60000);
    expect((await s.email.tick()).sent).toBe(1);
    expect(s.calls).toHaveLength(1);
    const {url, init, body} = s.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers['Authorization']).toBe('Bearer re_test');
    expect(init.headers['Idempotency-Key']).toMatch(/^helios-day3-[0-9a-f-]{36}-1$/);
    expect(body.from).toBe('Helios <hello@example.org>');
    expect(body.to).toEqual(['ada@example.org']);
    expect(body.reply_to).toBe('reply@helios.resend.app');
    expect(body.subject).toBe('Yes, no, or edit: Government Responds and Explains');
    for (const vote of ['yes', 'no', 'edit']) {
      const link = `https://civic-synthesis.fly.dev/votes?bill=HFL-078&amp;vote=${vote}&amp;utm_source=helios`;
      expect(body.html).toContain(link);
      expect(body.text).toContain(`https://civic-synthesis.fly.dev/votes?bill=HFL-078&vote=${vote}&utm_source=helios`);
    }
    expect(body.text).toContain('#amendment-HFL-078');
    expect(body.html.indexOf('>Yes</a>')).toBeGreaterThan(body.html.indexOf('Government Responds and Explains'));
    expect(body.headers['List-Unsubscribe']).toMatch(/^<https:\/\/helios-ai-laws\.fly\.dev\/email\/unsubscribe\?id=.+&token=.+>$/);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(body.tags).toEqual([{name: 'campaign', value: 'day3'}, {name: 'goal', value: 'HGA-078'}]);
    const row = s.row('ada@example.org');
    expect(row.status).toBe('sent');
    expect(row.resend_id).toBe('re_1');
    expect(row.goal_id).toBe('HGA-078');
    s.advance(DAY);
    expect((await s.email.tick()).sent).toBe(0);
    expect(s.calls).toHaveLength(1);
    expect((await signup(s.app, {email: 'ada@example.org'})).status).toBe(202);
    expect(s.row('ada@example.org').status).toBe('sent');
    s.advance(31 * DAY);
    await signup(s.app, {email: 'ada@example.org'});
    expect(s.row('ada@example.org').status).toBe('scheduled');
    expect(s.row('ada@example.org').generation).toBe(2);
  } finally { s.store.close(); }
});

test('unconfigured sending waits; outages retry with the same idempotency key; rejected addresses fail', async () => {
  let mode = 'down';
  const s = setup({env: {RESEND_API_KEY: ''}, respond: (url, init, n) => (mode === 'down' ? [503, {message: 'unavailable'}] : mode === 'reject' ? [422, {message: 'Invalid `to` field'}] : [200, {id: 're_ok_' + n}])});
  try {
    await signup(s.app, {email: 'ada@example.org'});
    await signup(s.app, {email: 'bad@example.org'});
    s.advance(73 * HOUR);
    expect((await s.email.tick()).configured).toBe(false);
    expect(s.calls).toHaveLength(0);
    expect(s.logs.join(' ')).toContain('RESEND_API_KEY');
    s.email.config.apiKey = 're_test';
    await s.email.tick();
    expect(s.calls).toHaveLength(2);
    const ada = s.row('ada@example.org');
    expect(ada.status).toBe('scheduled');
    expect(ada.attempts).toBe(1);
    expect(ada.last_error).toContain('503');
    expect(ada.send_at).toBe(s.now() + 60000);
    s.advance(60000);
    mode = 'up';
    await s.email.tick();
    expect(s.row('ada@example.org').status).toBe('sent');
    const keys = s.calls.filter(c => c.body.to[0] === 'ada@example.org').map(c => c.init.headers['Idempotency-Key']);
    expect(new Set(keys).size).toBe(1);
    s.store.db.query("UPDATE email_subscribers SET status='scheduled',send_at=0,attempts=0 WHERE email='bad@example.org'").run();
    mode = 'reject';
    await s.email.tick();
    expect(s.row('bad@example.org').status).toBe('failed');
  } finally { s.store.close(); }
});

test('unsubscribe link and one-click POST stop the email, delete the address and survive re-signup', async () => {
  const s = setup();
  try {
    await signup(s.app, {email: 'ada@example.org'});
    const row = s.row('ada@example.org');
    const link = `http://localhost/email/unsubscribe?id=${row.id}&token=${row.token}`;
    const confirm = await s.app(new Request(link));
    expect(confirm.status).toBe(200);
    const html = await confirm.text();
    expect(html).toContain('ada@example.org');
    expect(html).toContain('method="post"');
    expect((await s.app(new Request(`http://localhost/email/unsubscribe?id=${row.id}&token=wrong`))).status).toBe(404);
    const oneClick = await s.app(new Request(link, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: 'List-Unsubscribe=One-Click'}));
    expect(oneClick.status).toBe(200);
    const after = s.store.db.query('SELECT * FROM email_subscribers WHERE id=?').get(row.id);
    expect(after.status).toBe('unsubscribed');
    expect(after.email).toBeNull();
    await signup(s.app, {email: 'ada@example.org'});
    expect(s.store.db.query('SELECT status FROM email_subscribers WHERE id=?').get(row.id).status).toBe('unsubscribed');
    s.advance(80 * HOUR);
    await s.email.tick();
    expect(s.calls).toHaveLength(0);
  } finally { s.store.close(); }
});

test('inbound webhook verifies signatures, stores replies once, reads intent and honors authenticated STOP', async () => {
  let reply = {text: 'Yes! Good idea.\n\n> On Monday Helios wrote:', authentication: {spf: 'pass', dkim: 'pass', dmarc: 'pass'}};
  const s = setup({respond: url => (url.includes('/emails/receiving/') ? [200, {object: 'email', subject: 'Re: hi', html: null, ...reply}] : [200, {id: 're_x'}])});
  try {
    await signup(s.app, {email: 'ada@example.org'});
    const post = (body, headers) => s.app(new Request('http://localhost/api/email/inbound', {method: 'POST', headers, body}));
    const body = received('Ada@Example.org');
    expect((await post(body, {...signedHeaders(body, s.now()), 'svix-signature': 'v1,AAAA'})).status).toBe(401);
    expect((await post(body, signedHeaders(body, s.now() - 10 * 60000))).status).toBe(401);
    const headers = signedHeaders(body, s.now());
    const ok = await post(body, headers);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({received: true});
    const stored = s.store.db.query('SELECT * FROM email_inbound').all();
    expect(stored).toHaveLength(1);
    expect(stored[0].from_address).toBe('ada@example.org');
    expect(stored[0].intent).toBe('yes');
    expect(stored[0].subscriber_id).toBe(s.row('ada@example.org').id);
    expect(s.calls.at(-1).url).toBe(`https://api.resend.com/emails/receiving/${JSON.parse(body).data.email_id}`);
    const fetches = s.calls.length;
    await post(body, headers);
    expect(s.calls.length).toBe(fetches);
    expect(s.store.db.query('SELECT COUNT(*) n FROM email_inbound').get().n).toBe(1);
    reply = {text: 'STOP', authentication: {spf: 'fail', dkim: 'fail', dmarc: 'fail'}};
    const forged = received('ada@example.org');
    await post(forged, signedHeaders(forged, s.now()));
    expect(s.row('ada@example.org').status).toBe('scheduled');
    reply = {text: 'stop', authentication: {spf: 'pass', dkim: 'pass', dmarc: 'pass'}};
    const real = received('ada@example.org');
    await post(real, signedHeaders(real, s.now()));
    expect(s.store.db.query("SELECT COUNT(*) n FROM email_subscribers WHERE status='unsubscribed'").get().n).toBe(1);
    const other = JSON.stringify({type: 'email.delivered', data: {email_id: 'x'}});
    expect(await (await post(other, signedHeaders(other, s.now()))).json()).toEqual({ignored: true});
  } finally { s.store.close(); }
});

test('inbound fails closed without a secret; the iframe page is served and other routes still reach the app', async () => {
  const s = setup({env: {RESEND_WEBHOOK_SECRET: ''}});
  try {
    const body = received('a@example.org');
    expect((await s.app(new Request('http://localhost/api/email/inbound', {method: 'POST', headers: signedHeaders(body, s.now()), body}))).status).toBe(503);
    const page = await s.app(new Request('http://localhost/signup?layout=inline'));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('x-frame-options')).toBeNull();
    const html = await page.text();
    expect(html).toContain('action="/api/email/subscribe"');
    expect(html).toContain('name="company"');
    expect((await s.app(new Request('http://localhost/signup', {method: 'POST'}))).status).toBe(405);
    expect((await s.app(new Request('http://localhost/api/email/subscribe'))).status).toBe(405);
    expect((await (await s.app(new Request('http://localhost/api/health'))).json()).status).toBe('ok');
    expect((await s.app(new Request('http://localhost/public/../.env'))).status).toBe(404);
  } finally { s.store.close(); }
});

test('helpers: addresses, reply intent, client IP on Fly, signature checks and HTML escaping', () => {
  expect(normalizeEmail(' A.B+tag@Sub.Example.co ')).toBe('a.b+tag@sub.example.co');
  for (const bad of ['', 'a@b', 'a b@c.com', '<x>@y.com', 'a@-x.com', 'x'.repeat(250) + '@a.com', null]) expect(normalizeEmail(bad)).toBeNull();
  expect(classifyReply('yes please')).toBe('yes');
  expect(classifyReply('\n> quoted\nNo.')).toBe('no');
  expect(classifyReply('Edit: add a deadline')).toBe('edit');
  expect(classifyReply('I would change the second part')).toBe('reply');
  expect(classifyReply('', 'Unsubscribe')).toBe('unsubscribe');
  const request = new Request('http://x/', {headers: {'fly-client-ip': '192.0.2.9'}});
  expect(clientIP(request, '10.0.0.1', {FLY_APP_NAME: 'helios-ai-laws'})).toBe('192.0.2.9');
  expect(clientIP(request, '10.0.0.1', {})).toBe('10.0.0.1');
  const now = Date.now(), body = '{"a":1}', h = signedHeaders(body, now);
  expect(verifyWebhook({secret, id: h['svix-id'], timestamp: h['svix-timestamp'], signature: 'v0,x ' + h['svix-signature'], body, now})).toBe(true);
  expect(verifyWebhook({secret, id: h['svix-id'], timestamp: h['svix-timestamp'], signature: h['svix-signature'], body: body + ' ', now})).toBe(false);
  const message = buildMessage({subscriber: {id: 'id', token: 'tok', email: 'a@example.org'}, goal: {id: 'HGP-1', title: '<b>Bold</b> & "quoted"', sharedGoal: '<script>x</script>'}, config: emailConfig({EMAIL_FROM: 'Helios <h@example.org>'})});
  expect(message.html).toContain('&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot;');
  expect(message.html).not.toContain('<script>');
  expect(message.html).toContain('https://civic-synthesis.fly.dev/votes?vote=yes');
  expect(message.reply_to).toBeUndefined();
});

test('the opening line follows the configured delay', () => {
  const opening = hours => buildMessage({subscriber: {id: 'i', token: 't', email: 'a@example.org'}, goal: null, config: emailConfig({EMAIL_DELAY_HOURS: String(hours)})}).text.split('\n')[0];
  expect(opening(72)).toStartWith('Three days ago you signed up for Helios.');
  expect(opening(24)).toStartWith('Yesterday you signed up');
  expect(opening(0.01)).toStartWith('Recently you signed up');
});
