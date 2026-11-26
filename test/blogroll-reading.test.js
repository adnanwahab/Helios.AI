import {test, expect} from 'bun:test';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {FREE_WEED, foldVotes, formatHeliosLine, lawId, parseHeliosLines} from '../public/blogroll-line.js';
import {discoverFeeds, guessFeeds, htmlToText, parseFeed, parseXml, toOpml} from '../src/blogroll/feed.js';
import {BlogError, checkUrl, createGuardedFetch, createGuardedLookup, isPublicAddress} from '../src/blogroll/fetch.js';
import {createBlogReader} from '../src/blogroll/reader.js';
import {normalizeBlogUrl} from '../src/blogroll/store.js';

const line = text => parseHeliosLines(text).entries.map(e => `${e.law}:${e.position}`);

test('a Helios line says exactly which laws a post supports or opposes', () => {
  expect(line('Helios: support FREE-WEED HGA-031; oppose HGA-012')).toEqual([`${FREE_WEED}:support`, 'HGA-031:support', 'HGA-012:oppose']);
  // Original HFL numbers, short IDs, prefixes and the free-joints alias all work.
  expect(line('helios votes: +hfl-31, -hga12 ?HGA-050 and yes free-joints.')).toEqual(['HGA-031:support', 'HGA-012:oppose', 'HGA-050:unsure', `${FREE_WEED}:support`]);
  expect(line('P.S. Helios: 👍 HGA-100 👎 HGA-001')).toEqual(['HGA-100:support', 'HGA-001:oppose']);
  // The last mention of a law wins, and "withdraw all" clears what came before it.
  expect(line('Helios: support HGA-031\nHelios: unsure HGA-031')).toEqual(['HGA-031:unsure']);
  expect(line('Helios: support HGA-002 withdraw all support HGA-003')).toEqual(['*:withdraw', 'HGA-003:support']);
  expect(line('Helios: withdraw HGA-031')).toEqual(['HGA-031:withdraw']);
  // No stance, no vote; unknown and out-of-range IDs are reported, not counted.
  const loose = parseHeliosLines('Helios: HGA-031 support HGA-000 HGA-101 HFL-1000 maybe');
  expect(loose.entries).toEqual([]);
  expect(loose.ignored).toEqual(['HGA-031', 'HGA-000', 'HGA-101', 'HFL-1000']);
  // Prose that merely mentions Helios never votes.
  for (const prose of ['I read about Helios today and support HGA-031.', 'The Heliosphere: support HGA-001', 'Helios.AI: support HGA-001']) expect(line(prose)).toEqual([]);
  expect(lawId('hga-7')).toBe('HGA-007');
  expect(lawId('draft-cannabis')).toBe(FREE_WEED);
  expect(lawId('HGA-1000')).toBeNull();
});

