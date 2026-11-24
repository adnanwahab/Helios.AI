import {test, expect} from 'bun:test';
import {createHmac, randomBytes} from 'node:crypto';
import {createPGliteDatabase} from '../src/db-pglite.js';
import {createRuntime} from '../src/runtime.js';
import {addressOf, buildAutoReply, buildMessage, classifyReply, clientIP, emailConfig, isAutomated, normalizeEmail, verifyWebhook} from '../src/email.js';

const HOUR = 3600000, DAY = 24 * HOUR;
const secretBytes = randomBytes(24), secret = 'whsec_' + secretBytes.toString('base64');

async function setup({env = {}, respond} = {}) {
  const db = await createPGliteDatabase();
  let t = Date.parse('2026-11-20T15:00:00Z');
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({url: String(url), init, body: init.body ? JSON.parse(init.body) : null});
    const [status, data] = await (respond || (() => [200, {id: 're_' + calls.length}]))(String(url), init, calls.length);
    return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  };
  const config = emailConfig({RESEND_API_KEY: 're_test', EMAIL_FROM: 'Helios <hello@example.org>', RESEND_WEBHOOK_SECRET: secret, ...env});
  const logs = [], log = {warn: m => logs.push(m), error: m => logs.push(m)};
  const runtime = await createRuntime({db, secure: false, origins: ['https://helioshtml.com'], adminToken: 'test-admin', config, fetch, now: () => t, log, sendGapMs: 0});
  const q = (text, params = []) => db.query(text, params).then(r => r.rows);
  return {...runtime, db, email: runtime.email, app: runtime.app, calls, logs,
    advance: ms => { t += ms; }, now: () => t,
    row: async address => (await q('SELECT * FROM email_subscribers WHERE email_hash = (SELECT email_hash FROM email_subscribers WHERE email = $1)', [address]))[0],
    rows: () => q('SELECT * FROM email_subscribers'),
    byId: async id => (await q('SELECT * FROM email_subscribers WHERE id = $1', [id]))[0],
    count: async (text, params) => Number((await q(text, params))[0].n),
    q,
    close: () => runtime.store.close()};
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
  const s = await setup();
  try {
    const first = await signup(s.app, {email: '  Ada@Example.ORG ', source: 'https://happybearlandia.fly.dev/world?x=1'});
    expect(first.status).toBe(202);
    expect((await first.json()).ok).toBe(true);
    const row = await s.row('ada@example.org');
    expect(row.status).toBe('scheduled');
    expect(row.send_at).toBe(s.now() + 72 * HOUR);
    expect(row.source).toBe('https://happybearlandia.fly.dev');
    s.advance(HOUR);
    expect((await signup(s.app, {email: 'ada@example.org'})).status).toBe(202);
    expect(await s.rows()).toHaveLength(1);
    expect((await s.row('ada@example.org')).send_at).toBe(row.send_at);
    expect((await signup(s.app, {email: 'not-an-email'})).status).toBe(400);
    expect((await signup(s.app, {email: 'bot@example.org', company: 'Spam Inc'})).status).toBe(202);
    expect(await s.rows()).toHaveLength(1);
    expect((await signup(s.app, {email: 'x@example.org'}, {origin: 'https://evil.example'})).status).toBe(403);
    expect((await signup(s.app, {email: 'x@example.org'}, {origin: 'https://helioshtml.com'})).status).toBe(202);
    expect((await signup(s.app, {email: 'y@example.org'}, {type: 'text/plain'})).status).toBe(415);
  } finally { await s.close(); }
});

test('no-JavaScript form posts get a small result page, and signups are rate limited per client', async () => {
  const s = await setup();
  try {
    const ok = await signup(s.app, {email: 'grace@example.org', layout: 'inline'}, {type: 'application/x-www-form-urlencoded'});
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/html');
    expect(await ok.text()).toContain('Thanks! Your one email arrives in about three days.');
    expect((await s.row('grace@example.org')).status).toBe('scheduled');
    const bad = await signup(s.app, {email: 'nope', layout: 'inline'}, {type: 'application/x-www-form-urlencoded'});
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('href="/signup?layout=inline"');
    for (let i = 0; i < 20; i++) await signup(s.app, {email: `u${i}@example.org`}, {ip: '198.51.100.1'});
    expect((await signup(s.app, {email: 'last@example.org'}, {ip: '198.51.100.1'})).status).toBe(429);
    expect((await signup(s.app, {email: 'other@example.org'}, {ip: '198.51.100.2'})).status).toBe(202);
  } finally { await s.close(); }
});

