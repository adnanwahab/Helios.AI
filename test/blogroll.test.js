import {test, expect} from 'bun:test';
import {createPGliteDatabase} from '../src/db-pglite.js';
import {openStore} from '../src/store.js';
import {createApp} from '../src/app.js';
import {FREE_WEED} from '../public/blogroll-line.js';
import {BlogError} from '../src/blogroll/fetch.js';
import {createBlogReader} from '../src/blogroll/reader.js';
import {client} from './helpers.js';

const MINUTE = 60_000;
const day = d => Date.UTC(2026, 10, d, 12);

// A tiny web: address -> page text, or a function for conditional answers.
function web(pages) {
  const calls = [];
  const get = async (url, options = {}) => {
    calls.push(url);
    const page = pages[url];
    if (page === undefined) throw new BlogError('That site could not be found.', 'DNS');
    if (typeof page === 'function') return {url, ...page(options)};
    return {status: 200, url, body: page, etag: null, lastModified: null};
  };
  return {pages, calls, read: createBlogReader({get})};
}

const post = ({id, title = 'Post ' + id, date, html}) => `<item><title>${title}</title><link>https://alice.blog/p/${id}</link><guid>${id}</guid>${date ? `<pubDate>${new Date(date).toUTCString()}</pubDate>` : ''}<content:encoded><![CDATA[${html}]]></content:encoded></item>`;
const feed = (posts, title = 'Alice writes') => `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${title}</title><link>https://alice.blog/</link>${posts.map(post).join('')}</channel></rss>`;
const page = href => `<!doctype html><html><head><link rel="alternate" type="application/rss+xml" href="${href}"></head><body>Alice</body></html>`;

async function open(pages, {health = {storage: 'pglite', runtime: 'node-server'}} = {}) {
  const site = web(pages);
  let clock = day(26);
  const db = await createPGliteDatabase();
  const store = await openStore(db, {blogroll: {read: site.read, now: () => clock}});
  const app = createApp({store, email: null, health, adminToken: 'test-admin', secure: false});
  const add = (urls, actor = 'actor-1') => db.transaction(q => store.blogroll.addIn(q, {urls}, actor));
  return {db, store, app, site, blogroll: store.blogroll, add, tick: ms => { clock += ms; }, now: () => clock};
}

const votesOf = summary => summary.votes.map(v => `${v.law}:${v.position}`);

test('adding a list normalizes addresses, skips duplicates and refuses private ones', async () => {
  const t = await open({});
  try {
    const first = await t.add(['alice.blog', 'https://alice.blog/', 'http://bob.substack.com/?utm_source=x', 'https://localhost/admin', 'https://10.0.0.1/', 'https://alice.blog:8080/']);
    expect(first.added.map(b => b.url)).toEqual(['https://alice.blog/', 'https://bob.substack.com/']);
    expect(first.invalid.map(b => b.url)).toEqual(['https://localhost/admin', 'https://10.0.0.1/', 'https://alice.blog:8080/']);
    expect(first.readNow).toBeNull();
    const again = await t.add(['ALICE.blog']);
    expect(again.added).toEqual([]);
    expect(again.existing).toEqual([{id: first.added[0].id, url: 'https://alice.blog/'}]);
    expect(again.readNow).toBe(first.added[0].id);
    await expect(t.db.transaction(q => t.blogroll.addIn(q, {urls: Array(201).fill('a.blog')}, 'x'))).rejects.toThrow('between 1 and 200');
    await expect(t.db.transaction(q => t.blogroll.addIn(q, {urls: ['a.blog'], extra: 1}, 'x'))).rejects.toThrow();
  } finally { await t.store.close(); }
});

