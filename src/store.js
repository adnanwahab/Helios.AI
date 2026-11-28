import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {CONSTITUTION_SCHEMA,constitutionStore} from './constitution.js';
import {RESEARCH_SCHEMA, RESEARCH_TABLES, researchStore} from './research.js';
import {CONTRIBUTION_SCHEMA,contributionStore} from './contributions.js';
import {BLOGROLL_SCHEMA,BLOGROLL_TABLES,blogrollStore} from './blogroll/store.js';
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
  ...CONSTITUTION_SCHEMA,
  ...RESEARCH_SCHEMA,
  ...CONTRIBUTION_SCHEMA,
  'CREATE TABLE IF NOT EXISTS account_preferences(actor TEXT PRIMARY KEY, settings TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS laws(id TEXT PRIMARY KEY, current_version TEXT NOT NULL, author TEXT, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, law_id TEXT NOT NULL REFERENCES laws(id), number INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, amendment_id TEXT, UNIQUE(law_id, number))',
  "CREATE TABLE IF NOT EXISTS amendments(id TEXT PRIMARY KEY, law_id TEXT NOT NULL REFERENCES laws(id), base_version TEXT NOT NULL REFERENCES versions(id), proposed TEXT NOT NULL, reason TEXT NOT NULL, author TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL, accepted_version TEXT REFERENCES versions(id))",
  'CREATE INDEX IF NOT EXISTS amendment_law ON amendments(law_id, created_at)',
  "CREATE TABLE IF NOT EXISTS law_votes(law_id TEXT NOT NULL REFERENCES laws(id), version_id TEXT NOT NULL REFERENCES versions(id), actor TEXT NOT NULL, position TEXT NOT NULL CHECK(position IN ('support','oppose','unsure')), updated_at TEXT NOT NULL, PRIMARY KEY(law_id,version_id,actor))",
  'CREATE INDEX IF NOT EXISTS law_vote_version ON law_votes(law_id,version_id,position)',
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
  // Blogs that vote with a Helios line in their posts (see docs/blogroll.md).
  ...BLOGROLL_SCHEMA,
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

// options.blogroll lets tests replace the network reader and clock.
export async function openStore(db, options = {}) {
  const seedHash = hash(JSON.stringify(seedCatalog));
  await db.transaction(async tx => {
    await lock(tx, 'helios-schema');
    for (const sql of SCHEMA) await tx.query(sql);
    // The Supabase adapter owns a private schema; enable RLS as defense in
    // depth. The database owner used by the server retains normal access.
    if(db.kind==='supabase-postgres')for(const table of ['metadata','sessions','laws','versions','amendments','receipts','limits','email_subscribers','email_inbound','constitution_clauses','constitution_contributions','constitution_votes','constitution_comments','law_votes','contribution_inbox','account_preferences',...RESEARCH_TABLES,...BLOGROLL_TABLES])await tx.query('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY');
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
  return createStore(db, seedHash, options);
}

function createStore(db, catalogHash, options = {}) {
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

  // Original editorial IDs only. A revision invalidates its predecessor's
  // current tally, but never deletes the historical advisory positions.
  const originalIds=new Set(seedCatalog.goals.map(g=>g.id));
  async function lawBoard(actor=null) {
    const [laws,votes,updates,own]=await Promise.all([
      db.query('SELECT l.*, v.content, v.number FROM laws l JOIN versions v ON v.id=l.current_version ORDER BY l.id'),
      db.query('SELECT lv.law_id,lv.position,COUNT(*) AS n FROM law_votes lv JOIN laws l ON l.id=lv.law_id AND l.current_version=lv.version_id GROUP BY lv.law_id,lv.position'),
      db.query("SELECT law_id,COUNT(*) AS n FROM amendments GROUP BY law_id"),
      db.query('SELECT lv.law_id,lv.position FROM law_votes lv JOIN laws l ON l.id=lv.law_id AND l.current_version=lv.version_id WHERE lv.actor=$1',[actor||''])
    ]);
    const result=laws.rows.filter(row=>originalIds.has(row.id)).map(row=>({law:publicLaw(row),votes:{support:0,oppose:0,unsure:0},updates:0,myVote:null}));
    const map=new Map(result.map(row=>[row.law.id,row]));
    for(const v of votes.rows)if(map.has(v.law_id))map.get(v.law_id).votes[v.position]=Number(v.n);
    for(const v of updates.rows)if(map.has(v.law_id))map.get(v.law_id).updates=Number(v.n);
    for(const v of own.rows)if(map.has(v.law_id))map.get(v.law_id).myVote=v.position;
    return result;
  }
  async function lawVoteIn(q,id,input,actor){
    if(!originalIds.has(id))fail(404,'Original proposal not found.');
    if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['versionId','position'].includes(k))||!['support','oppose','unsure',null].includes(input.position)||typeof input.versionId!=='string')fail(400,'Choose a position and current version.');
    const row=await currentRow(q,id,{forUpdate:true});
    if(!row||row.current_version!==input.versionId)fail(409,'The proposal was revised. Reload and review the new wording before voting.');
    if(input.position===null)await q.query('DELETE FROM law_votes WHERE law_id=$1 AND version_id=$2 AND actor=$3',[id,input.versionId,actor]);
    else await q.query('INSERT INTO law_votes(law_id,version_id,actor,position,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(law_id,version_id,actor) DO UPDATE SET position=EXCLUDED.position,updated_at=EXCLUDED.updated_at',[id,input.versionId,actor,input.position,new Date().toISOString()]);
    return {id,versionId:input.versionId,position:input.position};
  }
  async function lawUpdateIn(q,id,input,actor){
    if(!originalIds.has(id))fail(404,'Original proposal not found.');
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['versionId','goal','implementation','safeguards','reason','consent'].includes(k))||input.consent!==true)fail(400,'Explicit consent to publish the proposed update is required.');
    for(const [key,max] of [['goal',4000],['implementation',6000],['safeguards',4000],['reason',3000]])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max)fail(400,'Complete '+key+' (maximum '+max+' characters).');
    const row=await currentRow(q,id,{forUpdate:true});
    if(!row||row.current_version!==input.versionId)fail(409,'This proposal was revised. Reload before suggesting an update.');
    const prior=JSON.parse(row.content);
    const proposal={title:prior.title,category:prior.category,sharedGoal:input.goal.trim(),illustrativeLocalOption:input.implementation.trim(),risksAndSafeguards:input.safeguards.trim(),suggestedMeasures:prior.suggestedMeasures};
    return amendIn(q,id,{baseVersionId:input.versionId,reason:input.reason,proposal},actor);
  }
  async function lawHistory(id){
    if(!originalIds.has(id))fail(404,'Original proposal not found.');
    const detail=await detailIn(db,id);
    const votes=(await db.query('SELECT version_id,position,COUNT(*) AS n FROM law_votes WHERE law_id=$1 GROUP BY version_id,position',[id])).rows;
    const map=new Map(detail.versions.map(v=>[v.id,{support:0,oppose:0,unsure:0}]));
    for(const row of votes)if(map.has(row.version_id))map.get(row.version_id)[row.position]=Number(row.n);
    return {...detail,versions:detail.versions.map(v=>({...v,votes:map.get(v.id)}))};
  }
  return {
    db,
    catalogHash,
    lawBoard, lawVoteIn, lawUpdateIn, lawHistory,
    constitution: constitutionStore(db, Problem),
    research: researchStore(db, Problem),
    contributions: contributionStore(db, Problem),
    blogroll: blogrollStore(db, Problem, options.blogroll),
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