test('sends exactly one email after 72 hours with Yes/No/Edit links into Civic Synthesis', async () => {
  const s = await setup({env: {EMAIL_REPLY_TO: 'reply@helios.resend.app'}});
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
    expect(body.headers['List-Unsubscribe']).toMatch(/^<https:\/\/helioshtml\.com\/email\/unsubscribe\?id=.+&token=.+>$/);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(body.tags).toEqual([{name: 'campaign', value: 'day3'}, {name: 'goal', value: 'HGA-078'}]);
    const row = await s.row('ada@example.org');
    expect(row.status).toBe('sent');
    expect(row.resend_id).toBe('re_1');
    expect(row.goal_id).toBe('HGA-078');
    s.advance(DAY);
    expect((await s.email.tick()).sent).toBe(0);
    expect(s.calls).toHaveLength(1);
    expect((await signup(s.app, {email: 'ada@example.org'})).status).toBe(202);
    expect((await s.row('ada@example.org')).status).toBe('sent');
    s.advance(31 * DAY);
    await signup(s.app, {email: 'ada@example.org'});
    expect((await s.row('ada@example.org')).status).toBe('scheduled');
    expect((await s.row('ada@example.org')).generation).toBe(2);
  } finally { await s.close(); }
});

test('unconfigured sending waits; outages retry with the same idempotency key; rejected addresses fail', async () => {
  let mode = 'down';
  const s = await setup({env: {RESEND_API_KEY: ''}, respond: (url, init, n) => (mode === 'down' ? [503, {message: 'unavailable'}] : mode === 'reject' ? [422, {message: 'Invalid `to` field'}] : [200, {id: 're_ok_' + n}])});
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
    const ada = await s.row('ada@example.org');
    expect(ada.status).toBe('scheduled');
    expect(ada.attempts).toBe(1);
    expect(ada.last_error).toContain('503');
    expect(ada.send_at).toBe(s.now() + 60000);
    s.advance(60000);
    mode = 'up';
    await s.email.tick();
    expect((await s.row('ada@example.org')).status).toBe('sent');
    const keys = s.calls.filter(c => c.body.to[0] === 'ada@example.org').map(c => c.init.headers['Idempotency-Key']);
    expect(new Set(keys).size).toBe(1);
    await s.q("UPDATE email_subscribers SET status = 'scheduled', send_at = 0, attempts = 0 WHERE email = 'bad@example.org'");
    mode = 'reject';
    await s.email.tick();
    expect((await s.row('bad@example.org')).status).toBe('failed');
  } finally { await s.close(); }
});

test('the scheduler stops starting sends when its time budget is spent, and the rest wait for the next run', async () => {
  const s = await setup();
  try {
    for (let i = 0; i < 3; i++) await signup(s.app, {email: `person${i}@example.org`});
    s.advance(73 * HOUR);
    let clock = 0;
    const realNow = performance.now.bind(performance);
    performance.now = () => (clock += 5000);
    try {
      const result = await s.email.tick({budgetMs: 7000});
      expect(result.sent).toBe(1);
      expect(result.pending).toBe(2);
    } finally {
      performance.now = realNow;
    }
    await s.email.tick();
    expect(s.calls).toHaveLength(3);
  } finally { await s.close(); }
});

test('unsubscribe link and one-click POST stop the email, delete the address and survive re-signup', async () => {
  const s = await setup();
  try {
    await signup(s.app, {email: 'ada@example.org'});
    const row = await s.row('ada@example.org');
    const link = `http://localhost/email/unsubscribe?id=${row.id}&token=${row.token}`;
    const confirm = await s.app(new Request(link));
    expect(confirm.status).toBe(200);
    const html = await confirm.text();
    expect(html).toContain('ada@example.org');
    expect(html).toContain('method="post"');
    expect((await s.app(new Request(`http://localhost/email/unsubscribe?id=${row.id}&token=wrong`))).status).toBe(404);
    const oneClick = await s.app(new Request(link, {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: 'List-Unsubscribe=One-Click'}));
    expect(oneClick.status).toBe(200);
    const after = await s.byId(row.id);
    expect(after.status).toBe('unsubscribed');
    expect(after.email).toBeNull();
    await signup(s.app, {email: 'ada@example.org'});
    expect((await s.byId(row.id)).status).toBe('unsubscribed');
    s.advance(80 * HOUR);
    await s.email.tick();
    expect(s.calls).toHaveLength(0);
  } finally { await s.close(); }
});

