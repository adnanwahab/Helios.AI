// Feeds, feed discovery and OPML for the blogroll. Dependency-free and
// tolerant of the small mistakes real feeds make. It never resolves DTDs or
// external entities, and it only reads text, links and dates.

const NAMED = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•', deg: '°', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', oacute: 'ó', uacute: 'ú', iacute: 'í', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', euro: '€', pound: '£', times: '×', zwj: '', zwnj: '', shy: ''};

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,10});/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }
    const value = NAMED[name.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

function parseAttributes(source) {
  const attrs = {};
  // Real tags are short; a cap keeps a malformed one from costing quadratic time.
  for (const match of String(source).slice(0, 4000).matchAll(/([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

const MAX_DEPTH = 64;

// A small, forgiving XML reader: elements, attributes, text and CDATA.
export function parseXml(source) {
  const text = String(source ?? '');
  const root = {name: '#document', attrs: {}, children: [], text: ''};
  const stack = [root];
  const add = value => { if (value) { const node = stack.at(-1); node.text += value; node.children.push(value); } };
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { add(decodeEntities(text.slice(i))); break; }
    if (lt > i) add(decodeEntities(text.slice(i, lt)));
    if (text.startsWith('<!--', lt)) { const end = text.indexOf('-->', lt + 4); i = end < 0 ? text.length : end + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      add(text.slice(lt + 9, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) { const end = text.indexOf('?>', lt + 2); i = end < 0 ? text.length : end + 2; continue; }
    if (text.startsWith('<!', lt)) {
      let j = lt + 2, depth = 0;
      for (; j < text.length; j++) { const c = text[j]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; }
      i = j + 1;
      continue;
    }
    if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      const name = text.slice(lt + 2, end < 0 ? text.length : end).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    // A "<" that does not start a tag is text. Check before scanning for ">",
    // so a run of stray "<" characters costs linear time.
    if (!/[A-Za-z_]/.test(text[lt + 1] || '')) { add('<'); i = lt + 1; continue; }
    let j = lt + 1, quote = null;
    for (; j < text.length; j++) { const c = text[j]; if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break; }
    const inner = text.slice(lt + 1, j);
    const name = inner.match(/^[A-Za-z_][\w.:-]*/)[0];
    const element = {name: name.toLowerCase(), attrs: parseAttributes(inner.slice(name.length).replace(/\/\s*$/, '')), children: [], text: ''};
    const node = stack.at(-1);
    node.children.push(element);
    // Feeds nest a few levels deep; a depth cap keeps hostile nesting cheap.
    if (!/\/\s*$/.test(inner) && stack.length < MAX_DEPTH) stack.push(element);
    i = j + 1;
  }
  return root;
}

const elements = node => node.children.filter(child => typeof child === 'object');
const child = (node, ...names) => elements(node).find(el => names.includes(el.name));
const childrenNamed = (node, name) => elements(node).filter(el => el.name === name);
const BLOCK = new Set(['p', 'div', 'br', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'tr', 'table', 'hr', 'figure', 'aside', 'dd', 'dt']);
const SKIP = new Set(['pre', 'code', 'blockquote', 'script', 'style', 'template', 'noscript', 'svg']);

// Text of an element tree (Atom xhtml content), skipping quoted and code blocks.
function deepText(node) {
  let out = '';
  for (const part of node.children) {
    if (typeof part === 'string') out += part;
    else if (SKIP.has(part.name.replace(/^.*:/, ''))) out += '\n';
    else { const block = BLOCK.has(part.name.replace(/^.*:/, '')); out += (block ? '\n' : '') + deepText(part) + (block ? '\n' : ''); }
  }
  return out;
}

const BREAKS = new Set([...BLOCK, 'figcaption']);

// Plain text from post HTML. Code, preformatted and quoted blocks are dropped,
// so a post that quotes someone else's Helios line does not vote with it.
// One pass over the markup, so hostile input (thousands of unclosed tags or
// comments) costs linear time.
export function htmlToText(html) {
  const s = String(html ?? '').slice(0, 400_000);
  let out = '', i = 0, skip = null, depth = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { if (!skip) out += s.slice(i); break; }
    if (!skip) out += s.slice(i, lt);
    if (s.startsWith('<!--', lt)) { const end = s.indexOf('-->', lt + 4); i = end < 0 ? s.length : end + 3; continue; }
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0) { if (!skip) out += s.slice(lt); break; }
    i = gt + 1;
    const tag = /^(\/?)([a-z][\w:-]*)/i.exec(s.slice(lt + 1, Math.min(gt, lt + 64)));
    if (!tag) { if (!skip) out += s.slice(lt, gt + 1); continue; }
    const closing = tag[1] === '/', name = tag[2].toLowerCase().replace(/^.*:/, ''), selfClosing = s[gt - 1] === '/';
    if (skip) {
      if (name === skip && !selfClosing) depth += closing ? -1 : 1;
      if (depth === 0) { skip = null; out += '\n'; }
    } else if (!closing && !selfClosing && SKIP.has(name)) {
      skip = name;
      depth = 1;
      out += '\n';
    } else if (BREAKS.has(name)) out += '\n';
  }
  return decodeEntities(out)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absolute(href, base) {
  try {
    const url = new URL(String(href || '').trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function date(value) {
  const time = Date.parse(String(value || '').trim());
  return Number.isFinite(time) ? time : null;
}

const clip = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};

// Escaped HTML is the norm; some feeds put raw HTML elements inside instead.
const markupText = el => (!el ? '' : elements(el).length ? deepText(el) : htmlToText(el.text));

function contentText(el) {
  if (!el) return '';
  const type = (el.attrs.type || '').toLowerCase();
  if (type === 'xhtml') return deepText(el);
  if (type === 'text') return el.text;
  return markupText(el);
}

function atomLink(entry, base, wanted = 'alternate') {
  const links = childrenNamed(entry, 'link');
  const link = links.find(l => (l.attrs.rel || 'alternate') === wanted && (!l.attrs.type || /html/.test(l.attrs.type))) || links.find(l => !l.attrs.rel);
  return link ? absolute(link.attrs.href, base) : null;
}

function jsonFeed(text, base) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== 'object' || !/jsonfeed\.org\/version\//.test(String(data.version || '')) || !Array.isArray(data.items)) return null;
  return {
    kind: 'json',
    title: clip(data.title, 200),
    siteUrl: absolute(data.home_page_url, base),
    items: data.items.slice(0, 100).filter(item => item && typeof item === 'object').map(item => ({
      id: String(item.id ?? item.url ?? ''),
      url: absolute(item.url, base),
      title: clip(item.title, 300),
      published: date(item.date_published || item.date_modified),
      text: (item.title ? item.title + '\n' : '') + (item.content_html ? htmlToText(item.content_html) : String(item.content_text || item.summary || '')),
    })),
  };
}

// Returns {kind, title, siteUrl, items: [{id, url, title, published, text}]}, or null if not a feed.
export function parseFeed(body, base) {
  const text = String(body ?? '');
  if (/^\s*[{[]/.test(text)) return jsonFeed(text, base);
  if (!/<(rss|feed|rdf:rdf)[\s>]/i.test(text.slice(0, 10_000))) return null;
  const doc = parseXml(text);
  const top = elements(doc).find(el => ['rss', 'feed', 'rdf:rdf'].includes(el.name));
  if (!top) return null;
  if (top.name === 'feed') {
    return {
      kind: 'atom',
      title: clip(child(top, 'title')?.text, 200),
      siteUrl: atomLink(top, base),
      items: childrenNamed(top, 'entry').slice(0, 100).map(entry => {
        const title = clip(contentText(child(entry, 'title')), 300);
        return {
          id: child(entry, 'id')?.text.trim() || atomLink(entry, base) || title,
          url: atomLink(entry, base),
          title,
          published: date(child(entry, 'published')?.text) ?? date(child(entry, 'updated')?.text),
          text: title + '\n' + contentText(child(entry, 'content') || child(entry, 'summary')),
        };
      }),
    };
  }
  const channel = child(top, 'channel') || top;
  const items = top.name === 'rss' ? childrenNamed(channel, 'item') : childrenNamed(top, 'item');
  return {
    kind: 'rss',
    title: clip(child(channel, 'title')?.text, 200),
    siteUrl: absolute(child(channel, 'link')?.text, base),
    items: items.slice(0, 100).map(item => {
      const title = clip(markupText(child(item, 'title')), 300);
      const link = absolute(child(item, 'link')?.text || child(item, 'guid')?.text, base);
      return {
        id: child(item, 'guid')?.text.trim() || link || title,
        url: link,
        title,
        published: date(child(item, 'pubdate', 'dc:date')?.text),
        text: title + '\n' + markupText(child(item, 'content:encoded') || child(item, 'description')),
      };
    }),
  };
}

// <link rel="alternate" type="application/rss+xml" href="..."> on a blog's page.
export function discoverFeeds(html, base) {
  const found = [];
  for (const match of String(html ?? '').slice(0, 600_000).matchAll(/<link\b[^<>]{0,2000}>/gi)) {
    const attrs = parseAttributes(match[0].slice(5, -1));
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    const type = String(attrs.type || '').toLowerCase();
    if (!rel.includes('alternate') || !/^application\/(rss|atom)\+xml$|^application\/feed\+json$/.test(type)) continue;
    if (/comment/i.test(attrs.title || '') || /\/comments?\/feed/i.test(attrs.href || '')) continue;
    const href = absolute(attrs.href, base);
    if (href && !found.includes(href)) found.push(href);
  }
  return found;
}

// Common feed addresses for blogs whose pages do not advertise a feed.
export function guessFeeds(pageUrl) {
  const url = new URL(pageUrl);
  const path = url.pathname.replace(/\/+$/, '');
  const names = ['feed', 'rss', 'feed.xml', 'index.xml', 'atom.xml', 'rss.xml'];
  const guesses = [...(path ? names.slice(0, 3).map(name => `${url.origin}${path}/${name}`) : []), ...names.map(name => `${url.origin}/${name}`)];
  return [...new Set(guesses)].filter(href => href !== url.href);
}

const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));

// OPML 2.0, the format feed readers use to import and export blogrolls.
export function toOpml(blogs, {title = 'Helios blogroll', created = new Date()} = {}) {
  const outlines = blogs.map(blog => {
    const name = blog.title || blog.siteUrl || blog.feedUrl;
    return `    <outline type="rss" text="${xml(name)}" title="${xml(name)}" xmlUrl="${xml(blog.feedUrl)}"${blog.siteUrl ? ` htmlUrl="${xml(blog.siteUrl)}"` : ''}/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>${xml(title)}</title>\n    <dateCreated>${created.toUTCString()}</dateCreated>\n  </head>\n  <body>\n${outlines.join('\n')}${outlines.length ? '\n' : ''}  </body>\n</opml>\n`;
}
