import {createHash, randomBytes, randomUUID} from 'node:crypto';
import seedCatalog from '../data/catalog.json' with {type: 'json'};

export const hash = value => createHash('sha256').update(value).digest('hex');
export class Problem extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new Problem(status, message); };
const fields = {title: 160, sharedGoal: 4000, illustrativeLocalOption: 6000, risksAndSafeguards: 4000};

export function proposalContent(input, base = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object') fail(400, 'A proposal object is required.');
  const allowed = new Set([...Object.keys(fields), 'suggestedMeasures', 'category']);
  if (Object.keys(input).some(k => !allowed.has(k))) fail(400, 'Unknown proposal field. Source identities and status cannot be edited.');
  const result = {...base};
  for (const [field, max] of Object.entries(fields)) {
    const value = input[field];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${field} is required (maximum ${max} characters).`);
    result[field] = value.trim();
  }
  if (!seedCatalog.categories.includes(input.category)) fail(400, 'Choose an existing category.');
  result.category = input.category;
  if (!Array.isArray(input.suggestedMeasures) || input.suggestedMeasures.length < 1 || input.suggestedMeasures.length > 8 || input.suggestedMeasures.some(x => typeof x !== 'string' || !x.trim() || x.length > 240)) fail(400, 'Provide 1–8 measures, each at most 240 characters.');
  result.suggestedMeasures = input.suggestedMeasures.map(x => x.trim());
  return result;
}

// Timestamps are epoch milliseconds in BIGINT columns. Statements run one at a time on Postgres.
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS laws(id TEXT PRIMARY KEY, current_version TEXT NOT NULL, author TEXT, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, law_id TEXT NOT NULL REFERENCES laws(id), number INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, amendment_id TEXT, UNIQUE(law_id, number))',
  "CREATE TABLE IF NOT EXISTS amendments(id TEXT PRIMARY KEY, law_id TEXT NOT NULL REFERENCES laws(id), base_version TEXT NOT NULL REFERENCES versions(id), proposed TEXT NOT NULL, reason TEXT NOT NULL, author TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL, accepted_version TEXT REFERENCES versions(id))",
  'CREATE INDEX IF NOT EXISTS amendment_law ON amendments(law_id, created_at)',
  'CREATE TABLE IF NOT EXISTS receipts(actor TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(actor, key))',
  'CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at BIGINT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS email_subscribers(
    id TEXT PRIMARY KEY,
    email TEXT,
    email_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('scheduled','sending','sent','failed','unsubscribed')),
    send_at BIGINT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 1,
    attempts INTEGER NOT NULL DEFAULT 0,
    claimed_at BIGINT,
    sent_at BIGINT,
    resend_id TEXT,
    goal_id TEXT,
    last_error TEXT,
    source TEXT,
    token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS email_subscribers_due ON email_subscribers(status, send_at)',
  `CREATE TABLE IF NOT EXISTS email_inbound(
    id TEXT PRIMARY KEY,
    webhook_id TEXT,
    from_address TEXT NOT NULL,
    to_addresses TEXT NOT NULL,
    subject TEXT,
    message_id TEXT,
    received_at TEXT,
    subscriber_id TEXT,
    intent TEXT,
    text TEXT,
    html TEXT,
    authentication TEXT,
    fetch_error TEXT,
    created_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS email_inbound_created ON email_inbound(created_at)',
  // Immediate auto-reply to inbound mail (see src/email.js autoReply).
  'ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS auto_reply_status TEXT',
  'ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS auto_reply_id TEXT',
  'ALTER TABLE email_inbound ADD COLUMN IF NOT EXISTS auto_reply_at BIGINT',
];

// Transaction-scoped advisory lock: serializes writers that must not race
// (first-time seeding, counters, idempotency keys, one law's amendments).
const lock = (q, key) => q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

// One multi-row INSERT keeps cold-start seeding to a couple of round trips.
export function multiInsert(table, columns, rows) {
  const params = [];
  const groups = rows.map(row => '(' + row.map(value => { params.push(value); return '$' + params.length; }).join(',') + ')');
  return {text: `INSERT INTO ${table}(${columns.join(',')}) VALUES ${groups.join(',')}`, params};
}

export async function openStore(db) {
  const seedHash = hash(JSON.stringify(seedCatalog));
  await db.transaction(async tx => {
    await lock(tx, 'helios-schema');
    for (const sql of SCHEMA) await tx.query(sql);
    const prior = (await tx.query('SELECT value FROM metadata WHERE key=$1', ['catalog_hash'])).rows[0];
    if (prior && prior.value !== seedHash) fail(500, 'Catalog seed changed. A reviewed migration is required; stored records were not overwritten.');
    if (!prior) {
      const now = new Date().toISOString();
      const versions = seedCatalog.goals.map(item => [randomUUID(), item]);
      const laws = multiInsert('laws', ['id', 'current_version', 'author', 'created_at'], versions.map(([version, item]) => [item.id, version, null, now]));
      const contents = multiInsert('versions', ['id', 'law_id', 'number', 'content', 'created_at', 'amendment_id'], versions.map(([version, item]) => [version, item.id, 1, JSON.stringify(item), now, null]));
      if (versions.length) { await tx.query(laws.text, laws.params); await tx.query(contents.text, contents.params); }
      await tx.query('INSERT INTO metadata(key, value) VALUES($1, $2)', ['catalog_hash', seedHash]);
      await tx.query('INSERT INTO metadata(key, value) VALUES($1, $2)', ['schema_version', '1']);
    }
  });
  return createStore(db, seedHash);
}

function createStore(db, catalogHash) {
  const publicLaw = row => ({...JSON.parse(row.content), id: row.id, version: row.number, versionId: row.current_version, createdAt: row.created_at});
  const currentRow = async (q, id, {forUpdate = false} = {}) => (await q.query(
    `SELECT l.*, v.content, v.number FROM laws l JOIN versions v ON v.id = l.current_version WHERE l.id = $1${forUpdate ? ' FOR UPDATE OF l' : ''}`, [id])).rows[0];

  async function detailIn(q, id) {
    const row = await currentRow(q, id);
    if (!row) fail(404, 'Proposal not found.');
    const versions = (await q.query('SELECT * FROM versions WHERE law_id = $1 ORDER BY number', [id])).rows;
    const amendments = (await q.query('SELECT * FROM amendments WHERE law_id = $1 ORDER BY created_at, id', [id])).rows;
    return {
      law: publicLaw(row),
      versions: versions.map(v => ({id: v.id, number: v.number, content: JSON.parse(v.content), createdAt: v.created_at, amendmentId: v.amendment_id})),
      amendments: amendments.map(a => ({id: a.id, baseVersionId: a.base_version, proposed: JSON.parse(a.proposed), reason: a.reason, status: a.status, createdAt: a.created_at, acceptedVersionId: a.accepted_version})),
    };
  }

  // Write operations run inside a transaction supplied by the caller (q),
  // so an idempotent write and its receipt commit together.
  async function createIn(q, input, author) {
    const content = proposalContent(input, {legalStatus: 'editorial_draft_not_law', reviewStatus: 'unreviewed', publicVoteStatus: 'not_open', sourceRepository: 'adnanwahab/Helios.AI', collectionId: seedCatalog.metadata.collectionId, costEstimate: null, impactEvidence: 'not_evaluated', consensusSupport: null});
    const id = 'HGP-' + randomUUID(), version = randomUUID(), now = new Date().toISOString();
    content.id = id;
    await q.query('INSERT INTO laws(id, current_version, author, created_at) VALUES($1, $2, $3, $4)', [id, version, author, now]);
    await q.query('INSERT INTO versions(id, law_id, number, content, created_at, amendment_id) VALUES($1, $2, 1, $3, $4, NULL)', [version, id, JSON.stringify(content), now]);
    return detailIn(q, id);
  }

  async function amendIn(q, id, input, author) {
    if (!input || Object.keys(input).some(k => !['baseVersionId', 'reason', 'proposal'].includes(k))) fail(400, 'Invalid amendment fields.');
    const row = await currentRow(q, id, {forUpdate: true});
    if (!row) fail(404, 'Proposal not found.');
    if (input.baseVersionId !== row.current_version) fail(409, 'This proposal changed. Reload and review the current version before proposing an amendment.');
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 3000) fail(400, 'Explain the amendment (maximum 3000 characters).');
    const proposed = proposalContent(input.proposal, JSON.parse(row.content)), aid = 'AMD-' + randomUUID();
    await q.query('INSERT INTO amendments(id, law_id, base_version, proposed, reason, author, created_at) VALUES($1, $2, $3, $4, $5, $6, $7)',
      [aid, id, row.current_version, JSON.stringify(proposed), input.reason.trim(), author, new Date().toISOString()]);
    return detailIn(q, id);
  }

  async function acceptIn(q, id, aid) {
    const a = (await q.query('SELECT * FROM amendments WHERE id = $1 AND law_id = $2 FOR UPDATE', [aid, id])).rows[0];
    if (!a) fail(404, 'Amendment not found.');
    if (a.status !== 'accepted') {
      const row = await currentRow(q, id, {forUpdate: true});
      if (!row) fail(404, 'Proposal not found.');
      if (a.base_version !== row.current_version) fail(409, 'Amendment targets an older version; a new amendment is required.');
      const version = randomUUID(), now = new Date().toISOString();
      await q.query('INSERT INTO versions(id, law_id, number, content, created_at, amendment_id) VALUES($1, $2, $3, $4, $5, $6)', [version, id, row.number + 1, a.proposed, now, aid]);
      await q.query('UPDATE laws SET current_version = $1 WHERE id = $2 AND current_version = $3', [version, id, a.base_version]);
      await q.query("UPDATE amendments SET status = 'accepted', accepted_version = $1 WHERE id = $2", [version, aid]);
    }
    return detailIn(q, id);
  }

  return {
    db,
    catalogHash,
    async catalog() {
      const rows = (await db.query('SELECT l.*, v.content, v.number FROM laws l JOIN versions v ON v.id = l.current_version ORDER BY l.id')).rows;
      return {...seedCatalog, goals: rows.map(publicLaw)};
    },
    detail: id => detailIn(db, id),
    createIn, amendIn, acceptIn,
    accept: (id, aid) => db.transaction(q => acceptIn(q, id, aid)),

    async idempotent(actor, key, requestHash, write) {
      return db.transaction(async q => {
        await lock(q, 'idem:' + actor + ':' + key);
        const prior = (await q.query('SELECT * FROM receipts WHERE actor = $1 AND key = $2', [actor, key])).rows[0];
        if (prior) {
          if (prior.request_hash !== requestHash) fail(409, 'This submission key was already used for different content. Reopen the editor for a new submission.');
          return JSON.parse(prior.response);
        }
        const result = await write(q);
        await q.query('INSERT INTO receipts(actor, key, request_hash, response) VALUES($1, $2, $3, $4)', [actor, key, requestHash, JSON.stringify(result)]);
        return result;
      });
    },

    async session(raw) {
      const id = raw ? hash(raw) : '';
      const row = (await db.query('SELECT * FROM sessions WHERE id = $1 AND expires > $2', [id, Date.now()])).rows[0];
      if (row) return {...row, raw: null};
      const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex'), expires = Date.now() + 90 * 86400000;
      await db.query('INSERT INTO sessions(id, csrf, expires) VALUES($1, $2, $3)', [hash(token), csrf, expires]);
      return {id: hash(token), csrf, expires, raw: token};
    },

    async authenticate(raw) {
      if (!raw) return null;
      return (await db.query('SELECT * FROM sessions WHERE id = $1 AND expires > $2', [hash(raw), Date.now()])).rows[0] ?? null;
    },

    async limit(key, max, windowMs) {
      await db.transaction(async q => {
        await lock(q, 'limit:' + key);
        const now = Date.now();
        const row = (await q.query('SELECT * FROM limits WHERE key = $1', [key])).rows[0];
        if (row && row.reset_at > now) {
          if (row.count >= max) fail(429, 'Too many submissions. Please try again later.');
          await q.query('UPDATE limits SET count = count + 1 WHERE key = $1', [key]);
        } else {
          await q.query('INSERT INTO limits(key, count, reset_at) VALUES($1, 1, $2) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at', [key, now + windowMs]);
        }
        await q.query('DELETE FROM limits WHERE reset_at < $1', [now - 86400000]);
      });
    },

    close: () => db.close(),
  };
}