test('inbound webhook verifies signatures, stores replies once, reads intent and honors authenticated STOP', async () => {
  let reply = {text: 'Yes! Good idea.\n\n> On Monday Helios wrote:', authentication: {spf: 'pass', dkim: 'pass', dmarc: 'pass'}};
  const s = await setup({respond: url => (url.includes('/emails/receiving/') ? [200, {object: 'email', subject: 'Re: hi', html: null, ...reply}] : [200, {id: 're_x'}])});
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
    const stored = (await s.q('SELECT * FROM email_inbound'));
    expect(stored).toHaveLength(1);
    expect(stored[0].from_address).toBe('ada@example.org');
    expect(stored[0].intent).toBe('yes');
    expect(stored[0].subscriber_id).toBe((await s.row('ada@example.org')).id);
    expect(s.calls.at(-2).url).toBe(`https://api.resend.com/emails/receiving/${JSON.parse(body).data.email_id}`);
    expect(s.calls.at(-1).url).toBe('https://api.resend.com/emails');
    const fetches = s.calls.length;
    await post(body, headers);
    expect(s.calls.length).toBe(fetches);
    expect(await s.count('SELECT COUNT(*) AS n FROM email_inbound')).toBe(1);
    reply = {text: 'STOP', authentication: {spf: 'fail', dkim: 'fail', dmarc: 'fail'}};
    const forged = received('ada@example.org');
    await post(forged, signedHeaders(forged, s.now()));
    expect((await s.row('ada@example.org')).status).toBe('scheduled');
    reply = {text: 'stop', authentication: {spf: 'pass', dkim: 'pass', dmarc: 'pass'}};
    const real = received('ada@example.org');
    await post(real, signedHeaders(real, s.now()));
    expect(await s.count("SELECT COUNT(*) AS n FROM email_subscribers WHERE status = 'unsubscribed'")).toBe(1);
    const other = JSON.stringify({type: 'email.delivered', data: {email_id: 'x'}});
    expect(await (await post(other, signedHeaders(other, s.now()))).json()).toEqual({ignored: true});
  } finally { await s.close(); }
});

test('inbound fails closed without a secret; the email endpoints reject wrong methods', async () => {
  const s = await setup({env: {RESEND_WEBHOOK_SECRET: ''}});
  try {
    const body = received('a@example.org');
    expect((await s.app(new Request('http://localhost/api/email/inbound', {method: 'POST', headers: signedHeaders(body, s.now()), body}))).status).toBe(503);
    expect((await s.app(new Request('http://localhost/api/email/subscribe'))).status).toBe(405);
    expect((await (await s.app(new Request('http://localhost/api/health'))).json()).status).toBe('ok');
    expect((await s.app(new Request('http://localhost/public/../.env'))).status).toBe(404);
  } finally { await s.close(); }
});

