// Local operator tool only. Never mount this server on a public interface.
import { Database } from 'bun:sqlite';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const levels = ['green', 'yellow', 'red'];
const header = 'uuid,name,security_level,active,revision';
class InputError extends Error {}
function check(ok, message) { if (!ok) throw new InputError(message); }
export function parseKey(value) {
  const key = Buffer.from(value || '', 'base64');
  check(key.length === 32 && key.toString('base64') === value, 'EMAIL_HASH_SECRET must be a canonical base64-encoded 32-byte key.');
  return key;
}
function mac(key, message) { return createHmac('sha256', key).update(message).digest('hex'); }
function normalizeEmail(value) {
  check(typeof value === 'string', 'Email required.');
  const email = value.trim();
  check(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\x00-\x1f\x7f]/.test(email), 'Enter a valid email.');
  // Preserve local-part case; DNS domain names are case-insensitive.
  const at = email.lastIndexOf('@');
  return email.slice(0, at) + '@' + email.slice(at + 1).toLowerCase();
}
function nameOf(value) {
  check(typeof value === 'string', 'Name required.');
  const name = value.trim();
  // Prevent accidental email storage and spreadsheet formula injection.
  check(name.length > 0 && name.length <= 120 && !/[@\x00-\x1f\x7f]/.test(name) && !/^[=+\-＠＝＋－]/.test(name), 'Enter a display name without email, control characters or formula prefixes.');
  return name;
}
function validateEdit(row) {
  check(row && typeof row === 'object', 'Invalid row.');
  check(typeof row.uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.uuid), 'Invalid UUID.');
  check(levels.includes(row.security_level), 'Invalid security level.');
  check(typeof row.active === 'boolean', 'Invalid account status.');
  check(Number.isSafeInteger(row.revision) && row.revision > 0, 'Invalid revision.');
  return {uuid:row.uuid, name:nameOf(row.name), security_level:row.security_level, active:row.active, revision:row.revision};
}
function csvCell(value) { return '"' + String(value).replaceAll('"', '""') + '"'; }
export function csvExport(rows) {
  return header + '\r\n' + rows.map(r => [r.uuid, nameOf(r.name), r.security_level, r.active ? 'true' : 'false', r.revision].map(csvCell).join(',')).join('\r\n') + '\r\n';
}
// Strict RFC-4180-style subset: no control characters in stored names.
function parseCsv(text) {
  check(typeof text === 'string' && text.length <= 500000, 'CSV is too large.');
  text = text.replace(/^\uFEFF/, '');
  const records = []; let row = [], cell = '', quoted = false, closed = false;
  function pushCell() { row.push(cell); cell = ''; closed = false; }
  function pushRow() { pushCell(); records.push(row); row = []; }
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i+1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; }
      } else { cell += c; }
    } else if (c === ',') { pushCell(); }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i+1] === '\n') i++;
      pushRow();
    } else if (c === '"' && cell === '' && !closed) { quoted = true; }
    else { check(!closed && c !== '"', 'Malformed CSV.'); cell += c; }
  }
  check(!quoted, 'Unclosed CSV quotation.');
  if (row.length || cell.length || closed) pushRow();
  check(records.shift()?.join(',') === header, 'Use an exported registry CSV; never import plaintext emails.');
  check(records.length <= 1000, 'Import at most 1000 existing rows at once.');
  return records.filter(r => !(r.length === 1 && r[0] === '')).map(r => {
    check(r.length === 5 && ['true','false'].includes(r[3]) && /^[1-9]\d*$/.test(r[4]), 'Invalid CSV row.');
    return validateEdit({uuid:r[0],name:r[1],security_level:r[2],active:r[3]==='true',revision:Number(r[4])});
  });
}