test('the line builder writes what the parser reads, and newer posts override older ones', () => {
  const text = formatHeliosLine([['HGA-031', 'support'], ['HGA-012', 'oppose'], [FREE_WEED, 'support'], ['HGA-002', 'unsure'], ['nope', 'support']]);
  expect(text).toBe('Helios: support FREE-WEED HGA-031; oppose HGA-012; unsure HGA-002');
  expect(line(text)).toEqual([`${FREE_WEED}:support`, 'HGA-031:support', 'HGA-012:oppose', 'HGA-002:unsure']);
  expect(formatHeliosLine([])).toBe('');
  const posts = [
    {guid: 'a', entries: parseHeliosLines('Helios: support HGA-031 HGA-012 FREE-WEED').entries},
    {guid: 'b', entries: parseHeliosLines('Helios: oppose HGA-012; withdraw HGA-031').entries},
  ];
  const votes = foldVotes(posts);
  expect([...votes].map(([law, v]) => `${law}:${v.position}:${v.post.guid}`).sort()).toEqual([`${FREE_WEED}:support:a`, 'HGA-012:oppose:b']);
  expect(foldVotes([...posts, {guid: 'c', entries: parseHeliosLines('Helios: withdraw all').entries}]).size).toBe(0);
});

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>Alice &amp; friends</title><link>https://alice.blog/</link>
<item><title>Free weed, explained</title><link>https://alice.blog/p/free-weed</link><guid isPermaLink="false">post-1</guid>
<pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate>
<content:encoded><![CDATA[<p>Why I changed my mind.</p><p>Helios: support FREE-WEED HGA-031</p>
<pre>Helios: oppose HGA-031</pre><blockquote><p>Helios: oppose FREE-WEED</p></blockquote><p>Try <code>Helios: oppose HGA-044</code> to vote no.</p>]]></content:encoded></item>
<item><title>Escaped description</title><link>https://alice.blog/p/2</link><dc:date>2026-11-25T08:00:00Z</dc:date>
<description>&lt;p&gt;Helios: oppose HGA-012&lt;/p&gt;</description></item>
<item><title>Raw HTML inside</title><link>https://alice.blog/p/3</link><description><p>Helios: unsure HGA-050</p></description></item>
</channel></rss>`;

test('RSS, Atom, RSS 1.0 and JSON feeds are read, skipping quoted and code blocks', () => {
  const feed = parseFeed(rss, 'https://alice.blog/feed');
  expect(feed.kind).toBe('rss');
  expect(feed.title).toBe('Alice & friends');
  expect(feed.siteUrl).toBe('https://alice.blog/');
  expect(feed.items.map(i => i.id)).toEqual(['post-1', 'https://alice.blog/p/2', 'https://alice.blog/p/3']);
  expect(feed.items[0].published).toBe(Date.UTC(2026, 10, 24, 10));
  expect(feed.items[1].published).toBe(Date.UTC(2026, 10, 25, 8));
  expect(line(feed.items[0].text)).toEqual([`${FREE_WEED}:support`, 'HGA-031:support']);
  expect(line(feed.items[1].text)).toEqual(['HGA-012:oppose']);
  expect(line(feed.items[2].text)).toEqual(['HGA-050:unsure']);

  const atom = parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Bob</title>
    <link rel="self" href="https://bob.blog/atom.xml"/><link rel="alternate" type="text/html" href="https://bob.blog/"/>
    <entry><id>tag:bob.blog,2026:1</id><title type="html">Childcare &amp;amp; me</title><link rel="alternate" href="/posts/1"/>
    <updated>2026-11-21T00:00:00Z</updated><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Helios: support HGA-031</p><pre>Helios: oppose HGA-031</pre></div></content></entry>
    <entry><id>tag:bob.blog,2026:2</id><title>Plain</title><published>2026-11-22T00:00:00Z</published><summary type="html">&lt;p&gt;Helios: oppose HGA-002&lt;/p&gt;</summary></entry></feed>`, 'https://bob.blog/atom.xml');
  expect(atom.kind).toBe('atom');
  expect(atom.siteUrl).toBe('https://bob.blog/');
  expect(atom.items[0]).toMatchObject({id: 'tag:bob.blog,2026:1', url: 'https://bob.blog/posts/1', title: 'Childcare & me', published: Date.UTC(2026, 10, 21)});
  expect(line(atom.items[0].text)).toEqual(['HGA-031:support']);
  expect(line(atom.items[1].text)).toEqual(['HGA-002:oppose']);

  const rdf = parseFeed(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel><title>Carol</title><link>https://carol.blog/</link></channel>
    <item><title>One</title><link>https://carol.blog/1</link><description>Helios: support HGA-009</description></item></rdf:RDF>`, 'https://carol.blog/index.rdf');
  expect(rdf.items.map(i => line(i.text))).toEqual([['HGA-009:support']]);

  const json = parseFeed(JSON.stringify({version: 'https://jsonfeed.org/version/1.1', title: 'Dee', home_page_url: 'https://dee.blog/',
    items: [{id: '1', url: 'https://dee.blog/1', content_html: '<p>Helios: oppose FREE-WEED</p>', date_published: '2026-11-23T00:00:00Z'}]}), 'https://dee.blog/feed.json');
  expect(json.kind).toBe('json');
  expect(line(json.items[0].text)).toEqual([`${FREE_WEED}:oppose`]);

  expect(parseFeed('<!doctype html><html><body><feed>not a feed</feed></body></html>', 'https://x.blog/')).toBeNull();
  expect(parseFeed('{"not":"a feed"}', 'https://x.blog/')).toBeNull();
  expect(htmlToText('<p>A&amp;B&nbsp;&#8212; &#x1F44D;</p><script>Helios: support HGA-001</script>')).toBe('A&B — 👍');
});