test('helpers: addresses, reply intent, client IP from Netlify, signature checks and HTML escaping', () => {
  expect(normalizeEmail(' A.B+tag@Sub.Example.co ')).toBe('a.b+tag@sub.example.co');
  for (const bad of ['', 'a@b', 'a b@c.com', '<x>@y.com', 'a@-x.com', 'x'.repeat(250) + '@a.com', null]) expect(normalizeEmail(bad)).toBeNull();
  expect(classifyReply('yes please')).toBe('yes');
  expect(classifyReply('\n> quoted\nNo.')).toBe('no');
  expect(classifyReply('Edit: add a deadline')).toBe('edit');
  expect(classifyReply('I would change the second part')).toBe('reply');
  expect(classifyReply('', 'Unsubscribe')).toBe('unsubscribe');
  const request = new Request('http://x/', {headers: {'x-nf-client-connection-ip': '192.0.2.9'}});
  expect(clientIP(request, '10.0.0.1')).toBe('192.0.2.9');
  expect(clientIP(new Request('http://x/'), '10.0.0.1')).toBe('10.0.0.1');
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

const inbound = s => (body, headers = signedHeaders(body, s.now())) => s.app(new Request('http://localhost/api/email/inbound', {method: 'POST', headers, body}));
const sends = s => s.calls.filter(c => c.url === 'https://api.resend.com/emails');

test('inbound mail gets an immediate threaded auto-reply, once per message', async () => {
  const s = await setup({respond: url => (url.includes('/emails/receiving/') ? [200, {subject: 'Question about Helios', text: 'Hi, how do I join?', headers: {}, message_id: '<q1@mail.example>'}] : [200, {id: 're_auto'}])});
  try {
    const body = received('Ada Lovelace <Ada@Example.org>', {to: ['Helios <hello@heliosai.lol>'], subject: 'Question about Helios'});
    const headers = signedHeaders(body, s.now());
    expect((await inbound(s)(body, headers)).status).toBe(200);
    const [reply] = sends(s);
    expect(reply.body.to).toEqual(['ada@example.org']);
    expect(reply.body.subject).toBe('Re: Question about Helios');
    expect(reply.body.headers).toMatchObject({'Auto-Submitted': 'auto-replied', 'In-Reply-To': '<q1@mail.example>'});
    expect(reply.init.headers['Idempotency-Key']).toBe(`helios-autoreply-${JSON.parse(body).data.email_id}`);
    expect(reply.body.text).toContain('your message arrived');
    const [row] = await s.q('SELECT from_address, auto_reply_status, auto_reply_id FROM email_inbound');
    expect(row).toEqual({from_address: 'ada@example.org', auto_reply_status: 'sent', auto_reply_id: 're_auto'});
    await inbound(s)(body, headers);                       // Resend redelivery
    expect(sends(s)).toHaveLength(1);
  } finally { await s.close(); }
});

test('a yes reply is answered with a one-click link to confirm the vote', async () => {
  const s = await setup({respond: url => (url.includes('/emails/receiving/') ? [200, {subject: 'Re: Yes, no, or edit', text: 'yes', headers: {}}] : [200, {id: 're_auto'}])});
  try {
    await inbound(s)(received('ada@example.org'));
    const [reply] = sends(s);
    expect(reply.body.text).toContain('we got your "yes"');
    expect(reply.body.html).toContain('vote=yes');
    expect(reply.body.subject).toBe('Re: Yes, no, or edit');
  } finally { await s.close(); }
});

test('no auto-reply to robots, lists, ourselves, or unsubscribes; at most a few per sender per day', async () => {
  let headers = {'auto-submitted': 'auto-replied'}, text = 'Out of office';
  const s = await setup({respond: url => (url.includes('/emails/receiving/') ? [200, {text, headers, authentication: {dmarc: 'pass'}}] : [200, {id: 're_auto'}])});
  try {
    await inbound(s)(received('bob@example.org'));
    headers = {'list-id': '<news.example.org>'}; await inbound(s)(received('news@example.org'));
    headers = {}; await inbound(s)(received('noreply@example.org'));
    await inbound(s)(received('Helios <hello@example.org>'));
    text = 'STOP'; await inbound(s)(received('cy@example.org'));
    expect(sends(s)).toHaveLength(0);
    expect((await s.q('SELECT auto_reply_status AS v FROM email_inbound ORDER BY created_at, id')).map(r => r.v).sort())
      .toEqual(['skipped_automated', 'skipped_automated', 'skipped_automated', 'skipped_self', 'skipped_unsubscribe']);
    text = 'hello';
    for (let i = 0; i < 5; i++) await inbound(s)(received('dee@example.org'));
    expect(sends(s)).toHaveLength(3);
    expect(await s.count("SELECT COUNT(*) AS n FROM email_inbound WHERE auto_reply_status = 'skipped_rate_limit'")).toBe(2);
  } finally { await s.close(); }
});

test('a failed auto-reply asks Resend to redeliver, and the redelivery sends it', async () => {
  let down = true;
  const s = await setup({respond: url => (url.includes('/emails/receiving/') ? [200, {text: 'hi', headers: {}}] : down ? [503, {message: 'down'}] : [200, {id: 're_late'}])});
  try {
    const body = received('ada@example.org'), headers = signedHeaders(body, s.now());
    expect((await inbound(s)(body, headers)).status).toBe(502);
    down = false;
    expect((await inbound(s)(body, headers)).status).toBe(200);
    expect((await s.q('SELECT auto_reply_status AS v FROM email_inbound'))[0].v).toBe('sent');
    expect(await s.count('SELECT COUNT(*) AS n FROM email_inbound')).toBe(1);
  } finally { await s.close(); }
});

test('EMAIL_AUTO_REPLY=0 turns the auto-reply off', async () => {
  const s = await setup({env: {EMAIL_AUTO_REPLY: '0'}, respond: url => (url.includes('/emails/receiving/') ? [200, {text: 'hi', headers: {}}] : [200, {id: 're'}])});
  try {
    await inbound(s)(received('ada@example.org'));
    expect(sends(s)).toHaveLength(0);
  } finally { await s.close(); }
});

test('helpers: display-name addresses and automated-mail detection', () => {
  expect(addressOf('Ada Lovelace <Ada@Example.org>')).toBe('ada@example.org');
  expect(addressOf('ada@example.org')).toBe('ada@example.org');
  expect(isAutomated('ada@example.org', {Precedence: 'bulk'})).toBe(true);
  expect(isAutomated('ada@example.org', {'Auto-Submitted': 'no'})).toBe(false);
  expect(isAutomated('mailer-daemon@example.org', {})).toBe(true);
  const message = buildAutoReply({to: 'a@b.co', subject: 'Re: hi', messageId: 'bad\r\nBcc: x', intent: 'reply', goal: null, config: emailConfig({EMAIL_FROM: 'Helios <hello@example.org>'})});
  expect(message.subject).toBe('Re: hi');
  expect(message.headers['In-Reply-To']).toBeUndefined();
});