test('Helios reads a blog, counts its Helios lines, and the newest post wins', async () => {
  const posts = [
    {id: 'one', date: day(20), html: '<p>I have thought about it.</p><p>Helios: support FREE-WEED HGA-031 HGA-012</p>'},
    {id: 'two', date: day(22), html: '<p>Changed my mind on zoning.</p><p>Helios: oppose HGA-012</p>'},
    {id: 'quote', date: day(23), html: '<blockquote>Helios: oppose FREE-WEED</blockquote><pre>Helios: oppose HGA-031</pre><p>No vote here.</p>'},
  ];
  const t = await open({'https://alice.blog/': page('/feed'), 'https://alice.blog/feed': feed(posts)});
  try {
    const {added: [alice]} = await t.add(['alice.blog']);
    const read = await t.blogroll.readNow(alice.id);
    expect(read).toMatchObject({status: 'ok', feedUrl: 'https://alice.blog/feed', siteUrl: 'https://alice.blog/', title: 'Alice writes', postsRead: 3, postsWithLines: 2});
    expect(votesOf(read)).toEqual([`${FREE_WEED}:support`, 'HGA-012:oppose', 'HGA-031:support']);
    // Reading again within a minute does not hit the blog again.
    const calls = t.site.calls.length;
    expect(await t.blogroll.readNow(alice.id)).toMatchObject({recentlyRead: true});
    expect(t.site.calls.length).toBe(calls);

    const board = await t.blogroll.overview();
    expect(board.stats).toMatchObject({watching: 1, voting: 1, votes: 3});
    expect(board.laws[FREE_WEED]).toMatchObject({support: 1, oppose: 0, unsure: 0});
    expect(board.laws['HGA-012']).toMatchObject({support: 0, oppose: 1});
    expect(board.laws['HGA-012'].voices[0]).toMatchObject({position: 'oppose', blog: {id: alice.id, title: 'Alice writes', siteUrl: 'https://alice.blog/'}, post: {url: 'https://alice.blog/p/two', title: 'Post two'}});
    expect(board.blogs).toEqual([expect.objectContaining({id: alice.id, votes: 3, support: 2, oppose: 1, unsure: 0, feedUrl: 'https://alice.blog/feed'})]);
    expect(board.mine).toEqual([]);
    expect((await t.blogroll.overview('actor-1')).mine).toEqual([expect.objectContaining({id: alice.id, status: 'ok', votes: 3})]);
  } finally { await t.store.close(); }
});

test('authors change, withdraw and remove votes in later posts', async () => {
  const posts = [
    {id: 'one', date: day(20), html: '<p>Helios: support FREE-WEED HGA-031 HGA-012</p>'},
    {id: 'two', date: day(22), html: '<p>Helios: oppose HGA-012</p>'},
  ];
  const t = await open({'https://alice.blog/': page('/feed'), 'https://alice.blog/feed': () => ({status: 200, body: feed(posts)})});
  try {
    const {added: [alice]} = await t.add(['alice.blog']);
    await t.blogroll.readNow(alice.id);
    posts.push({id: 'three', date: day(24), html: '<p>Helios: withdraw HGA-031; unsure FREE-WEED</p>'});
    t.tick(2 * MINUTE);
    expect(votesOf(await t.blogroll.readNow(alice.id))).toEqual([`${FREE_WEED}:unsure`, 'HGA-012:oppose']);
    // The author edits post two to remove its line, so post one's position on HGA-012 is current again.
    posts[1].html = '<p>Never mind.</p>';
    t.tick(2 * MINUTE);
    expect(votesOf(await t.blogroll.readNow(alice.id))).toEqual([`${FREE_WEED}:unsure`, 'HGA-012:support']);
    // A post with no date counts from when Helios first saw it, so it is the newest.
    posts.push({id: 'four', html: '<p>Helios: withdraw all</p>'});
    t.tick(2 * MINUTE);
    expect(votesOf(await t.blogroll.readNow(alice.id))).toEqual([]);
    const board = await t.blogroll.overview();
    expect(board.blogs).toEqual([]);
    expect(board.laws).toEqual({});
    expect(board.stats).toMatchObject({watching: 1, voting: 0, votes: 0});
  } finally { await t.store.close(); }
});

test('a second address for the same blog is folded into the first', async () => {
  const t = await open({
    'https://alice.blog/': page('/feed'),
    'https://alice.blog/feed': feed([{id: 'one', date: day(20), html: '<p>Helios: support HGA-001</p>'}]),
    'https://www.alice.blog/': page('https://alice.blog/feed'),
  });
  try {
    const {added: [alice]} = await t.add(['alice.blog']);
    await t.blogroll.readNow(alice.id);
    // The feed address itself is recognized without reading anything.
    expect((await t.add(['https://alice.blog/feed'])).existing).toEqual([{id: alice.id, url: 'https://alice.blog/feed'}]);
    const {added: [www]} = await t.add(['www.alice.blog']);
    expect(await t.blogroll.readNow(www.id)).toMatchObject({status: 'duplicate', duplicateOf: alice.id, votes: []});
    expect((await t.add(['www.alice.blog'])).existing).toEqual([{id: alice.id, url: 'https://www.alice.blog/'}]);
    const board = await t.blogroll.overview();
    expect(board.stats).toMatchObject({watching: 1, voting: 1, votes: 1});
  } finally { await t.store.close(); }
});

