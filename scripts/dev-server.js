// Local stand-in for Netlify: serves dist/ (run `node scripts/build-netlify.mjs` first),
// applies the redirects in netlify.toml, and runs the API in-process. The database is
// Supabase when SUPABASE_DB_URL is set, otherwise a local PGlite directory.
// Usage: node scripts/dev-server.js   (PORT=3000, HOST=127.0.0.1, HELIOS_PGLITE_DIR=.data/pglite)
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, resolve, sep} from 'node:path';
import {createPGliteDatabase, pgliteDataDir} from '../src/db-pglite.js';
import {createRuntime} from '../src/runtime.js';

const root = process.cwd();
const dist = resolve(root, 'dist');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'};

const toml = await readFile(join(root, 'netlify.toml'), 'utf8');
const redirects = new Map([...toml.matchAll(/\[\[redirects\]\]\s*from\s*=\s*"([^"]+)"\s*to\s*=\s*"([^"]+)"/g)].map(m => [m[1], decodeURI(m[2])]));
const isApi = path => path.startsWith('/api/') || path === '/email/unsubscribe' || path === '/proxy/ycr' || path.startsWith('/proxy/ycr/');

const db = process.env.SUPABASE_DB_URL ? undefined : await createPGliteDatabase(pgliteDataDir());
const runtime = await createRuntime({db, secure: false});

async function serveStatic(path, res, method) {
  let target = path === '/' ? '/index.html' : redirects.get(path) ?? path;
  const file = resolve(dist, '.' + decodeURIComponent(target));
  if (!file.startsWith(dist + sep)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff'});
  res.end(method === 'HEAD' ? undefined : await readFile(file));
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  if (!isApi(url.pathname) && !(await serveStatic(url.pathname, res, req.method))) {
    if (!isApi(url.pathname) && !['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    res.writeHead(404, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'Not found'}));
  }
  if (!isApi(url.pathname)) return;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const init = {method: req.method, headers};
  if (chunks.length) init.body = Buffer.concat(chunks);
  const response = await runtime.app(new Request(url, init), req.socket.remoteAddress || 'local');
  const out = {};
  response.headers.forEach((value, name) => { if (name !== 'set-cookie') out[name] = value; });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
});

// On Fly, the service checks 0.0.0.0:8080; local development stays on 127.0.0.1:3000.
const onFly = Boolean(process.env.FLY_APP_NAME);
const port = Number(process.env.PORT || (onFly ? 8080 : 3000));
const host = process.env.HOST || (onFly ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => console.log(`Helios.AI dev server on http://${host}:${port}`));
const stop = () => { server.close(); runtime.store.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
