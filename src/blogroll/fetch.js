// Guarded HTTPS reads for the blogroll. Anyone can add a blog address, so
// every request is checked before it leaves the server:
// - https on port 443 only, no credentials, no IP literals or local names;
// - DNS is checked inside the socket's own lookup, so the address that was
//   checked is the address that is dialed (no DNS rebinding);
// - every redirect is checked again, bodies are capped and requests time out.
import https from 'node:https';
import zlib from 'node:zlib';
import {lookup as dnsLookup} from 'node:dns';
import {isIP} from 'node:net';

export class BlogError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export const USER_AGENT = 'HeliosBlogroll/1.0 (+https://helioshtml.com/blogs)';
const ACCEPT = 'application/rss+xml,application/atom+xml,application/feed+json,application/xml;q=0.9,text/xml;q=0.9,text/html;q=0.8,application/json;q=0.5';
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|application\/(?:rss|atom|rdf)\+xml|application\/xml|text\/xml|application\/(?:feed\+)?json|text\/plain)$/;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const v4 = address => {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
};
const v4From = (high, low) => [high >> 8, high & 255, low >> 8, low & 255].join('.');

function privateV4([a, b, c]) {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

// Eight 16-bit groups, or null. Accepts "::" and a trailing dotted IPv4 part.
function v6Groups(address) {
  let text = address.toLowerCase().split('%')[0];
  let tail = [];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = v4(dotted[1]);
    if (!parts) return null;
    tail = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
    text = text.slice(0, -dotted[1].length);
    if (text.endsWith(':') && !text.endsWith('::')) text = text.slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = part => (part ? part.split(':').map(group => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN)) : []);
  const head = parse(halves[0]), rest = halves.length === 2 ? parse(halves[1]) : [];
  const used = head.length + rest.length + tail.length;
  if (halves.length === 1 ? used !== 8 : used > 7) return null;
  const groups = [...head, ...Array(8 - used).fill(0), ...rest, ...tail];
  return groups.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

// Only globally routable unicast addresses are public.
export function isPublicAddress(address) {
  const kind = isIP(String(address).split('%')[0]);
  if (kind === 4) { const parts = v4(address); return Boolean(parts) && !privateV4(parts); }
  if (kind !== 6) return false;
  const g = v6Groups(String(address));
  if (!g) return false;
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return false;
    return isPublicAddress(v4From(g[6], g[7]));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 0 && isPublicAddress(v4From(g[6], g[7]));
  if (g[0] === 0x2002) return isPublicAddress(v4From(g[1], g[2]));
  if (g[0] === 0x2001 && (g[1] < 0x0200 || g[1] === 0x0db8)) return false;
  if (g[0] === 0x0100 && !g[1] && !g[2] && !g[3]) return false;
  return (g[0] & 0xe000) === 0x2000;
}

// A dns.lookup replacement for the socket: refuses if any address is not public.
export function createGuardedLookup({resolve = dnsLookup, allow = isPublicAddress} = {}) {
  return function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (typeof options === 'number') options = {family: options};
    resolve(hostname, {all: true, verbatim: true, family: options?.family || 0}, (error, addresses) => {
      if (error) return callback(error);
      const list = (Array.isArray(addresses) ? addresses : [{address: addresses}])
        .filter(entry => entry && typeof entry.address === 'string')
        .map(entry => ({address: entry.address, family: entry.family || isIP(entry.address)}));
      if (!list.length) return callback(Object.assign(new Error('No address found'), {code: 'ENOTFOUND'}));
      if (list.some(entry => !allow(entry.address))) return callback(Object.assign(new Error('Refused a non-public address'), {code: 'EHELIOS_PRIVATE'}));
      if (options?.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

// Checks one address before it is requested (also used for every redirect).
export function checkUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new BlogError('That is not a valid web address.', 'URL_INVALID'); }
  if (url.protocol !== 'https:') throw new BlogError('Helios reads https:// addresses only.', 'URL_SCHEME');
  if (url.username || url.password) throw new BlogError('Addresses with a username or password are not accepted.', 'URL_CREDENTIALS');
  if (url.port && url.port !== '443') throw new BlogError('Helios reads blogs on the standard https port only.', 'URL_PORT');
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, ''))) throw new BlogError('Use the blog’s domain name, not an IP address.', 'URL_IP');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|arpa|test|invalid|example)$/.test(host)) {
    throw new BlogError('That address is not a public website.', 'URL_PRIVATE');
  }
  url.hash = '';
  return url;
}