test('unreachable blogs back off, then show as failing to whoever added them', async () => {
  const t = await open({'https://alice.blog/': page('/feed'), 'https://alice.blog/feed': feed([])});
  try {
    const {added: [gone]} = await t.add(['gone.blog']);
    const first = await t.blogroll.readNow(gone.id);
    expect(first).toMatchObject({status: 'queued', code: 'DNS', lastError: 'That site could not be found.'});
    expect(Date.parse(first.nextReadAt) - t.now()).toBe(30 * MINUTE);
    for (let i = 0; i < 2; i++) { t.tick(DAY_MS); await t.blogroll.poll(); }
    const [mine] = (await t.blogroll.overview('actor-1')).mine;
    expect(mine).toMatchObject({id: gone.id, status: 'failing', lastError: 'That site could not be found.', votes: 0});
    expect((await t.blogroll.overview()).blogs).toEqual([]);
  } finally { await t.store.close(); }
});
const DAY_MS = 24 * 60 * MINUTE;

test('blogs without a Helios line are read every 6 hours, and an unchanged feed keeps its pace', async () => {
  const t = await open({
    'https://plain.blog/': page('/feed'),
    'https://plain.blog/feed': ({etag}) => (etag === '"p1"' ? {status: 304} : {status: 200, etag: '"p1"', body: feed([{id: 'x', date: day(25), html: '<p>Just a post.</p>'}], 'Plain')}),
  });
  try {
    const {added: [plain]} = await t.add(['plain.blog']);
    const first = await t.blogroll.readNow(plain.id);
    expect(first).toMatchObject({status: 'ok', postsRead: 1, postsWithLines: 0, votes: []});
    expect(Date.parse(first.nextReadAt) - t.now()).toBe(6 * 60 * MINUTE);
    t.tick(6 * 60 * MINUTE);
    expect(await t.blogroll.poll()).toMatchObject({claimed: 1, ok: 1});
    const [mine] = (await t.blogroll.overview('actor-1')).mine;
    expect(Date.parse(mine.nextReadAt) - t.now()).toBe(6 * 60 * MINUTE);
  } finally { await t.store.close(); }
});

test('polling reads only due blogs, uses conditional requests, and maintainers can hide a blog', async () => {
  let reads = 0;
  const t = await open({
    'https://alice.blog/': page('/feed'),
    'https://alice.blog/feed': ({etag}) => { reads++; return etag === '"v1"' ? {status: 304} : {status: 200, etag: '"v1"', body: feed([{id: 'one', date: day(25), html: '<p>Helios: support FREE-WEED</p>'}])}; },
    'https://bob.blog/': page('https://bob.blog/rss.xml'),
    'https://bob.blog/rss.xml': feed([{id: 'b1', date: day(1), html: '<p>Helios: oppose FREE-WEED</p>'}], 'Bob'),
  });
  try {
    await t.add(['alice.blog', 'bob.blog']);
    expect(await t.blogroll.poll({max: 10})).toMatchObject({claimed: 2, ok: 2, failed: 0, stillDue: 0});
    expect(await t.blogroll.poll()).toMatchObject({claimed: 0});
    expect((await t.blogroll.overview()).laws[FREE_WEED]).toMatchObject({support: 1, oppose: 1});
    // Alice posted recently, so she is due in 15 minutes; Bob is quiet, so 3 hours.
    t.tick(16 * MINUTE);
    expect(await t.blogroll.poll()).toMatchObject({claimed: 1, ok: 1});
    expect(reads).toBe(2);
    expect((await t.blogroll.overview()).laws[FREE_WEED]).toMatchObject({support: 1, oppose: 1});

    const bob = (await t.blogroll.overview()).blogs.find(b => b.title === 'Bob');
    await t.blogroll.hide({id: bob.id, hidden: true});
    let board = await t.blogroll.overview();
    expect(board.laws[FREE_WEED]).toMatchObject({support: 1, oppose: 0});
    expect(board.blogs.map(b => b.title)).toEqual(['Alice writes']);
    expect(await t.blogroll.opml()).not.toContain('bob.blog');
    await t.blogroll.hide({id: bob.id, hidden: false});
    await t.blogroll.poll();
    board = await t.blogroll.overview();
    expect(board.laws[FREE_WEED]).toMatchObject({support: 1, oppose: 1});
    const opml = await t.blogroll.opml();
    expect(opml).toContain('xmlUrl="https://alice.blog/feed"');
    expect(opml).toContain('xmlUrl="https://bob.blog/rss.xml"');
    await expect(t.blogroll.hide({id: 'missing', hidden: true})).rejects.toThrow('Blog not found.');
  } finally { await t.store.close(); }
});