test('hostile markup costs linear time', () => {
  // Sized so a quadratic parser would take seconds; a linear one takes milliseconds.
  const started = performance.now();
  for (const html of ['<code>'.repeat(40000), '<!--'.repeat(40000), '<br '.repeat(40000), '<'.repeat(150000), '<a>'.repeat(30000) + '</b>'.repeat(30000)]) {
    htmlToText(html);
    discoverFeeds(html.replaceAll('<br', '<link'), 'https://a.blog/');
    parseXml(html);
  }
  parseHeliosLines('Helios: ' + 'support HGA-001 '.repeat(20000));
  expect(performance.now() - started).toBeLessThan(1500);
  // Collect the large test strings now, not during a later timing-sensitive test.
  globalThis.Bun?.gc(true);
  expect(parseHeliosLines('Helios: ' + 'x '.repeat(500)).ignored).toHaveLength(20);
  expect(parseHeliosLines(Array(50).fill('Helios: support HGA-001').join('\n')).lines).toHaveLength(10);
});

test('feeds are found from a blog page, and blogrolls export as OPML', () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="Alice &raquo; Comments Feed" href="/comments/feed/">
    <link rel="alternate" type="application/rss+xml" title="Alice" href="/feed/">
    <link rel="alternate" type="application/atom+xml" href="https://alice.blog/atom.xml">
    <link rel="stylesheet" href="/style.css"></head></html>`;
  expect(discoverFeeds(html, 'https://alice.blog/about')).toEqual(['https://alice.blog/feed/', 'https://alice.blog/atom.xml']);
  expect(guessFeeds('https://alice.blog/')[0]).toBe('https://alice.blog/feed');
  expect(guessFeeds('https://alice.blog/writing').slice(0, 2)).toEqual(['https://alice.blog/writing/feed', 'https://alice.blog/writing/rss']);
  const opml = toOpml([{title: 'Alice & "friends"', siteUrl: 'https://alice.blog/', feedUrl: 'https://alice.blog/feed?a=1&b=2'}], {created: new Date(0)});
  const outline = parseXml(opml).children.find(n => n.name === 'opml').children.find(n => n.name === 'body').children.find(n => n.name === 'outline');
  expect(outline.attrs).toMatchObject({type: 'rss', text: 'Alice & "friends"', xmlurl: 'https://alice.blog/feed?a=1&b=2', htmlurl: 'https://alice.blog/'});
});

test('only public https addresses are read', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicAddress(address)).toBe(true);
  for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::', '::1',
    '::ffff:127.0.0.1', 'fe80::1', 'fd12::1', '64:ff9b::a00:1', '2002:c0a8:101::', '2001:db8::1', 'not-an-ip']) expect(isPublicAddress(address)).toBe(false);
  expect(normalizeBlogUrl(' alice.blog ')).toBe('https://alice.blog/');
  expect(normalizeBlogUrl('http://Alice.Blog/Writing/?utm_source=x&page=2#top')).toBe('https://alice.blog/Writing?page=2');
  for (const [address, code] of [['https://localhost/', 'URL_PRIVATE'], ['https://printer.local/', 'URL_PRIVATE'], ['https://10.0.0.1/', 'URL_IP'], ['https://[::1]/', 'URL_IP'],
    ['https://alice.blog:8443/', 'URL_PORT'], ['https://me:pw@alice.blog/', 'URL_CREDENTIALS'], ['ftp://alice.blog/', 'URL_SCHEME'], ['https://blog.example/', 'URL_PRIVATE']]) {
    expect(() => checkUrl(address)).toThrow(BlogError);
    try { checkUrl(address); } catch (error) { expect(error.code).toBe(code); }
  }
  expect(() => normalizeBlogUrl('   ')).toThrow('Enter a blog address.');
});

test('the socket lookup refuses private addresses, including any one of several', async () => {
  const lookupWith = addresses => createGuardedLookup({resolve: (host, options, callback) => callback(null, addresses)});
  const run = (lookup, options) => new Promise(resolve => lookup('alice.blog', options, (error, address, family) => resolve({error, address, family})));
  expect(await run(lookupWith([{address: '8.8.8.8', family: 4}]), {})).toMatchObject({address: '8.8.8.8', family: 4});
  expect((await run(lookupWith([{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}]), {})).error.code).toBe('EHELIOS_PRIVATE');
  const all = await run(lookupWith([{address: '2606:4700::1111', family: 6}]), {all: true});
  expect(all.address).toEqual([{address: '2606:4700::1111', family: 6}]);
});

// A stand-in for https.request that answers from a table of responses.
function fakeRequest(routes, seen = []) {
  return (url, options, onResponse) => {
    const req = new EventEmitter();
    seen.push({url: url.href, options});
    req.destroy = () => {};
    req.end = () => queueMicrotask(() => {
      const route = routes[url.href];
      if (!route) return req.emit('error', Object.assign(new Error('nope'), {code: 'ENOTFOUND'}));
      const res = Readable.from(route.body ? [Buffer.from(route.body)] : []);
      res.statusCode = route.status ?? 200;
      res.headers = route.headers ?? {'content-type': 'application/rss+xml'};
      onResponse(res);
    });
    return req;
  };
}

test('guarded reads follow safe redirects, decode gzip and refuse unsafe answers', async () => {
  const seen = [];
  const big = 'x'.repeat(5000);
  const get = createGuardedFetch({maxBytes: 4000, request: fakeRequest({
    'https://alice.blog/feed': {status: 301, headers: {location: '/feed/'}},
    'https://alice.blog/feed/': {headers: {'content-type': 'application/rss+xml; charset=utf-8', 'content-encoding': 'gzip', etag: '"v1"'}, body: gzipSync('<rss>ok ✓</rss>')},
    'https://alice.blog/unchanged': {status: 304},
    'https://alice.blog/to-http': {status: 302, headers: {location: 'http://alice.blog/feed'}},
    'https://alice.blog/to-local': {status: 302, headers: {location: 'https://localhost/admin'}},
    'https://alice.blog/huge': {body: big},
    'https://alice.blog/photo': {headers: {'content-type': 'image/png'}, body: 'png'},
    'https://alice.blog/missing': {status: 404},
  }, seen)});
  const result = await get('https://alice.blog/feed');
  expect(result).toMatchObject({status: 200, url: 'https://alice.blog/feed/', body: '<rss>ok ✓</rss>', etag: '"v1"'});
  expect(seen[0].options.agent).toBe(false);
  expect(typeof seen[0].options.lookup).toBe('function');
  expect((await get('https://alice.blog/unchanged', {etag: '"v1"'})).status).toBe(304);
  expect(seen.at(-1).options.headers['if-none-match']).toBe('"v1"');
  for (const [path, code] of [['to-http', 'URL_SCHEME'], ['to-local', 'URL_PRIVATE'], ['huge', 'SIZE'], ['photo', 'TYPE'], ['missing', 'HTTP_404'], ['nowhere', 'DNS']]) {
    const error = await get('https://alice.blog/' + path).catch(e => e);
    expect(error).toBeInstanceOf(BlogError);
    expect(error.code).toBe(code);
  }
  expect((await get('https://alice.blog/feed', {deadline: Date.now() - 1}).catch(e => e)).code).toBe('TIMEOUT');
});

test('the reader finds a feed from the page, guesses common paths, and rediscovers a moved feed', async () => {
  const pages = {
    'https://alice.blog/': '<html><head><link rel="alternate" type="application/rss+xml" href="/feed"></head></html>',
    'https://alice.blog/feed': rss,
    'https://quiet.blog/': '<html><body>No feed link here</body></html>',
    'https://quiet.blog/rss': rss,
    'https://empty.blog/': '<html><body>Nothing</body></html>',
  };
  const calls = [];
  const get = async url => { calls.push(url); if (!(url in pages)) throw new BlogError('The site answered with HTTP 404.', 'HTTP_404'); return {status: 200, url, body: pages[url]}; };
  const read = createBlogReader({get});
  expect((await read({inputUrl: 'https://alice.blog/'})).feedUrl).toBe('https://alice.blog/feed');
  expect((await read({inputUrl: 'https://quiet.blog/'})).feedUrl).toBe('https://quiet.blog/rss');
  // The stored feed now returns a page, so the reader goes back to the blog and finds it again.
  pages['https://quiet.blog/rss'] = '<html>moved</html>';
  pages['https://quiet.blog/feed.xml'] = rss;
  expect((await read({inputUrl: 'https://quiet.blog/', feedUrl: 'https://quiet.blog/rss'})).feedUrl).toBe('https://quiet.blog/feed.xml');
  const error = await read({inputUrl: 'https://empty.blog/'}).catch(e => e);
  expect(error.code).toBe('NO_FEED');
  expect(calls.filter(url => url.startsWith('https://empty.blog/')).length).toBeLessThanOrEqual(5);
});
