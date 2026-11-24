// Email for Helios: an embeddable signup form, one email sent EMAIL_DELAY_HOURS
// after signup (default 72h) through Resend, one-click unsubscribe, and a signed
// Resend webhook that receives replies (inbound email). Sending runs from a
// Netlify scheduled function that calls tick() (see netlify/functions/email-tick.mjs).
import {Problem, hash} from './store.js';
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const MAX_ATTEMPTS = 8;              // 1+2+4+…+128 min of backoff stays inside Resend's 24h idempotency window
const RESEND_AFTER_MS = 30 * DAY;    // signing up again more than 30 days after the email schedules one more
const BODY_LIMIT = 32768;

export function emailConfig(env = process.env) {
  const text = value => (value || '').trim();
  const url = (value, fallback) => (text(value) || fallback).replace(/\/+$/, '');
  const hours = Number(env.EMAIL_DELAY_HOURS ?? 72);
  return {
    apiKey: text(env.RESEND_API_KEY),
    from: text(env.EMAIL_FROM),                  // e.g. "Helios <hello@helioshtml.com>" on a domain verified in Resend
    replyTo: text(env.EMAIL_REPLY_TO),           // optional: an address on your Resend receiving domain
    webhookSecret: text(env.RESEND_WEBHOOK_SECRET),
    publicUrl: url(env.PUBLIC_BASE_URL, 'https://helioshtml.com'),
    civicUrl: url(env.CIVIC_SYNTHESIS_URL, 'https://civic-synthesis.fly.dev'),
    goalId: text(env.EMAIL_GOAL_ID) || 'HGA-078',
    delayMs: Number.isFinite(hours) && hours >= 0 ? Math.round(hours * HOUR) : 72 * HOUR,
    apiBase: url(env.RESEND_API_URL, 'https://api.resend.com'),
  };
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(email) ? email : null;
}

// Netlify's edge sets x-nf-client-connection-ip and overwrites any value a client sends.
export function clientIP(request, fallback = 'unknown') {
  return request.headers.get('x-nf-client-connection-ip')?.trim() || fallback;
}

// Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body" with the
// base64 key after "whsec_"; the header holds space-separated "v1,<base64>" entries.
export function verifyWebhook({secret, id, timestamp, signature, body, now = Date.now(), toleranceSeconds = 300}) {
  if (!secret || !id || !timestamp || !signature || typeof body !== 'string') return false;
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(now / 1000 - seconds) > toleranceSeconds) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  if (!key.length) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some(entry => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// First meaningful line of a reply → yes | no | edit | unsubscribe | reply | empty.
export function classifyReply(text = '', subject = '') {
  const line = String(text || '').split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('>')) || '';
  const word = line.toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0] || '';
  if (word === 'stop' || word === 'unsubscribe' || /^\s*unsubscribe\b/i.test(subject || '')) return 'unsubscribe';
  if (['yes', 'yep', 'yeah', 'y', 'support'].includes(word)) return 'yes';
  if (['no', 'nope', 'n', 'oppose'].includes(word)) return 'no';
  if (word === 'edit') return 'edit';
  return line ? 'reply' : 'empty';
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const tagSafe = value => String(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);

export function voteLinks(goal, config) {
  const billId = goal?.sourceProposalId || null;
  const base = billId ? `${config.civicUrl}/votes?bill=${encodeURIComponent(billId)}` : `${config.civicUrl}/votes`;
  const link = vote => `${base}${base.includes('?') ? '&' : '?'}vote=${vote}&utm_source=helios&utm_medium=email&utm_campaign=day3`
    + (vote === 'edit' && billId ? `#amendment-${encodeURIComponent(billId)}` : '');
  return {yes: link('yes'), no: link('no'), edit: link('edit')};
}