test('API: anyone reads the board; adding blogs is a protected session write that reads one blog at once', async () => {
  const t = await open({'https://alice.blog/': page('/feed'), 'https://alice.blog/feed': feed([{id: 'one', date: day(25), html: '<p>Helios: support FREE-WEED HGA-031</p>'}])});
  try {
    const get = async (path, headers = {}) => t.app(new Request('http://localhost' + path, {headers}));
    const empty = await (await get('/api/blogroll')).json();
    expect(empty).toMatchObject({writable: true, laws: {}, blogs: [], mine: [], stats: {watching: 0, voting: 0, votes: 0}});

    const a = await client({app: t.app});
    expect((await a.post('/api/blogroll/blogs', {urls: ['alice.blog']}, {'x-csrf-token': 'wrong'})).status).toBe(403);
    expect((await a.post('/api/blogroll/blogs', {urls: ['alice.blog']}, {'idempotency-key': 'short'})).status).toBe(400);
    expect((await a.post('/api/blogroll/blogs', {urls: 'alice.blog'})).status).toBe(400);
    const response = await a.post('/api/blogroll/blogs', {urls: ['alice.blog']});
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.added).toHaveLength(1);
    expect(result.read).toMatchObject({status: 'ok', title: 'Alice writes', postsWithLines: 1, votes: [{law: FREE_WEED, position: 'support'}, {law: 'HGA-031', position: 'support'}]});

    const board = await (await get('/api/blogroll', {cookie: a.cookie})).json();
    expect(board.mine).toHaveLength(1);
    expect(board.laws[FREE_WEED].voices[0].post.url).toBe('https://alice.blog/p/one');
    expect((await (await get('/api/blogroll')).json()).mine).toEqual([]);

    const opml = await get('/api/blogroll/opml');
    expect(opml.headers.get('content-type')).toContain('text/x-opml');
    expect(await opml.text()).toContain('xmlUrl="https://alice.blog/feed"');

    const admin = (path, body) => t.app(new Request('http://localhost' + path, {method: 'POST', headers: {authorization: 'Bearer test-admin', 'content-type': 'application/json'}, body: body && JSON.stringify(body)}));
    expect((await t.app(new Request('http://localhost/api/blogroll/poll', {method: 'POST'}))).status).toBe(403);
    expect((await admin('/api/blogroll/poll')).status).toBe(200);
    expect((await admin('/api/blogroll/hide', {id: result.added[0].id, hidden: true})).status).toBe(200);
    expect((await (await get('/api/blogroll')).json()).blogs).toEqual([]);
    expect((await get('/api/blogroll/poll')).status).toBe(405);
  } finally { await t.store.close(); }
});

test('API: a deployment without the shared database shows the board but does not take blogs', async () => {
  const t = await open({}, {health: {storage: 'pglite', runtime: 'fly-machine'}});
  try {
    const board = await (await t.app(new Request('http://localhost/api/blogroll'))).json();
    expect(board.writable).toBe(false);
    const a = await client({app: t.app});
    expect((await a.post('/api/blogroll/blogs', {urls: ['alice.blog']})).status).toBe(503);
    const poll = await t.app(new Request('http://localhost/api/blogroll/poll', {method: 'POST', headers: {authorization: 'Bearer test-admin'}}));
    expect(poll.status).toBe(503);
  } finally { await t.store.close(); }
});
