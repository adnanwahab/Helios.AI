// The blogroll: blogs people add, the posts that carry Helios lines, and each
// blog's current position on Free Weed for Everyone and the 100 laws.
// One blog is one voice per law, and its newest post wins.
import {createHash, randomUUID} from 'node:crypto';
import {foldVotes, parseHeliosLines} from '../../public/blogroll-line.js';
import {BlogError, checkUrl} from './fetch.js';
import {toOpml} from './feed.js';
import {createBlogReader} from './reader.js';

export const BLOGROLL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS blogroll_blogs(
    id TEXT PRIMARY KEY,
    input_url TEXT NOT NULL UNIQUE,
    feed_url TEXT UNIQUE,
    site_url TEXT,
    title TEXT,
    status TEXT NOT NULL CHECK(status IN ('queued','ok','failing','duplicate','hidden')),
    duplicate_of TEXT,
    added_by TEXT,
    added_at BIGINT NOT NULL,
    next_read_at BIGINT NOT NULL,
    last_read_at BIGINT,
    last_ok_at BIGINT,
    failures INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    etag TEXT,
    last_modified TEXT,
    read_every BIGINT,
    posts_seen INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS blogroll_blogs_due ON blogroll_blogs(next_read_at)',
  'CREATE INDEX IF NOT EXISTS blogroll_blogs_added_by ON blogroll_blogs(added_by, added_at)',
  // Only posts that contain a Helios line are kept: link, title and the line itself.
  `CREATE TABLE IF NOT EXISTS blogroll_posts(
    blog_id TEXT NOT NULL REFERENCES blogroll_blogs(id) ON DELETE CASCADE,
    guid TEXT NOT NULL,
    url TEXT,
    title TEXT,
    published_at BIGINT,
    first_seen_at BIGINT NOT NULL,
    cast_at BIGINT NOT NULL,
    entries TEXT NOT NULL,
    lines TEXT NOT NULL,
    PRIMARY KEY(blog_id, guid))`,
  `CREATE TABLE IF NOT EXISTS blogroll_votes(
    blog_id TEXT NOT NULL REFERENCES blogroll_blogs(id) ON DELETE CASCADE,
    law_id TEXT NOT NULL,
    position TEXT NOT NULL CHECK(position IN ('support','oppose','unsure')),
    post_guid TEXT NOT NULL,
    cast_at BIGINT NOT NULL,
    PRIMARY KEY(blog_id, law_id))`,
  'CREATE INDEX IF NOT EXISTS blogroll_votes_law ON blogroll_votes(law_id, position)',
];
export const BLOGROLL_TABLES = ['blogroll_blogs', 'blogroll_posts', 'blogroll_votes'];

export const MAX_ADD = 200;
const MINUTE = 60_000, DAY = 86_400_000;
// Blogs that vote and post often are read every 15 minutes, voting blogs that
// are quiet every 3 hours, and blogs with no Helios line yet every 6 hours
// (their authors can press "Read now" after posting a first line).
const MAX_ITEMS = 50, LEASE_MS = 10 * MINUTE, ACTIVE_MS = 15 * MINUTE, QUIET_MS = 3 * 60 * MINUTE, UNVOTED_MS = 6 * 60 * MINUTE;
const RECHECK_MS = MINUTE, READ_NOW_MS = 8000, PER_BLOG_MS = 8000, VOICES_PER_LAW = 6, MAX_PUBLIC = 500;
const PERMANENT = new Set(['URL_INVALID', 'URL_SCHEME', 'URL_CREDENTIALS', 'URL_PORT', 'URL_IP', 'URL_PRIVATE']);
const HIDDEN = "b.status NOT IN ('hidden','duplicate')";

// https only, no tracking parameters, no trailing slash, so one blog has one address.
export function normalizeBlogUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) throw new BlogError('Enter a blog address.', 'URL_EMPTY');
  if (text.length > 2000) throw new BlogError('That address is too long.', 'URL_LONG');
  if (/^http:\/\//i.test(text)) text = 'https://' + text.slice(7);
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text.replace(/^\/+/, '');
  const url = checkUrl(text);
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|ref|ref_src|source)$/i.test(key)) url.searchParams.delete(key);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}