function charset(contentType, buffer) {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1]
    || /^\s*<\?xml[^>]*encoding=["']([\w-]+)/i.exec(buffer.subarray(0, 200).toString('latin1'))?.[1];
  try { return new TextDecoder(declared || 'utf-8'); } catch { return new TextDecoder('utf-8'); }
}

function networkError(error) {
  if (error instanceof BlogError) return error;
  const code = String(error?.code || '');
  if (code === 'EHELIOS_PRIVATE') return new BlogError('That address points to a private network, so Helios will not read it.', 'URL_PRIVATE');
  if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(code)) return new BlogError('That site could not be found.', 'DNS');
  if (/CERT|TLS|SSL/.test(code)) return new BlogError('The site’s security certificate could not be verified.', 'TLS');
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(code)) return new BlogError('The site closed the connection.', 'CONNECTION');
  return new BlogError('The site could not be reached.', 'NETWORK');
}

// Returns get(url, {etag, lastModified, deadline}) -> {status, url, type, body, etag, lastModified}.
export function createGuardedFetch({lookup = createGuardedLookup(), request = https.request, maxBytes = 2_000_000, timeoutMs = 8000, maxRedirects = 4, userAgent = USER_AGENT} = {}) {
  function once(url, conditional, deadline) {
    return new Promise((resolve, reject) => {
      const remaining = Math.min(timeoutMs, deadline ? deadline - Date.now() : timeoutMs);
      if (remaining <= 0) return reject(new BlogError('Helios ran out of time reading this blog.', 'TIMEOUT'));
      const headers = {'user-agent': userAgent, accept: ACCEPT, 'accept-encoding': 'gzip, deflate, br'};
      if (conditional.etag) headers['if-none-match'] = conditional.etag;
      if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;
      let settled = false;
      const done = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
      const req = request(url, {method: 'GET', headers, lookup, agent: false, timeout: remaining}, res => {
        const status = res.statusCode || 0;
        const header = name => (Array.isArray(res.headers[name]) ? res.headers[name][0] : res.headers[name]);
        if (REDIRECTS.has(status) || status === 304) { res.resume(); return done(resolve, {status, location: header('location') || null}); }
        if (status < 200 || status >= 300) { res.resume(); return done(reject, new BlogError(`The site answered with HTTP ${status}.`, 'HTTP_' + status)); }
        const contentType = String(header('content-type') || '');
        const type = contentType.split(';')[0].trim().toLowerCase();
        if (type && !TEXT_TYPES.test(type)) { res.resume(); return done(reject, new BlogError('That address is not a web page or a feed.', 'TYPE')); }
        if (Number(header('content-length') || 0) > maxBytes) { res.resume(); return done(reject, new BlogError('That page is too large to read.', 'SIZE')); }
        const encoding = String(header('content-encoding') || '').toLowerCase().trim();
        const stream = encoding === 'gzip' || encoding === 'x-gzip' ? res.pipe(zlib.createGunzip())
          : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress())
          : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        const chunks = [];
        let size = 0;
        stream.on('data', chunk => {
          size += chunk.length;
          if (size > maxBytes) { req.destroy(); res.destroy(); return done(reject, new BlogError('That page is too large to read.', 'SIZE')); }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          done(resolve, {status, type, body: charset(contentType, buffer).decode(buffer), etag: header('etag') || null, lastModified: header('last-modified') || null});
        });
        stream.on('error', () => done(reject, new BlogError('That page could not be decoded.', 'DECODE')));
      });
      const timer = setTimeout(() => { req.destroy(); done(reject, new BlogError('The site took too long to answer.', 'TIMEOUT')); }, remaining);
      req.on('timeout', () => { req.destroy(); done(reject, new BlogError('The site took too long to answer.', 'TIMEOUT')); });
      req.on('error', error => done(reject, networkError(error)));
      req.end();
    });
  }
  return async function get(input, {etag = null, lastModified = null, deadline = null} = {}) {
    let url = checkUrl(input);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const result = await once(url, hop === 0 ? {etag, lastModified} : {}, deadline);
      if (!REDIRECTS.has(result.status)) return {...result, url: url.href};
      if (!result.location) throw new BlogError('The site redirected without saying where.', 'REDIRECT');
      url = checkUrl(new URL(result.location, url).href);
    }
    throw new BlogError('The site redirected too many times.', 'REDIRECT');
  };
}