export function createRegistry(db, key) {
  check(Buffer.isBuffer(key) && key.length === 32, 'Invalid HMAC key.');
  db.exec('PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
  db.exec("CREATE TABLE IF NOT EXISTS security_meta (id INTEGER PRIMARY KEY CHECK(id=1), key_check TEXT NOT NULL); CREATE TABLE IF NOT EXISTS security_users (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, email_hmac TEXT NOT NULL UNIQUE, security_level TEXT NOT NULL CHECK(security_level IN ('green','yellow','red')), active INTEGER NOT NULL CHECK(active IN (0,1)), revision INTEGER NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS security_audit (id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, action TEXT NOT NULL, old_level TEXT, new_level TEXT NOT NULL, old_active INTEGER, new_active INTEGER NOT NULL, at TEXT NOT NULL);");
  const fingerprint = mac(key, 'helios-security:key-check:v1');
  db.transaction(() => {
    db.query('INSERT OR IGNORE INTO security_meta (id,key_check) VALUES (1,?)').run(fingerprint);
    check(db.query('SELECT key_check FROM security_meta WHERE id=1').get().key_check === fingerprint, 'Wrong registry key. Restore the original key; do not regenerate it.');
  }).immediate();
  const digest = email => mac(key, 'helios-security:email:v1:' + normalizeEmail(email));
  const view = 'uuid,name,security_level,active,revision,created_at';
  const publicRow = r => r ? {...r, active:Boolean(r.active)} : null;
  const get = uuid => publicRow(db.query('SELECT ' + view + ' FROM security_users WHERE uuid=?').get(uuid));
  const list = () => db.query('SELECT ' + view + ' FROM security_users ORDER BY created_at, uuid').all().map(publicRow);
  const audit = (uuid, action, before, after) => db.query('INSERT INTO security_audit(uuid,action,old_level,new_level,old_active,new_active,at) VALUES (?,?,?,?,?,?,?)').run(uuid, action, before?.security_level ?? null, after.security_level, before ? Number(before.active) : null, Number(after.active), new Date().toISOString());
  const add = (name, email) => {
    name = nameOf(name);
    const hmac = digest(email);
    return db.transaction(() => {
      check(!db.query('SELECT 1 FROM security_users WHERE email_hmac=?').get(hmac), 'This email is already registered.');
      const uuid = randomUUID();
      db.query("INSERT INTO security_users VALUES (?,?,?,'green',1,1,?)").run(uuid,name,hmac,new Date().toISOString());
      const after = get(uuid);
      audit(uuid,'add',null,after);
      return after;
    }).immediate();
  };
  function editOne(row) {
    const r = validateEdit(row);
    const before = get(r.uuid);
    check(before && before.revision === r.revision, 'Unknown or stale row. Refresh and try again.');
    if (before.name === r.name && before.security_level === r.security_level && before.active === r.active) return before;
    db.query('UPDATE security_users SET name=?,security_level=?,active=?,revision=revision+1 WHERE uuid=?').run(r.name,r.security_level,Number(r.active),r.uuid);
    const after = get(r.uuid);
    audit(r.uuid,'edit',before,after);
    return after;
  }
  const edit = row => db.transaction(() => editOne(row)).immediate();
  const importCsv = text => {
    const rows = parseCsv(text);
    check(new Set(rows.map(r => r.uuid)).size === rows.length, 'Duplicate UUID in CSV.');
    return db.transaction(() => rows.map(editOne)).immediate();
  };
  // Integration helper ONLY for an email from a trusted, already verified
  // server-side identity provider. Never use an email submitted by a client.
  // This does not implement authentication or connect to existing Helios routes.
  function allowsVerifiedEmail(verifiedEmail, requiredLevel) {
    if (!levels.includes(requiredLevel)) return false;
    try {
      const row = db.query('SELECT security_level,active FROM security_users WHERE email_hmac=?').get(digest(verifiedEmail));
      return Boolean(row?.active && levels.indexOf(row.security_level) >= levels.indexOf(requiredLevel));
    } catch { return false; }
  }
  return {add, list, edit, importCsv, allowsVerifiedEmail, exportCsv:() => csvExport(list())};
}

const HTML = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Helios | Security registry</title><link rel="stylesheet" href="/editor.css"><script defer src="/editor.js"></script></head><body><main>',
  '<header><p class="eyebrow">HELIOS / LOCAL ADMIN</p><h1>Security registry</h1><p>Assign access levels. Email addresses are HMAC-hashed on this computer and never saved in plaintext by this tool.</p><p class="notice">Local registry only — roles are not yet enforced by the public Helios application. Verify identities before integrating with authentication.</p></header>',
  '<section id="unlock"><h2>Unlock editor</h2><form id="unlock-form" autocomplete="off"><label>Session token <input id="token" type="password" required autocomplete="off"></label><button>Unlock</button></form><p>Use the token printed in your Bun terminal. It stays in this tab’s memory only.</p></section>',
  '<section id="workspace" hidden><div class="toolbar"><span class="pill green">Green · public</span><span class="pill yellow">Yellow · member</span><span class="pill red">Red · admin</span><button id="refresh">Refresh</button><button id="export">Export CSV</button><button id="import">Import CSV edits</button><input hidden id="csv" type="file" accept=".csv,text/csv"><button id="lock">Lock</button></div>',
  '<form id="add" autocomplete="off"><label>Display name<input id="name" required maxlength="120" placeholder="Name" autocomplete="off"></label><label>Email (write only)<input id="email" type="email" required maxlength="254" placeholder="name@example.com" autocomplete="off" spellcheck="false"></label><button>Add green member</button></form>',
  '<div class="scroll"><table><thead><tr><th>Display name</th><th>UUID (copyable)</th><th>Email</th><th>Assigned level</th><th>Active</th><th>Revision</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><p class="hint">CSV contains no email addresses or hashes. It can edit existing rows only. UUIDs are identifiers, not credentials. Save individual edits, or re-import the current CSV.</p></section>',
  '<p id="status" role="status" aria-live="polite"></p></main></body></html>'
].join('\n');
const CSS = 'html{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText;margin:0}main{max-width:1180px;margin:48px auto;padding:0 20px}h1{font-size:36px;letter-spacing:-.04em;margin:0}h2{font-size:19px}.eyebrow{font:12px monospace;letter-spacing:.2em;color:#888}.notice{border-left:3px solid #ca8a04;padding:10px 14px;background:#ca8a0414}section{border:1px solid #8885;border-radius:12px;padding:20px;margin:20px 0}form,.toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:12px;margin:16px 0}label{display:grid;gap:4px;font-size:13px}input,select,button{font:inherit;border:1px solid #8887;border-radius:6px;background:Canvas;color:CanvasText;padding:8px 10px}button{cursor:pointer}button:hover{border-color:#888}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:10px 8px;border-bottom:1px solid #8884}th,.hint{font-size:12px;color:GrayText}.scroll{overflow-x:auto}.pill{border-radius:20px;padding:5px 10px;font-size:12px;font-weight:600}.green{background:#22c55e30;color:#15803d}.yellow{background:#eab30830;color:#a16207}.red{background:#ef444430;color:#dc2626}code{font-size:12px;user-select:all}#status{min-height:24px;overflow-wrap:anywhere}input[type=checkbox]{width:20px;height:20px}';
function editor() {
  const $ = id => document.getElementById(id);
  let token = '', generation = 0;
  const status = message => { $('status').textContent = message; };
  async function api(path, body) {
    const current = generation;
    const res = await fetch(path, {method:body===undefined?'GET':'POST', headers:{Authorization:'Bearer '+token, ...(body===undefined?{}:{'Content-Type':'application/json'})}, ...(body===undefined?{}:{body:JSON.stringify(body)}), cache:'no-store', credentials:'omit'});
    if (current !== generation) throw new Error('Editor locked.');
    if (!res.ok) { const error = await res.json().catch(()=>({})); throw new Error(error.error || 'Request failed.'); }
    return res;
  }
  async function run(work) { try { await work(); } catch(e) { status(e.message); } }
  function cell(row, value) { const td = row.insertCell(); if (typeof value==='string') td.textContent=value; else td.append(value); }
  function render(rows) {
    $('rows').replaceChildren();
    for (const r of rows) {
      const row = $('rows').insertRow();
      const name=document.createElement('input'); name.value=r.name; name.maxLength=120; name.setAttribute('aria-label','Display name');
      const id=document.createElement('code'); id.textContent=r.uuid;
      const level=document.createElement('select'); level.setAttribute('aria-label','Assigned level');
      for (const item of ['green','yellow','red']) { const opt=document.createElement('option'); opt.value=item; opt.textContent=item; level.append(opt); }
      level.value=r.security_level; level.className=level.value; level.onchange=()=>{level.className=level.value;};
      const active=document.createElement('input'); active.type='checkbox'; active.checked=r.active; active.setAttribute('aria-label','Active account');
      const save=document.createElement('button'); save.textContent='Save';
      save.onclick=()=>run(async()=>{
        if (level.value !== r.security_level && !confirm('Change assigned permissions to '+level.value+'?')) return;
        if (active.checked !== r.active && !confirm('Change account status?')) return;
        save.disabled=true;
        try { await api('/api/edit',{uuid:r.uuid,name:name.value,security_level:level.value,active:active.checked,revision:r.revision}); await refresh(); status('Saved.'); } finally {save.disabled=false;}
      });
      cell(row,name); cell(row,id); cell(row,'Hashed'); cell(row,level); cell(row,active); cell(row,String(r.revision)); cell(row,save);
    }
  }
  async function refresh() { const res = await api('/api/users'); const current=generation; const rows=await res.json(); if (current===generation && token) render(rows); }
  $('unlock-form').onsubmit=e=>{e.preventDefault();run(async()=>{generation++;token=$('token').value.trim();$('token').value='';try {await refresh();} catch(e) {token='';throw e;} if(!token)return;$('unlock').hidden=true;$('workspace').hidden=false;status('Unlocked.');});};
  $('lock').onclick=()=>{generation++;token='';$('rows').replaceChildren();$('add').reset();$('workspace').hidden=true;$('unlock').hidden=false;status('Locked.');};
  $('refresh').onclick=()=>run(async()=>{await refresh();status('Refreshed.');});
  $('add').onsubmit=e=>{e.preventDefault();const name=$('name').value,email=$('email').value;$('email').value='';run(async()=>{await api('/api/add',{name,email});$('name').value='';await refresh();status('Member added as green.');});};
  $('export').onclick=()=>run(async()=>{const res=await api('/api/export');const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='helios-security.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Exported without email addresses or hashes.');});
  $('import').onclick=()=>{$('csv').click();};
  $('csv').onchange=()=>{const file=$('csv').files[0];$('csv').value='';if(!file)return;run(async()=>{if(file.size>500000)throw new Error('CSV is too large.');if(!confirm('Apply changes to existing users, including roles and suspension status? Never import plaintext emails.'))return;await api('/api/import',{csv:await file.text()});await refresh();status('CSV changes applied.');});};
}

