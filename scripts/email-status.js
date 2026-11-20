// Run only from a trusted maintainer shell, for example:
//   fly ssh console --app helios-ai-laws --command "bun scripts/email-status.js"
//   fly ssh console --app helios-ai-laws --command "bun scripts/email-status.js send-now you@example.com"
// The first shows signup counts, the next send and recent replies. The second makes that
// address's pending email due now; the running server sends it within a minute.
import {Database} from 'bun:sqlite';
import {hash} from '../src/store.js';
import {normalizeEmail} from '../src/email.js';

const db = new Database(process.env.DATABASE_PATH || '.data/helios.sqlite');
try {
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('email_subscribers','email_inbound')").all();
  if (tables.length < 2) throw Error('Email tables not found. Start the server once with this version so it creates them.');
  const [command, address] = process.argv.slice(2);
  if (command === 'send-now') {
    const email = normalizeEmail(address);
    if (!email) throw Error('Usage: bun scripts/email-status.js send-now you@example.com');
    const changed = db.query("UPDATE email_subscribers SET send_at=? WHERE email_hash=? AND status='scheduled'").run(Date.now(), hash(email)).changes;
    console.log(changed ? `Due now: ${email}. The server sends it on its next check (within a minute).` : `No pending email for ${email}. Sign up first, or it was already sent.`);
  } else if (command) {
    throw Error('Usage: bun scripts/email-status.js [send-now you@example.com]');
  } else {
    const counts = Object.fromEntries(db.query('SELECT status, COUNT(*) AS n FROM email_subscribers GROUP BY status').all().map(r => [r.status, r.n]));
    const next = db.query("SELECT MIN(send_at) AS at, SUM(send_at<=?) AS due FROM email_subscribers WHERE status='scheduled'").get(Date.now());
    console.log('Signups:', ['scheduled', 'sending', 'sent', 'failed', 'unsubscribed'].map(s => `${s} ${counts[s] || 0}`).join(' · '));
    console.log('Next send:', next.at ? `${new Date(next.at).toISOString()} (${next.due || 0} due now)` : 'none pending');
    const failed = db.query("SELECT email, last_error, updated_at FROM email_subscribers WHERE status='failed' ORDER BY updated_at DESC LIMIT 5").all();
    if (failed.length) { console.log('\nRecent failures:'); for (const f of failed) console.log(`  ${f.updated_at}  ${f.email ?? '(deleted)'}  ${f.last_error}`); }
    const replies = db.query('SELECT created_at, from_address, intent, subject, text, fetch_error FROM email_inbound ORDER BY created_at DESC LIMIT 10').all();
    console.log(`\nReplies (latest ${replies.length}):`);
    for (const r of replies) {
      const preview = (r.text || '').split('\n').find(line => line.trim() && !line.startsWith('>'))?.trim().slice(0, 70) || r.fetch_error || r.subject || '';
      console.log(`  ${r.created_at}  ${r.from_address}  [${r.intent || '?'}]  ${preview}`);
    }
  }
} finally {
  db.close();
}
