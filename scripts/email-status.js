// Run only from a trusted maintainer shell (SUPABASE_DB_URL must be set):
//   node scripts/email-status.js
//   node scripts/email-status.js send-now you@example.com
// The first shows signup counts, the next send and recent replies. The second makes that
// address's pending email due now; the next scheduled email run sends it.
import {createDatabase} from '../src/db.js';
import {hash} from '../src/store.js';
import {normalizeEmail} from '../src/email.js';

const db = createDatabase();
try {
  const [command, address] = process.argv.slice(2);
  if (command === 'send-now') {
    const email = normalizeEmail(address);
    if (!email) throw Error('Usage: node scripts/email-status.js send-now you@example.com');
    const result = await db.query("UPDATE email_subscribers SET send_at = $1 WHERE email_hash = $2 AND status = 'scheduled'", [Date.now(), hash(email)]);
    console.log(result.rowCount ? `Due now: ${email}. The next scheduled run sends it.` : `No pending email for ${email}. Sign up first, or it was already sent.`);
  } else if (command) {
    throw Error('Usage: node scripts/email-status.js [send-now you@example.com]');
  } else {
    const counts = Object.fromEntries((await db.query('SELECT status, COUNT(*) AS n FROM email_subscribers GROUP BY status')).rows.map(r => [r.status, r.n]));
    const next = (await db.query("SELECT MIN(send_at) AS at, COUNT(*) FILTER (WHERE send_at <= $1) AS due FROM email_subscribers WHERE status = 'scheduled'", [Date.now()])).rows[0];
    console.log('Signups:', ['scheduled', 'sending', 'sent', 'failed', 'unsubscribed'].map(s => `${s} ${counts[s] || 0}`).join(' · '));
    console.log('Next send:', next.at ? `${new Date(next.at).toISOString()} (${next.due || 0} due now)` : 'none pending');
    const failed = (await db.query("SELECT email, last_error, updated_at FROM email_subscribers WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 5")).rows;
    if (failed.length) { console.log('\nRecent failures:'); for (const f of failed) console.log(`  ${f.updated_at}  ${f.email ?? '(deleted)'}  ${f.last_error}`); }
    const replies = (await db.query('SELECT created_at, from_address, intent, subject, text, fetch_error FROM email_inbound ORDER BY created_at DESC LIMIT 10')).rows;
    console.log(`\nReplies (latest ${replies.length}):`);
    for (const r of replies) {
      const preview = (r.text || '').split('\n').find(line => line.trim() && !line.startsWith('>'))?.trim().slice(0, 70) || r.fetch_error || r.subject || '';
      console.log(`  ${r.created_at}  ${r.from_address}  [${r.intent || '?'}]  ${preview}`);
    }
  }
} finally {
  await db.close();
}
