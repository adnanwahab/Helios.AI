// /blogs: write a Helios line, add your blog, and see where the blogs stand.
// The line builder and checker work without the API; the board and the
// "add your blog" forms need the shared database (see docs/blogroll.md).
import {FREE_WEED, LAW_IDS, POSITIONS, formatHeliosLine, lawCode, lawId, parseHeliosLines} from './blogroll-line.js';
import {cannabisDraft} from './cannabis-budget.js';

const $ = id => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const fmt = n => new Intl.NumberFormat('en-US').format(n);
const LABEL = {support: 'Support', oppose: 'Oppose', unsure: 'Unsure', withdraw: 'Withdraw'};
const titles = new Map([[FREE_WEED, cannabisDraft.title]]);
const title = id => titles.get(id) || id;
const choices = new Map();
const MAX_IMPORT = 2000, CHUNK = 200, FIRST_ROWS = 12;
let board = null, available = false, writable = false, csrf = null, showAll = false;

const safeHref = url => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);
function link(url, text) {
  const href = safeHref(url);
  if (!href) return el('span', text);
  const a = el('a', text);
  a.href = href;
  a.rel = 'noopener nofollow ugc';
  a.target = '_blank';
  return a;
}
const rtf = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
function ago(iso) {
  if (!iso) return 'never';
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
const chip = (position, text) => { const c = el('li', text, 'chip'); c.dataset.position = position; return c; };

// ---------- Step 1: the line builder ----------
function fillPick(container, id) {
  container.replaceChildren();
  container.dataset.law = id;
  const law = el('div', null, 'law');
  law.append(el('span', lawCode(id), 'code'), el('span', title(id), 'title'));
  const group = el('div', null, 'positions');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Position on ' + title(id));
  for (const position of POSITIONS) {
    const button = el('button', LABEL[position]);
    button.type = 'button';
    button.dataset.position = position;
    button.setAttribute('aria-pressed', String(choices.get(id) === position));
    button.addEventListener('click', () => {
      if (choices.get(id) === position) choices.delete(id); else choices.set(id, position);
      syncChoices();
    });
    group.append(button);
  }
  container.append(law, group);
}

function renderPicker() {
  fillPick($('featured-pick'), FREE_WEED);
  const list = $('law-picker');
  list.replaceChildren(...LAW_IDS.slice(1).map(id => { const li = el('li', null, 'pick'); fillPick(li, id); return li; }));
  filterPicker();
}

function filterPicker() {
  const query = $('law-search').value.trim().toLowerCase();
  const asId = lawId(query.replace(/\s+/g, ''));
  for (const row of $('law-picker').children) {
    const id = row.dataset.law;
    row.hidden = Boolean(query) && !(asId === id || id.toLowerCase().includes(query) || title(id).toLowerCase().includes(query));
  }
}

function syncChoices() {
  for (const button of document.querySelectorAll('.pick button[data-position]')) {
    const id = button.closest('[data-law]').dataset.law;
    button.setAttribute('aria-pressed', String(choices.get(id) === button.dataset.position));
  }
  const text = formatHeliosLine([...choices]);
  const out = $('line-output');
  out.textContent = text || 'Choose a position to write your line.';
  out.toggleAttribute('data-empty', !text);
  $('copy-line').disabled = !text;
  $('copy-line').textContent = 'Copy line';
  const params = new URLSearchParams(location.search);
  for (const position of POSITIONS) {
    const ids = [...choices].filter(([, p]) => p === position).map(([id]) => lawCode(id));
    if (ids.length) params.set(position, ids.join(',')); else params.delete(position);
  }
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
}

function choicesFromUrl() {
  const params = new URLSearchParams(location.search);
  for (const position of POSITIONS) {
    for (const code of (params.get(position) || '').split(',')) {
      const id = lawId(code.trim());
      if (id) choices.set(id, position);
    }
  }
}

async function copyLine() {
  const text = formatHeliosLine([...choices]);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $('copy-line').textContent = 'Copied ✓';
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('line-output'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    $('copy-line').textContent = 'Selected — press Ctrl+C';
  }
}

function checkPost() {
  const {entries, ignored} = parseHeliosLines($('check-text').value);
  const out = $('check-result');
  out.replaceChildren();
  if (!$('check-text').value.trim()) return;
  if (!entries.length) out.append(el('li', 'No vote found. A line starts with “Helios:”, then a position (support, oppose, unsure or withdraw) and the law IDs.', 'note-line'));
  for (const {law, position} of entries) {
    out.append(chip(position, law === '*' ? 'Withdraw all earlier votes' : `${LABEL[position]} ${lawCode(law)} · ${title(law)}`));
  }
  if (ignored.length) out.append(el('li', 'Skipped (not a law ID, or no position before it): ' + ignored.join(', '), 'note-line'));
  out.append(el('li', 'Lines inside quotes or code blocks are ignored when Helios reads your feed.', 'note-line'));
}

// ---------- API ----------
async function request(path, options = {}) {
  const response = await fetch(path, {credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25000), ...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Helios answered ${response.status}.`), {status: response.status});
  return data;
}

async function addBlogs(urls, retry = true) {
  csrf ??= (await request('/api/session')).csrfToken;
  try {
    return await request('/api/blogroll/blogs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID()},
      body: JSON.stringify({urls}),
    });
  } catch (error) {
    if (error.status === 403 && retry) { csrf = null; return addBlogs(urls, false); }
    throw error;
  }
}

function banner(text, tone = null) {
  const node = $('backend-status');
  node.textContent = text;
  node.hidden = !text;
  if (tone) node.dataset.tone = tone; else delete node.dataset.tone;
}

async function loadBoard() {
  try {
    board = await request('/api/blogroll');
    available = true;
    writable = board.writable === true;
    if (writable) banner('');
    else banner('This copy of Helios shows the blogroll but does not take new blogs. Your Helios line still works everywhere.', 'warn');
  } catch {
    board = null;
    available = false;
    writable = false;
    banner('Blog votes are not available on this deployment right now. You can still write and check your Helios line.', 'warn');
  }
  for (const id of ['blog-url', 'add-submit', 'import-text', 'import-file', 'import-submit']) $(id).disabled = !writable;
  renderStats();
  renderBoard();
  renderRoll();
  renderMine();
}

// ---------- Step 2: adding blogs ----------
function showResult(tone, heading, ...parts) {
  const box = $('add-result');
  box.hidden = false;
  box.dataset.tone = tone;
  box.replaceChildren(el('h3', heading), ...parts.filter(Boolean));
}

function votesList(votes) {
  const list = el('ul', null, 'chips');
  for (const {law, position} of votes) list.append(chip(position, `${LABEL[position]} ${lawCode(law)}`));
  return list;
}

function readAgainButton(url) {
  const button = el('button', 'Read it again');
  button.type = 'button';
  button.addEventListener('click', () => submitOne(url));
  return button;
}

function showAdded(result, url) {
  if (result.invalid?.length) return showResult('warn', 'Helios can’t use that address', el('p', result.invalid[0].reason));
  const read = result.read, isNew = result.added?.length > 0;
  if (!read) return showResult('ok', 'Added', el('p', 'Helios will read it within 15 minutes.'));
  const name = read.title || read.url || url;
  const known = isNew ? null : el('p', 'This blog was already on the list.', 'muted');
  if (read.status === 'duplicate') return showResult('ok', 'Already on the list', el('p', 'That address belongs to a blog Helios already reads.'));
  if (read.code) {
    return showResult('warn', isNew ? 'Added, but not read yet' : 'Helios couldn’t read it just now', known, el('p', read.error || read.lastError),
      el('p', read.code === 'NO_FEED' ? 'Paste your feed’s address instead (often your address followed by /feed or /rss).' : 'Helios will try again later.'));
  }
  const heading = read.recentlyRead ? 'Read less than a minute ago' : 'Helios read ' + name;
  const found = read.recentlyRead ? null : el('p', `${fmt(read.postsRead ?? read.postsSeen ?? 0)} recent posts read; ${fmt(read.postsWithLines ?? 0)} had a Helios line.`);
  const feedLine = el('p', null);
  feedLine.append('Feed: ', link(read.feedUrl, read.feedUrl || 'unknown'));
  if (!read.votes.length) {
    return showResult('ok', heading, known, found, feedLine,
      el('p', 'No votes yet. Add your line from step 1 to a post, publish it, then press Read it again.'), readAgainButton(read.url || url));
  }
  return showResult('ok', heading, known, found, feedLine, el('p', `Your blog's ${read.votes.length === 1 ? 'vote' : 'votes'}:`), votesList(read.votes), readAgainButton(read.url || url));
}

async function submitOne(url) {
  $('add-submit').disabled = true;
  showResult('ok', 'Reading ' + url + '…');
  try {
    showAdded(await addBlogs([url]), url);
  } catch (error) {
    showResult('warn', 'Helios could not add that blog', el('p', error.message));
  } finally {
    $('add-submit').disabled = !writable;
  }
  await loadBoard();
}

const decodeXml = text => text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, name) => ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'"}[name]));
export function addressesFrom(text) {
  const source = String(text || '');
  const found = /<opml[\s>]/i.test(source)
    ? [...source.matchAll(/xmlUrl\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m => decodeXml(m[1] ?? m[2]).trim())
    : source.split(/[\s,;]+/).map(s => s.trim().replace(/^[<(]+|[>).]+$/g, '')).filter(s => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(s));
  return [...new Set(found.filter(Boolean))];
}

async function importList() {
  const all = addressesFrom($('import-text').value);
  const status = $('import-status');
  if (!all.length) { status.textContent = 'No blog addresses found. Put one address on each line.'; return; }
  const urls = all.slice(0, MAX_IMPORT);
  $('import-submit').disabled = true;
  const totals = {added: 0, existing: 0, invalid: []};
  try {
    for (let i = 0; i < urls.length; i += CHUNK) {
      status.textContent = `Adding ${fmt(Math.min(i + CHUNK, urls.length))} of ${fmt(urls.length)}…`;
      const result = await addBlogs(urls.slice(i, i + CHUNK));
      totals.added += result.added.length;
      totals.existing += result.existing.length;
      totals.invalid.push(...result.invalid);
    }
    const skipped = totals.invalid.length ? ` ${fmt(totals.invalid.length)} could not be used (for example ${totals.invalid[0].url}: ${totals.invalid[0].reason})` : '';
    const capped = all.length > MAX_IMPORT ? ` Only the first ${fmt(MAX_IMPORT)} addresses were sent; add the rest in another batch.` : '';
    status.textContent = `Added ${fmt(totals.added)} new ${totals.added === 1 ? 'blog' : 'blogs'}; ${fmt(totals.existing)} already on the list.${skipped}${capped} Helios reads new blogs within 15 minutes. Each one appears on the list once its author writes a Helios line.`;
  } catch (error) {
    status.textContent = `Stopped after ${fmt(totals.added)} added: ${error.message}`;
  } finally {
    $('import-submit').disabled = !writable;
  }
  await loadBoard();
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) { $('import-status').textContent = 'That file is larger than 2 MB.'; return; }
  const urls = addressesFrom(await file.text());
  $('import-text').value = urls.join('\n');
  $('import-status').textContent = urls.length ? `Found ${fmt(urls.length)} feeds in ${file.name}. Review them, then press Add list.` : `No feeds found in ${file.name}.`;
}

function renderMine() {
  const mine = board?.mine || [];
  $('mine').hidden = !mine.length;
  $('mine-list').replaceChildren(...mine.map(blog => {
    const li = el('li');
    const what = el('div', null, 'what');
    const state = el('span', {ok: 'Reading', queued: 'Waiting', failing: 'Can’t read', duplicate: 'Duplicate', hidden: 'Hidden'}[blog.status] || blog.status, 'state');
    state.dataset.status = blog.status;
    what.append(link(blog.siteUrl || blog.url, blog.title || blog.url), ' ', state);
    const detail = blog.lastError ? blog.lastError
      : blog.status === 'duplicate' ? 'Already on the list under another address.'
      : blog.lastReadAt ? `${fmt(blog.votes)} ${blog.votes === 1 ? 'vote' : 'votes'} · read ${ago(blog.lastReadAt)}` : 'Waiting for its first read.';
    what.append(el('small', detail));
    const button = el('button', 'Read now');
    button.type = 'button';
    button.disabled = !writable || blog.status === 'duplicate';
    button.addEventListener('click', () => { $('blog-url').value = blog.url; submitOne(blog.url); });
    li.append(what, button);
    return li;
  }));
}

// ---------- The board ----------
const counts = id => board?.laws?.[id] || {support: 0, oppose: 0, unsure: 0, voices: []};
const total = c => c.support + c.oppose + c.unsure;

function bar(c) {
  const node = el('div', null, 'bar');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${c.support} support, ${c.oppose} oppose, ${c.unsure} unsure`);
  const sum = total(c) || 1;
  for (const position of POSITIONS) {
    const part = el('i', null, position);
    part.style.width = (100 * c[position] / sum) + '%';
    node.append(part);
  }
  return node;
}

function voicesList(c) {
  if (!c.voices.length) return el('p', available ? 'No blog has voted on this yet.' : 'Blog votes are not available here.', 'empty');
  const list = el('ul', null, 'voices');
  for (const voice of c.voices) {
    const li = el('li');
    const tag = el('span', LABEL[voice.position], 'chip');
    tag.dataset.position = voice.position;
    li.append(tag, link(voice.blog.siteUrl, voice.blog.title || voice.blog.siteUrl || 'A blog'));
    if (voice.post?.url) li.append(' · ', link(voice.post.url, voice.post.title || 'the post'));
    li.append(el('span', ' · ' + ago(voice.castAt), 'muted'));
    list.append(li);
  }
  if (total(c) > c.voices.length) list.append(el('li', `and ${fmt(total(c) - c.voices.length)} more`, 'muted'));
  return list;
}

function writeButton(id) {
  const button = el('button', 'Write a line for this law');
  button.type = 'button';
  button.addEventListener('click', () => {
    if (!choices.has(id)) choices.set(id, 'support');
    syncChoices();
    $('law-search').value = id === FREE_WEED ? '' : lawCode(id);
    filterPicker();
    $('write').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  return button;
}

function countsLine(c) {
  const line = el('div', null, 'counts');
  for (const position of POSITIONS) {
    const span = el('span', null, position);
    span.append(el('strong', available ? fmt(c[position]) : '—'), LABEL[position].toLowerCase());
    line.append(span);
  }
  return line;
}

function renderBoard() {
  const featured = $('featured-law');
  const c = counts(FREE_WEED);
  const support = el('button', 'Support it from your blog', 'primary');
  support.type = 'button';
  support.addEventListener('click', () => { choices.set(FREE_WEED, 'support'); syncChoices(); $('write').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  featured.replaceChildren(el('p', 'Featured · ' + lawCode(FREE_WEED), 'eyebrow'), Object.assign(el('h3', title(FREE_WEED)), {id: 'featured-title'}),
    el('p', cannabisDraft.sharedGoal, 'muted small'), countsLine(c), bar(c), voicesList(c), support);

  const query = $('board-search').value.trim().toLowerCase();
  const asId = lawId(query.replace(/\s+/g, ''));
  const sort = $('board-sort').value;
  const ids = LAW_IDS.slice(1).filter(id => !query || asId === id || id.toLowerCase().includes(query) || title(id).toLowerCase().includes(query));
  const number = id => Number(id.slice(4));
  ids.sort((a, b) => sort === 'id' ? number(a) - number(b)
    : sort === 'votes' ? total(counts(b)) - total(counts(a)) || number(a) - number(b)
    : counts(b).support - counts(a).support || total(counts(b)) - total(counts(a)) || number(a) - number(b));
  const shown = query || showAll ? ids : ids.slice(0, FIRST_ROWS);
  $('board-more').hidden = Boolean(query) || ids.length <= FIRST_ROWS;
  $('board-more').textContent = showAll ? 'Show fewer laws' : `Show all ${ids.length} laws`;
  $('law-board').replaceChildren(...shown.map(id => {
    const row = counts(id);
    const li = el('li');
    li.dataset.law = id;
    const details = el('details');
    const summary = el('summary');
    summary.append(el('span', id, 'id'), el('span', title(id), 'name'), bar(row),
      el('span', !available ? '—' : total(row) ? `${fmt(row.support)} for · ${fmt(row.oppose)} against${row.unsure ? ` · ${fmt(row.unsure)} unsure` : ''}` : 'No blog votes yet', 'tally'));
    const open = el('div', null, 'open');
    open.append(voicesList(row), writeButton(id));
    details.append(summary, open);
    li.append(details);
    return li;
  }));
  if (!ids.length) $('law-board').append(el('li', 'No law matches that search.', 'empty'));
}

function renderRoll() {
  const blogs = board?.blogs || [];
  const list = $('blog-list');
  if (!blogs.length) {
    list.replaceChildren(el('li', available ? 'No blog has voted yet. Write a Helios line and add your blog above.' : 'The list of blogs is not available here.', 'empty'));
    return;
  }
  list.replaceChildren(...blogs.map(blog => {
    const li = el('li');
    li.append(link(blog.siteUrl, blog.title || blog.siteUrl),
      el('small', `${fmt(blog.votes)} ${blog.votes === 1 ? 'vote' : 'votes'} · ${fmt(blog.support)} for · ${fmt(blog.oppose)} against${blog.unsure ? ` · ${fmt(blog.unsure)} unsure` : ''}`),
      el('small', 'Last vote ' + ago(blog.lastVoteAt)));
    return li;
  }));
}

function renderStats() {
  const s = board?.stats;
  $('stat-voting').textContent = s ? fmt(s.voting) : '—';
  $('stat-votes').textContent = s ? fmt(s.votes) : '—';
  $('stat-watching').textContent = s ? fmt(s.watching) : '—';
  $('stat-read').textContent = s ? (s.lastReadAt ? ago(s.lastReadAt) : 'Not yet') : '—';
}

async function loadTitles() {
  try {
    const response = await fetch('/public/law-catalog.json', {cache: 'force-cache'});
    if (!response.ok) throw Error('Catalog unavailable');
    for (const goal of (await response.json()).goals) titles.set(goal.id, goal.title);
  } catch {
    // IDs still work without titles.
  }
}

function start() {
  choicesFromUrl();
  renderPicker();
  syncChoices();
  renderBoard();
  $('law-search').addEventListener('input', filterPicker);
  $('copy-line').addEventListener('click', copyLine);
  let timer;
  $('check-text').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(checkPost, 120); });
  $('add-form').addEventListener('submit', event => {
    event.preventDefault();
    const url = $('blog-url').value.trim();
    if (!url) { showResult('warn', 'Enter your blog’s address', el('p', 'For example yourname.substack.com or the address of your feed.')); return; }
    submitOne(url);
  });
  $('import-submit').addEventListener('click', importList);
  $('import-file').addEventListener('change', importFile);
  $('board-search').addEventListener('input', renderBoard);
  $('board-sort').addEventListener('change', renderBoard);
  $('board-more').addEventListener('click', () => { showAll = !showAll; renderBoard(); });
  loadTitles().then(() => { renderPicker(); syncChoices(); renderBoard(); checkPost(); });
  loadBoard();
}

if (typeof document !== 'undefined') start();