export function makeHandler(registry, token, origin) {
  const host = new URL(origin).host;
  const secret = Buffer.from('Bearer '+token);
  const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  const reply = (body,status=200,type='application/json; charset=utf-8') => new Response(type.startsWith('application/json')?JSON.stringify(body):body,{status,headers:{...headers,'Content-Type':type}});
  return async req => {
    const url = new URL(req.url);
    if (req.headers.get('host') !== host || url.origin !== origin) return reply({error:'Invalid host.'},403);
    if (req.method === 'GET' && url.pathname === '/') return reply(HTML,200,'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/editor.css') return reply(CSS,200,'text/css; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/editor.js') return reply('('+editor.toString()+')();',200,'text/javascript; charset=utf-8');
    const supplied = Buffer.from(req.headers.get('authorization') || '');
    if (supplied.length !== secret.length || !timingSafeEqual(supplied,secret)) return reply({error:'Unlock with the terminal session token.'},401);
    try {
      if (req.method==='GET' && url.pathname==='/api/users') return reply(registry.list());
      if (req.method==='GET' && url.pathname==='/api/export') return reply(registry.exportCsv(),200,'text/csv; charset=utf-8');
      if (req.method!=='POST') return reply({error:'Not found.'},404);
      if (req.headers.get('origin')!==origin || !/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||'')) return reply({error:'Invalid request origin or type.'},403);
      let body;
      try { body = await req.json(); } catch { return reply({error:'Invalid JSON.'},400); }
      check(body && typeof body==='object' && !Array.isArray(body),'Invalid request.');
      if (url.pathname==='/api/add') return reply(registry.add(body.name,body.email),201);
      if (url.pathname==='/api/edit') return reply(registry.edit(body));
      if (url.pathname==='/api/import') return reply({updated:registry.importCsv(body.csv).length});
      return reply({error:'Not found.'},404);
    } catch(e) {
      // Never log raw request bodies, emails, SQL errors or input values.
      return reply({error:e instanceof InputError?e.message:'Registry operation failed.'},e instanceof InputError?400:500);
    }
  };
}

if (import.meta.main) {
  const key = parseKey(process.env.EMAIL_HASH_SECRET);
  process.umask(0o077);
  const directory = join(import.meta.dir, '..', '.data', 'security');
  mkdirSync(directory,{recursive:true,mode:0o700});
  chmodSync(directory,0o700);
  const path = join(directory,'registry.sqlite');
  const db = new Database(path,{create:true});
  chmodSync(path,0o600);
  const registry = createRegistry(db,key);
  const port = 8766;
  const origin = 'http://127.0.0.1:'+port;
  const token = randomBytes(32).toString('base64url');
  Bun.serve({hostname:'127.0.0.1',port,maxRequestBodySize:1048576,fetch:makeHandler(registry,token,origin)});
  console.log('Helios private security registry: '+origin);
  console.log('Local session token (do not share): '+token);
  console.log('Only run on a trusted local computer. Ctrl+C to stop.');
}