const digest = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
const iso = value => (value == null ? null : new Date(Number(value)).toISOString());
const lock = (q, key) => q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
// A feed date counts only if it is plausible; otherwise the post counts from when Helios first saw it.
const plausible = (time, now) => (Number.isFinite(time) && time > Date.UTC(2000, 0, 1) && time < now + DAY ? time : null);

function insertMany(table, columns, rows) {
  const params = [];
  const groups = rows.map(row => '(' + row.map(value => { params.push(value); return '$' + params.length; }).join(',') + ')');
  return {text: `INSERT INTO ${table}(${columns.join(',')}) VALUES ${groups.join(',')}`, params};
}

export function blogrollStore(db, Problem, {read = createBlogReader(), now = Date.now} = {}) {
  const fail = (status, message) => { throw new Problem(status, message); };
  const view = row => ({
    id: row.id, url: row.input_url, feedUrl: row.feed_url, siteUrl: row.site_url, title: row.title,
    status: row.status, duplicateOf: row.duplicate_of, lastError: row.last_error, postsSeen: Number(row.posts_seen || 0),
    lastReadAt: iso(row.last_read_at), nextReadAt: iso(row.next_read_at),
  });

  async function summary(q, id, extra = {}) {
    const row = (await q.query('SELECT * FROM blogroll_blogs WHERE id=$1', [id])).rows[0];
    if (!row) return {id, status: 'missing', votes: [], ...extra};
    const votes = (await q.query('SELECT law_id,position FROM blogroll_votes WHERE blog_id=$1 ORDER BY law_id', [id])).rows;
    return {...view(row), votes: votes.map(v => ({law: v.law_id, position: v.position})), ...extra};
  }

  // Rebuilds one blog's positions from every stored post, oldest first.
  async function recount(q, blogId) {
    const posts = (await q.query('SELECT guid,cast_at,entries FROM blogroll_posts WHERE blog_id=$1 ORDER BY cast_at,first_seen_at,guid', [blogId])).rows
      .map(row => ({guid: row.guid, castAt: Number(row.cast_at), entries: JSON.parse(row.entries)}));
    const votes = foldVotes(posts);
    await q.query('DELETE FROM blogroll_votes WHERE blog_id=$1', [blogId]);
    if (votes.size) {
      const insert = insertMany('blogroll_votes', ['blog_id', 'law_id', 'position', 'post_guid', 'cast_at'],
        [...votes].map(([law, vote]) => [blogId, law, vote.position, vote.post.guid, vote.post.castAt]));
      await q.query(insert.text, insert.params);
    }
  }

  async function recordSuccess(blog, outcome, started) {
    return db.transaction(async q => {
      await lock(q, 'blogroll:' + blog.id);
      const current = (await q.query('SELECT * FROM blogroll_blogs WHERE id=$1 FOR UPDATE', [blog.id])).rows[0];
      if (!current || ['hidden', 'duplicate'].includes(current.status)) return summary(q, blog.id);
      if (outcome.notModified) {
        // Nothing new since the last full read, so keep the pace it set.
        await q.query("UPDATE blogroll_blogs SET status='ok',last_read_at=$2,last_ok_at=$2,failures=0,last_error=NULL,next_read_at=$3 WHERE id=$1",
          [blog.id, started, started + (Number(current.read_every) || ACTIVE_MS)]);
        return summary(q, blog.id, {notModified: true});
      }
      await lock(q, 'blogroll-feed:' + outcome.feedUrl);
      const owner = (await q.query('SELECT id FROM blogroll_blogs WHERE feed_url=$1 AND id<>$2', [outcome.feedUrl, blog.id])).rows[0];
      if (owner) {
        // Another address for a blog that is already on the list.
        await q.query('DELETE FROM blogroll_posts WHERE blog_id=$1', [blog.id]);
        await q.query('DELETE FROM blogroll_votes WHERE blog_id=$1', [blog.id]);
        await q.query("UPDATE blogroll_blogs SET status='duplicate',duplicate_of=$2,last_read_at=$3,next_read_at=$4 WHERE id=$1", [blog.id, owner.id, started, started + 365 * DAY]);
        return summary(q, blog.id, {duplicateOf: owner.id});
      }
      const items = outcome.feed.items.slice(0, MAX_ITEMS);
      const quiet = [];
      let withLines = 0;
      for (const item of items) {
        const guid = digest(item.id || item.url || item.title || JSON.stringify(item).slice(0, 500));
        const parsed = parseHeliosLines(item.text);
        if (!parsed.entries.length) { quiet.push(guid); continue; }
        withLines++;
        const published = plausible(item.published, started);
        await q.query(`INSERT INTO blogroll_posts(blog_id,guid,url,title,published_at,first_seen_at,cast_at,entries,lines) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT(blog_id,guid) DO UPDATE SET url=EXCLUDED.url,title=EXCLUDED.title,published_at=EXCLUDED.published_at,
          cast_at=COALESCE(EXCLUDED.published_at,blogroll_posts.cast_at),entries=EXCLUDED.entries,lines=EXCLUDED.lines`,
        [blog.id, guid, item.url, item.title || null, published, started, published ?? started, JSON.stringify(parsed.entries), JSON.stringify(parsed.lines)]);
      }
      // A post whose author removed its Helios line no longer votes.
      if (quiet.length) await q.query('DELETE FROM blogroll_posts WHERE blog_id=$1 AND guid = ANY($2::text[])', [blog.id, quiet]);
      await recount(q, blog.id);
      const voting = Number((await q.query('SELECT COUNT(*) AS n FROM blogroll_posts WHERE blog_id=$1', [blog.id])).rows[0].n) > 0;
      const active = items.some(item => plausible(item.published, started) && started - item.published < 14 * DAY);
      let host = null;
      try { host = new URL(outcome.feedUrl).hostname; } catch {}
      const pace = !voting ? UNVOTED_MS : active ? ACTIVE_MS : QUIET_MS;
      await q.query(`UPDATE blogroll_blogs SET status='ok',feed_url=$2,site_url=$3,title=$4,etag=$5,last_modified=$6,last_read_at=$7,last_ok_at=$7,
        failures=0,last_error=NULL,posts_seen=$8,read_every=$9,next_read_at=$10 WHERE id=$1`,
      [blog.id, outcome.feedUrl, outcome.feed.siteUrl || current.site_url || null, outcome.feed.title || current.title || host,
        outcome.etag, outcome.lastModified, started, items.length, pace, started + pace]);
      return summary(q, blog.id, {postsRead: items.length, postsWithLines: withLines});
    });
  }

  async function recordFailure(blog, error, started) {
    if (!(error instanceof BlogError)) console.error('Blogroll read failed:', error?.name || 'Error');
    const message = error instanceof BlogError ? error.message : 'Helios could not read this blog.';
    const failures = Number(blog.failures || 0) + 1, permanent = PERMANENT.has(error?.code);
    const retry = permanent ? 30 * DAY : Math.min(DAY, ACTIVE_MS * 2 ** Math.min(failures, 7));
    await db.query(`UPDATE blogroll_blogs SET status=CASE WHEN status IN ('hidden','duplicate') THEN status WHEN $3::int >= 3 OR $6::boolean THEN 'failing' ELSE status END,
      failures=$3::int,last_error=$2,last_read_at=$4,next_read_at=$5 WHERE id=$1`, [blog.id, message, failures, started, started + retry, permanent]);
    return summary(db, blog.id, {error: message, code: error?.code || 'ERROR'});
  }

  async function readBlog(blog, deadline) {
    const started = now();
    let outcome;
    try {
      outcome = await read({inputUrl: blog.input_url, feedUrl: blog.feed_url, etag: blog.etag, lastModified: blog.last_modified}, {deadline});
    } catch (error) {
      return recordFailure(blog, error, started);
    }
    return recordSuccess(blog, outcome, started);
  }

  return {
    // input: {urls: [string]}. Adds new blogs to the reading queue.
    async addIn(q, input, actor) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'urls')
        || !Array.isArray(input.urls) || !input.urls.length || input.urls.length > MAX_ADD || input.urls.some(url => typeof url !== 'string')) {
        fail(400, `Send between 1 and ${MAX_ADD} blog addresses.`);
      }
      const wanted = [], invalid = [];
      for (const raw of input.urls) {
        try { const url = normalizeBlogUrl(raw); if (!wanted.includes(url)) wanted.push(url); }
        catch (error) { invalid.push({url: raw.trim().slice(0, 200), reason: error instanceof BlogError ? error.message : 'That address is not valid.'}); }
      }
      const known = new Map();
      if (wanted.length) {
        const rows = (await q.query('SELECT id,input_url,feed_url,duplicate_of FROM blogroll_blogs WHERE input_url = ANY($1::text[]) OR feed_url = ANY($1::text[])', [wanted])).rows;
        for (const row of rows) { known.set(row.input_url, row); if (row.feed_url) known.set(row.feed_url, row); }
      }
      const added = [], existing = [], at = now();
      for (const url of wanted) {
        const row = known.get(url);
        if (row) { existing.push({id: row.duplicate_of || row.id, url}); continue; }
        const id = randomUUID();
        const inserted = await q.query("INSERT INTO blogroll_blogs(id,input_url,status,added_by,added_at,next_read_at) VALUES($1,$2,'queued',$3,$4,$4) ON CONFLICT DO NOTHING RETURNING id", [id, url, actor, at]);
        if (inserted.rows.length) added.push({id, url});
        else existing.push({id: null, url});
      }
      const only = wanted.length === 1 && !invalid.length ? (added[0] || existing[0]) : null;
      return {added, existing, invalid, readNow: only?.id || null};
    },

    // Reads one blog right away (after it is added, or when its author asks).
    async readNow(id) {
      const at = now();
      const blog = (await db.query(`UPDATE blogroll_blogs SET next_read_at=$2 WHERE id=$1 AND status NOT IN ('hidden','duplicate')
        AND (last_read_at IS NULL OR last_read_at < $3) RETURNING *`, [id, at + LEASE_MS, at - RECHECK_MS])).rows[0];
      if (!blog) return summary(db, id, {recentlyRead: true});
      return readBlog(blog, at + READ_NOW_MS);
    },

    // Reads the blogs that are due, within a time budget (scheduled every 15 minutes).
    async poll({max = 25, budgetMs = 20000, concurrency = 4} = {}) {
      const started = now(), deadline = started + budgetMs;
      const claimed = (await db.query(`UPDATE blogroll_blogs SET next_read_at=$2 WHERE id IN (
        SELECT id FROM blogroll_blogs WHERE status NOT IN ('hidden','duplicate') AND next_read_at <= $1
        ORDER BY next_read_at, id LIMIT $3 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [started, started + LEASE_MS, Math.max(1, Math.min(200, Math.floor(max)))])).rows;
      const results = [];
      let next = 0;
      async function worker() {
        while (next < claimed.length) {
          const blog = claimed[next++];
          if (now() > deadline - 1000) {
            await db.query('UPDATE blogroll_blogs SET next_read_at=$2 WHERE id=$1', [blog.id, now()]);
            results.push({skipped: true});
            continue;
          }
          try { results.push(await readBlog(blog, Math.min(deadline, now() + PER_BLOG_MS))); }
          catch (error) { console.error('Blogroll record failed:', error?.name || 'Error'); results.push({error: 'internal'}); }
        }
      }
      await Promise.all(Array.from({length: Math.min(Math.max(1, concurrency), claimed.length)}, worker));
      const due = (await db.query("SELECT COUNT(*) AS n FROM blogroll_blogs WHERE status NOT IN ('hidden','duplicate') AND next_read_at <= $1", [now()])).rows[0];
      return {
        claimed: claimed.length,
        ok: results.filter(r => !r.skipped && !r.error && !r.code).length,
        failed: results.filter(r => r.code || r.error).length,
        skipped: results.filter(r => r.skipped).length,
        stillDue: Number(due.n),
        ms: now() - started,
      };
    },

    // Public tally, the public list (blogs that have voted), and the caller's own additions.
    async overview(actor = null) {
      const [tally, voices, blogs, totals, mine] = await Promise.all([
        db.query(`SELECT v.law_id,v.position,COUNT(*) AS n FROM blogroll_votes v JOIN blogroll_blogs b ON b.id=v.blog_id WHERE ${HIDDEN} GROUP BY v.law_id,v.position`),
        db.query(`SELECT * FROM (SELECT v.law_id,v.position,v.cast_at,b.id AS blog_id,b.title,b.site_url,b.feed_url,p.url AS post_url,p.title AS post_title,
          ROW_NUMBER() OVER (PARTITION BY v.law_id ORDER BY v.cast_at DESC, b.id) AS voice_rank
          FROM blogroll_votes v JOIN blogroll_blogs b ON b.id=v.blog_id LEFT JOIN blogroll_posts p ON p.blog_id=v.blog_id AND p.guid=v.post_guid WHERE ${HIDDEN}) ranked
          WHERE voice_rank <= $1 ORDER BY law_id, voice_rank`, [VOICES_PER_LAW]),
        db.query(`SELECT b.id,b.title,b.site_url,b.feed_url,COUNT(*) AS votes,
          SUM(CASE WHEN v.position='support' THEN 1 ELSE 0 END) AS support,SUM(CASE WHEN v.position='oppose' THEN 1 ELSE 0 END) AS oppose,
          SUM(CASE WHEN v.position='unsure' THEN 1 ELSE 0 END) AS unsure,MAX(v.cast_at) AS last_vote_at
          FROM blogroll_blogs b JOIN blogroll_votes v ON v.blog_id=b.id WHERE ${HIDDEN} GROUP BY b.id ORDER BY last_vote_at DESC, b.id LIMIT $1`, [MAX_PUBLIC]),
        db.query(`SELECT (SELECT COUNT(*) FROM blogroll_blogs b WHERE ${HIDDEN}) AS watching,
          (SELECT COUNT(DISTINCT v.blog_id) FROM blogroll_votes v JOIN blogroll_blogs b ON b.id=v.blog_id WHERE ${HIDDEN}) AS voting,
          (SELECT COUNT(*) FROM blogroll_votes v JOIN blogroll_blogs b ON b.id=v.blog_id WHERE ${HIDDEN}) AS votes,
          (SELECT MAX(last_ok_at) FROM blogroll_blogs) AS last_read`),
        actor ? db.query('SELECT b.*,(SELECT COUNT(*) FROM blogroll_votes v WHERE v.blog_id=b.id) AS votes FROM blogroll_blogs b WHERE b.added_by=$1 ORDER BY b.added_at DESC,b.id LIMIT 50', [actor]) : {rows: []},
      ]);
      const laws = {};
      const law = id => (laws[id] ??= {support: 0, oppose: 0, unsure: 0, voices: []});
      for (const row of tally.rows) law(row.law_id)[row.position] = Number(row.n);
      for (const row of voices.rows) {
        law(row.law_id).voices.push({
          position: row.position, castAt: iso(row.cast_at),
          blog: {id: row.blog_id, title: row.title, siteUrl: row.site_url || row.feed_url},
          post: {url: row.post_url, title: row.post_title},
        });
      }
      const total = totals.rows[0];
      return {
        laws,
        blogs: blogs.rows.map(row => ({
          id: row.id, title: row.title, siteUrl: row.site_url || row.feed_url, feedUrl: row.feed_url,
          votes: Number(row.votes), support: Number(row.support), oppose: Number(row.oppose), unsure: Number(row.unsure), lastVoteAt: iso(row.last_vote_at),
        })),
        stats: {watching: Number(total.watching), voting: Number(total.voting), votes: Number(total.votes), lastReadAt: iso(total.last_read)},
        mine: mine.rows.map(row => ({...view(row), votes: Number(row.votes)})),
      };
    },

    async opml() {
      const rows = (await db.query(`SELECT DISTINCT b.id,b.title,b.site_url,b.feed_url FROM blogroll_blogs b JOIN blogroll_votes v ON v.blog_id=b.id WHERE ${HIDDEN} ORDER BY b.title,b.id LIMIT $1`, [MAX_PUBLIC * 10])).rows;
      return toOpml(rows.map(row => ({title: row.title, siteUrl: row.site_url, feedUrl: row.feed_url})), {title: 'Helios blogroll: blogs voting on Free Weed for Everyone and the 100 laws', created: new Date(now())});
    },

    // Maintainers can take a blog off the public list (spam, impersonation) or restore it.
    async hide(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['id', 'hidden'].includes(key))
        || typeof input.id !== 'string' || typeof input.hidden !== 'boolean') fail(400, 'Send {id, hidden}.');
      const row = (await db.query("UPDATE blogroll_blogs SET status=CASE WHEN $2::boolean THEN 'hidden' ELSE 'queued' END,next_read_at=$3 WHERE id=$1 AND status<>'duplicate' RETURNING id", [input.id, input.hidden, now()])).rows[0];
      if (!row) fail(404, 'Blog not found.');
      return summary(db, input.id);
    },
  };
}