export function buildMessage({subscriber, goal, config}) {
  const links = voteLinks(goal, config);
  const unsubscribe = `${config.publicUrl}/email/unsubscribe?id=${encodeURIComponent(subscriber.id)}&token=${encodeURIComponent(subscriber.token)}`;
  const title = goal?.title || 'One plan to vote on';
  const site = config.publicUrl.replace(/^https?:\/\//, '');
  const source = goal?.sourceProposalId ? `${goal.sourceProposalId}${goal.sourceProposalTitle ? ' · ' + goal.sourceProposalTitle : ''}` : '';
  const replyLine = config.replyTo ? 'Prefer email? Reply with yes, no, or your edit.' : '';
  const days = Math.round(config.delayMs / DAY);
  const when = days === 1 ? 'Yesterday' : days >= 2 && days <= 7 ? ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][days - 2] + ' days ago' : 'Recently';
  const opener = `${when} you signed up for Helios. Here is the one email we promised: a single idea people have put forward, and a quick way to say what you think.`;
  const button = (label, href) => `<td align="center" width="33%" style="padding:0 4px"><a href="${escapeHtml(href)}" style="display:block;padding:13px 0;border-radius:999px;background:#0b1220;color:#ffffff;font:700 15px/1 Arial,Helvetica,sans-serif;text-decoration:none">${label}</a></td>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">One idea, about a minute: yes, no, or edit.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px">
<tr><td style="padding:28px 28px 8px;font:700 14px/1.2 Arial,Helvetica,sans-serif;color:#e8743b;letter-spacing:.04em">☀ HELIOS</td></tr>
<tr><td style="padding:4px 28px 0;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1d2433">
<p style="margin:0 0 14px">${opener}</p>
</td></tr>
<tr><td style="padding:6px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fb;border:1px solid #e3e7ef;border-radius:12px"><tr><td style="padding:18px 20px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#1d2433">
<div style="font:700 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.08em;color:#6b7690;margin-bottom:8px">SHARED GOAL${goal?.id ? ' · ' + escapeHtml(goal.id) : ''}</div>
<div style="font:700 20px/1.25 Arial,Helvetica,sans-serif;color:#0b1220;margin-bottom:8px">${escapeHtml(title)}</div>
${goal?.sharedGoal ? `<div style="margin-bottom:10px">${escapeHtml(goal.sharedGoal)}</div>` : ''}
${goal?.illustrativeLocalOption ? `<div style="color:#46506a"><strong>One way it could work:</strong> ${escapeHtml(goal.illustrativeLocalOption)}</div>` : ''}
${source ? `<div style="margin-top:10px;font-size:13px;color:#6b7690">Based on ${escapeHtml(source)}</div>` : ''}
</td></tr></table></td></tr>
<tr><td style="padding:22px 28px 10px;font:700 17px/1.3 Arial,Helvetica,sans-serif;color:#0b1220">Would you support this?</td></tr>
<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${button('Yes', links.yes)}${button('No', links.no)}${button('Edit', links.edit)}</tr></table></td></tr>
<tr><td style="padding:14px 28px 24px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#6b7690">Each button opens this idea on Civic Synthesis, where you confirm your answer. It is an advisory, non-binding vote, not an official election.${replyLine ? '<br>' + replyLine : ''}</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#7b8194">You signed up for one email from Helios at ${escapeHtml(site)}, and this is it. Didn't sign up? You can ignore it.<br><a href="${escapeHtml(unsubscribe)}" style="color:#7b8194">Unsubscribe and delete my address</a></p>
</td></tr></table></body></html>`;

  const text = [
    opener,
    '',
    `${goal?.id ? goal.id + ': ' : ''}${title}`,
    goal?.sharedGoal || '',
    goal?.illustrativeLocalOption ? `One way it could work: ${goal.illustrativeLocalOption}` : '',
    source ? `Based on ${source}` : '',
    '',
    'Would you support this?',
    `Yes:  ${links.yes}`,
    `No:   ${links.no}`,
    `Edit: ${links.edit}`,
    '',
    'Each link opens this idea on Civic Synthesis, where you confirm your answer. It is an advisory, non-binding vote, not an official election.',
    replyLine,
    '',
    `You signed up for one email from Helios at ${site}, and this is it. Didn't sign up? You can ignore it.`,
    `Unsubscribe and delete my address: ${unsubscribe}`,
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');

  return {
    from: config.from,
    to: [subscriber.email],
    subject: `Yes, no, or edit: ${title}`,
    html,
    text,
    headers: {'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
    tags: [{name: 'campaign', value: 'day3'}, ...(goal?.id ? [{name: 'goal', value: tagSafe(goal.id)}] : [])],
    ...(config.replyTo ? {reply_to: config.replyTo} : {}),
  };
}

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Helios</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1220;color:#e7eef9;font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:440px;margin:24px;padding:28px;border:1px solid #26344e;border-radius:16px;background:#121b2d}h1{margin:0 0 10px;font-size:22px}p{margin:0 0 16px;color:#9fb1cc}button{border:0;border-radius:999px;padding:12px 20px;background:#e8743b;color:#0b1220;font-weight:700;font-size:15px;cursor:pointer}a{color:#7ce4cf}</style></head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}});
}

async function readBody(request, max) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new Problem(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new Problem(413, 'Request is too large.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const cleanSource = value => {
  try { const url = new URL(String(value)); return /^https?:$/.test(url.protocol) ? url.origin.slice(0, 200) : null; } catch { return null; }
};

export function createEmail({store, origins = [], adminToken = null, config = emailConfig(), fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), log = console, sendGapMs = 150} = {}) {
  if (!store?.db) throw Error('Store required');
  const db = store.db;
  const iso = () => new Date(now()).toISOString();
  const json = (data, status = 200, extra = {}) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
  const sleep = ms => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());
  let running = false, warned = false;

  async function subscribe(rawEmail, {source = null} = {}) {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new Problem(400, 'Enter a valid email address.');
    const emailHash = hash(email), t = now(), stamp = iso();
    await db.transaction(async tx => {
      // Serializes concurrent signups of the same address.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['email:' + emailHash]);
      const row = (await tx.query('SELECT * FROM email_subscribers WHERE email_hash = $1', [emailHash])).rows[0];
      if (!row) {
        await tx.query(`INSERT INTO email_subscribers(id, email, email_hash, status, send_at, source, token, created_at, updated_at)
          VALUES($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8)`,
        [crypto.randomUUID(), email, emailHash, t + config.delayMs, source, randomBytes(24).toString('base64url'), stamp, stamp]);
        return;
      }
      // Unsubscribed addresses stay unsubscribed; scheduled ones keep their original date.
      const again = row.status === 'failed' || (row.status === 'sent' && row.sent_at < t - RESEND_AFTER_MS);
      if (again) await tx.query(`UPDATE email_subscribers SET status = 'scheduled', email = $1, send_at = $2, generation = generation + 1, attempts = 0,
        claimed_at = NULL, last_error = NULL, updated_at = $3 WHERE id = $4`, [email, t + config.delayMs, stamp, row.id]);
    });
  }

  async function unsubscribeById(id) {
    const result = await db.query(`UPDATE email_subscribers SET status = 'unsubscribed', email = NULL, claimed_at = NULL, updated_at = $1 WHERE id = $2 AND status != 'unsubscribed'`, [iso(), id]);
    return result.rowCount === 1;
  }

  async function findByToken(id, token) {
    if (typeof id !== 'string' || typeof token !== 'string' || id.length > 64 || token.length > 128) return null;
    const row = (await db.query('SELECT * FROM email_subscribers WHERE id = $1', [id])).rows[0];
    if (!row) return null;
    const a = Buffer.from(token), b = Buffer.from(row.token);
    return a.length === b.length && timingSafeEqual(a, b) ? row : null;
  }

  async function sendOne(id) {
    const t = now();
    const claim = await db.query(`UPDATE email_subscribers SET status = 'sending', claimed_at = $1, attempts = attempts + 1, updated_at = $2
      WHERE id = $3 AND status = 'scheduled' AND send_at <= $4`, [t, iso(), id, t]);
    if (claim.rowCount !== 1) return false;
    const subscriber = (await db.query('SELECT * FROM email_subscribers WHERE id = $1', [id])).rows[0];
    let goal = null;
    try { goal = (await store.detail(config.goalId)).law; } catch { log.warn(`Email: goal ${config.goalId} not found; sending without goal details.`); }
    let result;
    try {
      const response = await fetchImpl(config.apiBase + '/emails', {
        method: 'POST',
        headers: {'Authorization': 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': `helios-day3-${subscriber.id}-${subscriber.generation}`},
        body: JSON.stringify(buildMessage({subscriber, goal, config})),
        signal: AbortSignal.timeout(15000),
      });
      result = {status: response.status, ok: response.ok, data: await response.json().catch(() => ({}))};
    } catch (error) {
      result = {status: 0, ok: false, data: {message: error?.name || 'Network error'}};
    }
    if (result.ok && typeof result.data?.id === 'string') {
      await db.query(`UPDATE email_subscribers SET status = 'sent', sent_at = $1, resend_id = $2, goal_id = $3, last_error = NULL, claimed_at = NULL, updated_at = $4 WHERE id = $5`,
        [now(), result.data.id, goal?.id || null, iso(), id]);
      return true;
    }
    const error = `${result.status || 'network'}: ${String(result.data?.message || result.data?.name || 'send failed').slice(0, 300)}`;
    // Network errors, rate limits, Resend outages and key/domain problems are retried; other 4xx mean this address can't be sent to.
    const retry = [0, 401, 403, 409, 429].includes(result.status) || result.status >= 500;
    if (retry && subscriber.attempts < MAX_ATTEMPTS) {
      await db.query(`UPDATE email_subscribers SET status = 'scheduled', send_at = $1, last_error = $2, claimed_at = NULL, updated_at = $3 WHERE id = $4`,
        [now() + Math.min(6 * HOUR, MINUTE * 2 ** (subscriber.attempts - 1)), error, iso(), id]);
    } else {
      await db.query(`UPDATE email_subscribers SET status = 'failed', last_error = $1, claimed_at = NULL, updated_at = $2 WHERE id = $3`, [error, iso(), id]);
    }
    log.error(`Email: send failed (${error.slice(0, 80)})`);
    return false;
  }

  // Sends due emails. budgetMs stops starting new sends once the budget is spent,
  // so a scheduled run finishes inside the function timeout; the rest wait for the next run.
  async function tick({batch = 50, budgetMs = Infinity} = {}) {
    if (running) return {skipped: true};
    running = true;
    const started = performance.now();
    try {
      if (!config.apiKey || !config.from) {
        if (!warned) { log.warn('Email: RESEND_API_KEY and EMAIL_FROM are not set. Signups are stored and will send once both are configured.'); warned = true; }
        return {sent: 0, configured: false};
      }
      const t = now();
      // A crash mid-send leaves a claim behind; release it. The idempotency key stops a duplicate.
      await db.query(`UPDATE email_subscribers SET status = 'scheduled', claimed_at = NULL WHERE status = 'sending' AND claimed_at < $1`, [t - 10 * MINUTE]);
      const due = (await db.query(`SELECT id FROM email_subscribers WHERE status = 'scheduled' AND send_at <= $1 ORDER BY send_at LIMIT $2`, [t, batch])).rows;
      let sent = 0;
      for (const [i, {id}] of due.entries()) {
        if (performance.now() - started > budgetMs) break;
        if (i) await sleep(sendGapMs);                // Resend allows 10 requests/second per team
        if (await sendOne(id)) sent++;
      }
      return {sent, configured: true, pending: due.length - sent};
    } finally {
      running = false;
    }
  }

  async function fetchInboundContent(emailId) {
    if (!config.apiKey) { await db.query('UPDATE email_inbound SET fetch_error = $1 WHERE id = $2', ['RESEND_API_KEY is not set', emailId]); return; }
    try {
      const response = await fetchImpl(`${config.apiBase}/emails/receiving/${encodeURIComponent(emailId)}`, {headers: {'Authorization': 'Bearer ' + config.apiKey}, signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('Resend returned ' + response.status);
      const received = await response.json();
      const text = typeof received.text === 'string' ? received.text.slice(0, 100000) : null;
      const html = typeof received.html === 'string' ? received.html.slice(0, 200000) : null;
      const intent = classifyReply(text ?? (html || '').replace(/<[^>]+>/g, '\n'), received.subject);
      await db.query('UPDATE email_inbound SET text = $1, html = $2, authentication = $3, intent = $4, fetch_error = NULL WHERE id = $5',
        [text, html, JSON.stringify(received.authentication ?? null), intent, emailId]);
      // Only act on "unsubscribe"/"stop" when the sender's domain authenticated, so a forged From can't unsubscribe someone.
      const authenticated = received.authentication?.dmarc === 'pass' || received.authentication?.dkim === 'pass';
      const row = (await db.query('SELECT subscriber_id FROM email_inbound WHERE id = $1', [emailId])).rows[0];
      if (intent === 'unsubscribe' && authenticated && row?.subscriber_id) await unsubscribeById(row.subscriber_id);
    } catch (error) {
      await db.query('UPDATE email_inbound SET fetch_error = $1 WHERE id = $2', [String(error?.message || error).slice(0, 200), emailId]);
    }
  }

  async function receive(request) {
    if (!config.webhookSecret) throw new Problem(503, 'Inbound email is not configured.');
    const body = await readBody(request, BODY_LIMIT);
    const h = request.headers;
    if (!verifyWebhook({secret: config.webhookSecret, id: h.get('svix-id'), timestamp: h.get('svix-timestamp'), signature: h.get('svix-signature'), body, now: now()}))
      throw new Problem(401, 'Invalid webhook signature.');
    let event;
    try { event = JSON.parse(body); } catch { throw new Problem(400, 'Invalid JSON.'); }
    if (event?.type !== 'email.received') return json({ignored: true});
    const data = event.data || {};
    if (typeof data.email_id !== 'string' || !data.email_id || data.email_id.length > 100) throw new Problem(400, 'Missing email_id.');
    const from = normalizeEmail(data.from);
    const subscriber = from ? (await db.query('SELECT id FROM email_subscribers WHERE email_hash = $1', [hash(from)])).rows[0] : null;
    const inserted = await db.query(`INSERT INTO email_inbound(id, webhook_id, from_address, to_addresses, subject, message_id, received_at, subscriber_id, created_at)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO NOTHING`,
    [data.email_id, h.get('svix-id'), from || String(data.from || '').slice(0, 254),
      JSON.stringify(Array.isArray(data.to) ? data.to.slice(0, 50) : []), String(data.subject || '').slice(0, 998),
      typeof data.message_id === 'string' ? data.message_id.slice(0, 998) : null, typeof data.created_at === 'string' ? data.created_at : null,
      subscriber?.id || null, iso()]);
    if (inserted.rowCount === 1) await fetchInboundContent(data.email_id);
    return json({received: true});
  }

  // Answer for browsers posting the form without JavaScript: a tiny page that fits the same iframe.
  function formResult(kind, status, inline) {
    const text = {done: 'Thanks! Your one email arrives in about three days.', invalid: 'Enter a valid email address.', rate: 'Too many tries. Please wait a bit and try again.', failed: 'Something went wrong. Please try again.'}[kind];
    const back = kind === 'done' ? '' : ` <a href="/signup${inline ? '?layout=inline' : ''}" style="color:#7ce4cf">Try again</a>`;
    const style = inline ? 'margin:0;height:44px;display:flex;align-items:center;padding:0 8px;white-space:nowrap' : 'margin:0;padding:22px;border:1px solid #26344e;border-radius:16px;background:#121b2d';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Helios email signup</title></head>
<body style="margin:0;background:transparent;color:${kind === 'done' ? '#7ce4cf' : '#ff9b8a'};font:${inline ? 13 : 15}px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><p role="status" style="${style}">${text}${back}</p></body></html>`;
    return new Response(html, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  }

  async function signup(request, url, ip) {
    const type = (request.headers.get('content-type') || '').toLowerCase();
    const isForm = type.startsWith('application/x-www-form-urlencoded');
    let inline = false;
    try {
      if (![url.origin, ...origins].includes(request.headers.get('origin'))) throw new Problem(403, 'A same-origin request is required.');
      if (!isForm && !type.startsWith('application/json')) throw new Problem(415, 'Use application/json.');
      const raw = await readBody(request, 4096);
      let body;
      if (isForm) body = Object.fromEntries(new URLSearchParams(raw));
      else { try { body = JSON.parse(raw); } catch { throw new Problem(400, 'Invalid JSON.'); } }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Problem(400, 'Invalid request.');
      inline = body.layout === 'inline';
      await store.limit('email-signup:' + hash(ip), 20, HOUR);
      // "company" is a hidden field people never see; bots that fill it get the normal answer and nothing is stored.
      if (!(typeof body.company === 'string' && body.company.trim())) await subscribe(body.email, {source: cleanSource(body.source)});
      return isForm ? formResult('done', 200, inline) : json({ok: true, message: 'Thanks! Watch your inbox in about three days.'}, 202);
    } catch (error) {
      if (!isForm || !(error instanceof Problem)) throw error;
      return formResult(error.status === 429 ? 'rate' : error.status === 400 ? 'invalid' : 'failed', error.status, inline);
    }
  }

  async function unsubscribe(request, url) {
    const id = url.searchParams.get('id'), token = url.searchParams.get('token');
    const row = await findByToken(id, token);
    if (request.method === 'POST') {
      // Mail apps send RFC 8058 one-click POSTs here; the browser form does too.
      await readBody(request, 1024).catch(() => '');
      if (!row) return page('This link is not valid', '<p>We couldn’t find that subscription. It may already be deleted.</p>', 404);
      await unsubscribeById(row.id);
      return page('You’re unsubscribed', '<p>We won’t email you again, and we’ve deleted your email address.</p>');
    }
    if (!row) return page('This link is not valid', '<p>We couldn’t find that subscription. It may already be deleted.</p>', 404);
    if (row.status === 'unsubscribed') return page('You’re unsubscribed', '<p>We won’t email you again, and your email address is deleted.</p>');
    const action = `/email/unsubscribe?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
    return page('Unsubscribe from Helios?', `<p>We’ll stop any email to ${escapeHtml(row.email)} and delete the address.</p><form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>`);
  }

  // Private operator mailbox: intentionally not available to anonymous visitors.
  // The maintainer token is provided in a request header, never embedded in HTML.
  function authorizeMailbox(request) {
    const given = request.headers.get('authorization');
    if (!adminToken) throw new Problem(503, 'Mail administration is not configured.');
    const expected = 'Bearer ' + adminToken;
    const a = Buffer.from(given || ''), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Problem(403, 'Maintainer authorization required.');
  }

  async function mailbox(request, url) {
    authorizeMailbox(request);
    if (request.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
      const rows = (await db.query(`SELECT id, from_address, to_addresses, subject, text, intent, received_at, created_at, fetch_error
        FROM email_inbound ORDER BY created_at DESC LIMIT $1`, [limit])).rows;
      return json({messages: rows, sendingConfigured: !!(config.apiKey && config.from), receivingConfigured: !!config.webhookSecret});
    }
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, {Allow: 'GET, POST'});
    if (![url.origin, ...origins].includes(request.headers.get('origin'))) throw new Problem(403, 'A same-origin request is required.');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Problem(415, 'Use application/json.');
    const raw = await readBody(request, 12000);
    let data;
    try { data = JSON.parse(raw); } catch { throw new Problem(400, 'Invalid JSON.'); }
    const to = normalizeEmail(data?.to);
    const subject = typeof data?.subject === 'string' ? data.subject.trim() : '';
    const body = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!to || !subject || subject.length > 200 || !body || body.length > 10000) throw new Problem(400, 'Provide a valid recipient, subject and message.');
    if (!config.apiKey || !config.from) throw new Problem(503, 'Resend sending is not configured.');
    await store.limit('mail-admin-send', 30, HOUR);
    let upstream;
    try {
      upstream = await fetchImpl(config.apiBase + '/emails', {
        method: 'POST',
        headers: {'Authorization': 'Bearer ' + config.apiKey, 'Content-Type': 'application/json'},
        body: JSON.stringify({from: config.from, to: [to], subject, text: body, ...(config.replyTo ? {reply_to: config.replyTo} : {})}),
        signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Problem(502, 'Resend could not be reached.'); }
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !result.id) throw new Problem(502, 'Resend rejected the message (' + upstream.status + ').');
    return json({sent: true, id: result.id}, 201);
  }

  // Returns null for paths this module does not own, so the caller can route them.
  async function handle(request, ip = 'local') {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    const only = allowed => (allowed.includes(method) ? null : json({error: 'Method not allowed'}, 405, {Allow: allowed.join(', ')}));
    try {
      if (path === '/api/email/subscribe') return only(['POST']) ?? await signup(request, url, ip);
      if (path === '/email/unsubscribe') return only(['GET', 'HEAD', 'POST']) ?? await unsubscribe(request, url);
      if (path === '/api/email/inbound') return only(['POST']) ?? await receive(request);
      if (path === '/api/email/mailbox') return await mailbox(request, url);
      return null;
    } catch (error) {
      if (error instanceof Problem) return json({error: error.message}, error.status);
      log.error('Email request failed:', error?.name || 'Error');
      return json({error: 'The request could not be completed.'}, 500);
    }
  }

  return {config, handle, tick, subscribe, sendOne};
}
