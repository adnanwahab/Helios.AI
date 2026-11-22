// Notion integration for the "Plan in Notion" screen.
//
// Three jobs:
//   1. buildPlanDocument(catalog)  – turns the live Helios catalog into a Notion-shaped document
//      (the same shape the screen renders, so it works with or without Notion).
//   2. publish(doc)                – creates that document as a real Notion page (Notion API v1).
//   3. fetchDocument(pageId)       – reads a Notion page back (recursively) so the screen shows
//      whatever people have since edited in Notion.
//
// Documents use one small normalized block format in both directions:
//   {type, rich: [{text, bold, italic, strike, underline, code, color, href}], children?, checked?, icon?, color?, language?, url?, cells?}

export const NOTION_VERSION = '2022-06-28';
const API = 'https://api.notion.com/v1';
const MAX_TEXT = 2000;        // Notion rich_text content limit
const MAX_CHILDREN = 100;     // Notion children-per-request limit
const MAX_FETCHES = 80;       // keep one read inside a serverless function's time budget

export function notionConfig(env = process.env) {
  const clean = v => (v || '').trim() || null;
  return {
    token: clean(env.NOTION_TOKEN || env.NOTION_API_KEY),
    pageId: normalizeId(clean(env.NOTION_PAGE_ID)),
    parentPageId: normalizeId(clean(env.NOTION_PARENT_PAGE_ID)),
    cacheMs: Number(env.NOTION_CACHE_MS || 60000),
  };
}

// Accepts a bare id, a dashed uuid or a full notion.so URL and returns the 32-hex id.
export function normalizeId(value) {
  if (!value) return null;
  const m = String(value).replace(/-/g, '').match(/([0-9a-f]{32})(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : null;
}

// ---------- rich text helpers ----------
export const rt = (text, ann = {}) => (text ? [{text: String(text), ...ann}] : []);
const join = (...parts) => parts.flat().filter(Boolean);
const plain = rich => (rich || []).map(r => r.text).join('');

const block = (type, rich, extra = {}) => ({type, rich, ...extra});
const p = (...rich) => block('paragraph', join(...rich));
const h1 = text => block('heading_1', rt(text));
const h2 = text => block('heading_2', rt(text));
const h3 = text => block('heading_3', rt(text));
const bullet = (...rich) => block('bulleted_list_item', join(...rich));
const numbered = (...rich) => block('numbered_list_item', join(...rich));
const todo = (text, checked = false) => block('to_do', rt(text), {checked});
const toggle = (rich, children) => block('toggle', rich, {children});
const callout = (icon, rich, color = 'gray_background', children) => block('callout', rich, {icon, color, ...(children ? {children} : {})});
const quote = (...rich) => block('quote', join(...rich));
const divider = () => ({type: 'divider', rich: []});

const humanize = s => (s || '').replace(/_/g, ' ');
const categoryIcon = ['💸', '🏡', '🩺', '📚', '⏳', '🤝', '⚖️', '🗳️', '🤖', '🌍'];

// ---------- 1. the Helios plan as a document ----------
export function buildPlanDocument(catalog, {generatedAt = new Date().toISOString()} = {}) {
  const goals = catalog.goals || [];
  const categories = catalog.categories || [];
  const moonshots = catalog.moonshots || [];
  const meta = catalog.metadata || {};
  const community = goals.filter(g => !/^HGA-/.test(g.id));
  const amended = goals.filter(g => (g.version || 1) > 1);

  const blocks = [
    callout('☀️', join(
      rt('Preview. ', {bold: true}),
      rt('This is the Helios plan as a single shared document. Every goal below comes from what people wrote in their journals. '),
      rt('None of it is law', {bold: true}),
      rt(' — Helios drafts and revises, people vote, and nothing becomes the plan without their approval.'),
    ), 'yellow_background'),
    p(rt('Collection: '), rt(meta.title || '100 Shared Goals', {bold: true}), rt(` · v${meta.version ?? 1} · ${meta.date || ''}`, {color: 'gray'})),
    divider(),

    h1('How Helios works'),
    numbered(rt('Journal', {bold: true}), rt(' — anyone writes what they need, in their own words.')),
    numbered(rt('Needs', {bold: true}), rt(' — Helios groups what people share (safer crossings, later clinic hours).')),
    numbered(rt('Draft', {bold: true}), rt(' — every line of the plan links back to the needs behind it.')),
    numbered(rt('Vote', {bold: true}), rt(' — people approve, amend or reject. Accepted amendments become new versions.')),
    numbered(rt('Patch', {bold: true}), rt(' — weekly, the approved changes are published as the next version of this page.')),

    h1('At a glance'),
    bullet(rt(String(goals.length), {bold: true}), rt(' shared goals across '), rt(String(categories.length), {bold: true}), rt(' areas of life')),
    bullet(rt(String(moonshots.length), {bold: true}), rt(' moonshots')),
    bullet(rt(String(community.length), {bold: true}), rt(' community proposals added since the seed collection')),
    bullet(rt(String(amended.length), {bold: true}), rt(' goals amended by accepted community revisions')),
  ];

  if (moonshots.length) {
    blocks.push(h1('🚀 Moonshots'));
    for (const m of moonshots) {
      blocks.push(toggle(join(rt(m.id, {code: true}), rt(' '), rt(m.title, {bold: true})), [
        p(rt(m.summary)),
        p(rt('Status: ', {color: 'gray'}), rt(humanize(m.status), {italic: true, color: 'gray'})),
      ]));
    }
  }

  blocks.push(h1('🎯 Shared goals'));
  categories.forEach((category, i) => {
    const inCategory = goals.filter(g => g.category === category);
    if (!inCategory.length) return;
    blocks.push(h2(`${categoryIcon[i] || '•'} ${category}`));
    blocks.push(p(rt(`${inCategory.length} goal${inCategory.length === 1 ? '' : 's'}`, {color: 'gray'})));
    for (const g of inCategory) blocks.push(goalToggle(g));
  });

  blocks.push(divider());
  blocks.push(h1('✅ Before this becomes a plan'));
  blocks.push(todo('Human review of every goal', false));
  blocks.push(todo('Open public voting', false));
  blocks.push(todo('Publish weekly patch notes', false));
  blocks.push(quote(rt('“Maybe everyone should have the right to ask why?”', {italic: true}), rt(' — a Helios journal')));
  blocks.push(p(rt(`Generated by Helios · ${generatedAt.slice(0, 10)}`, {color: 'gray'})));

  return {
    title: 'Helios Plan — Preview',
    icon: '☀️',
    cover: null,
    source: 'catalog',
    url: null,
    lastEdited: generatedAt,
    properties: {
      Status: 'Editorial draft · not law',
      Goals: String(goals.length),
      Moonshots: String(moonshots.length),
      'Community proposals': String(community.length),
    },
    blocks,
  };
}

function goalToggle(g) {
  const children = [
    p(rt(g.sharedGoal)),
    callout('🏘️', join(rt('Local option: ', {bold: true}), rt(g.illustrativeLocalOption)), 'blue_background'),
    callout('🛡️', join(rt('Risks & safeguards: ', {bold: true}), rt(g.risksAndSafeguards)), 'orange_background'),
  ];
  if (g.suggestedMeasures?.length) {
    children.push(p(rt('How we would measure it', {bold: true})));
    for (const m of g.suggestedMeasures) children.push(bullet(rt(m)));
  }
  const status = [g.sourceProposalTitle && `from “${g.sourceProposalTitle}”`, `v${g.version || g.initialVersion || 1}`, humanize(g.reviewStatus)].filter(Boolean).join(' · ');
  children.push(p(rt(status, {color: 'gray', italic: true})));
  return toggle(join(rt(g.id, {code: true}), rt(' '), rt(g.title, {bold: true})), children);
}

// ---------- 2. normalized → Notion API ----------
function toRichText(rich) {
  const out = [];
  for (const r of rich || []) {
    // Notion caps each text object at 2000 characters; split long runs.
    for (let i = 0; i < Math.max(1, r.text.length); i += MAX_TEXT) {
      const content = r.text.slice(i, i + MAX_TEXT);
      out.push({
        type: 'text',
        text: {content, ...(r.href ? {link: {url: r.href}} : {})},
        annotations: {bold: !!r.bold, italic: !!r.italic, strikethrough: !!r.strike, underline: !!r.underline, code: !!r.code, color: r.color || 'default'},
      });
    }
  }
  return out.slice(0, 100);
}

export function toNotionBlock(b, depth = 0) {
  const type = b.type;
  if (type === 'divider') return {object: 'block', type, divider: {}};
  const body = {rich_text: toRichText(b.rich)};
  if (type === 'to_do') body.checked = !!b.checked;
  if (type === 'callout') { body.icon = {type: 'emoji', emoji: b.icon || '💡'}; body.color = b.color || 'default'; }
  if (type === 'code') body.language = b.language || 'plain text';
  // A single Notion request accepts two levels of nesting; deeper children are dropped.
  if (b.children?.length && depth < 1 && type !== 'code') body.children = b.children.map(c => toNotionBlock(c, depth + 1));
  return {object: 'block', type, [type]: body};
}

// ---------- 3. Notion API → normalized ----------
function fromRichText(items = []) {
  return items.map(r => ({
    text: r.plain_text ?? r.text?.content ?? '',
    ...(r.annotations?.bold ? {bold: true} : {}),
    ...(r.annotations?.italic ? {italic: true} : {}),
    ...(r.annotations?.strikethrough ? {strike: true} : {}),
    ...(r.annotations?.underline ? {underline: true} : {}),
    ...(r.annotations?.code ? {code: true} : {}),
    ...(r.annotations?.color && r.annotations.color !== 'default' ? {color: r.annotations.color} : {}),
    ...(r.href ? {href: r.href} : {}),
  }));
}

const fileUrl = f => f?.type === 'external' ? f.external?.url : f?.file?.url;
const iconOf = icon => icon?.type === 'emoji' ? icon.emoji : null;

export function fromNotionBlock(raw) {
  const type = raw.type, data = raw[type] || {};
  const base = {id: raw.id, type};
  switch (type) {
    case 'paragraph': case 'quote': case 'bulleted_list_item': case 'numbered_list_item': case 'toggle':
      return {...base, rich: fromRichText(data.rich_text), ...(data.color && data.color !== 'default' ? {color: data.color} : {})};
    case 'heading_1': case 'heading_2': case 'heading_3':
      return {...base, rich: fromRichText(data.rich_text), toggleable: !!data.is_toggleable};
    case 'to_do': return {...base, rich: fromRichText(data.rich_text), checked: !!data.checked};
    case 'callout': return {...base, rich: fromRichText(data.rich_text), icon: iconOf(data.icon) || '💡', color: data.color};
    case 'code': return {...base, rich: fromRichText(data.rich_text), language: data.language};
    case 'divider': return {...base, rich: []};
    case 'image': return {...base, rich: fromRichText(data.caption), url: fileUrl(data)};
    case 'bookmark': case 'embed': case 'link_preview': return {...base, type: 'bookmark', rich: fromRichText(data.caption), url: data.url};
    case 'child_page': return {...base, rich: [{text: data.title}]};
    case 'table': return {...base, rich: [], hasHeader: !!data.has_column_header};
    case 'table_row': return {...base, rich: [], cells: (data.cells || []).map(fromRichText)};
    case 'column_list': case 'column': case 'synced_block': return {...base, rich: []};
    default: return {...base, type: 'unsupported', rich: [{text: `Unsupported Notion block: ${type}`}]};
  }
}

// ---------- HTTP client ----------
export function createNotion({token, fetch: doFetch = globalThis.fetch} = {}) {
  if (!token) return null;
  async function call(method, path, body, attempt = 0) {
    const res = await doFetch(API + path, {
      method,
      headers: {authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION, 'content-type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(5, Number(res.headers.get('retry-after')) || 1);
      await new Promise(r => setTimeout(r, wait * 1000));
      return call(method, path, body, attempt + 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.message || `Notion API ${res.status}`); e.status = res.status; e.code = json.code; throw e; }
    return json;
  }

  async function children(id, budget) {
    const out = []; let cursor;
    do {
      if (budget.left-- <= 0) { budget.truncated = true; break; }
      const page = await call('GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      out.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return out;
  }

  async function tree(id, budget, depth = 0) {
    const raws = await children(id, budget);
    const blocks = raws.map(fromNotionBlock);
    // Fetch nested children a few at a time (Notion allows ~3 requests/second).
    const nested = raws.map((r, i) => [r, blocks[i]]).filter(([r]) => r.has_children && r.type !== 'child_page' && depth < 3);
    for (let i = 0; i < nested.length; i += 3) {
      await Promise.all(nested.slice(i, i + 3).map(async ([r, b]) => { b.children = await tree(r.id, budget, depth + 1); }));
    }
    return blocks;
  }

  return {
    call,
    async fetchDocument(pageId) {
      const budget = {left: MAX_FETCHES, truncated: false};
      const page = await call('GET', `/pages/${pageId}`);
      const props = page.properties || {};
      const titleProp = Object.values(props).find(v => v.type === 'title');
      const properties = {};
      for (const [name, v] of Object.entries(props)) {
        if (v.type === 'title') continue;
        const value = v.type === 'rich_text' ? plain(fromRichText(v.rich_text))
          : v.type === 'select' ? v.select?.name : v.type === 'status' ? v.status?.name
          : v.type === 'multi_select' ? v.multi_select.map(s => s.name).join(', ')
          : v.type === 'number' ? v.number : v.type === 'date' ? v.date?.start
          : v.type === 'checkbox' ? (v.checkbox ? 'Yes' : 'No') : v.type === 'url' ? v.url : null;
        if (value !== null && value !== undefined && value !== '') properties[name] = String(value);
      }
      const blocks = await tree(pageId, budget);
      return {
        title: plain(fromRichText(titleProp?.title)) || 'Untitled',
        icon: iconOf(page.icon), cover: fileUrl(page.cover) || null,
        source: 'notion', url: page.url, lastEdited: page.last_edited_time,
        properties, blocks, truncated: budget.truncated,
      };
    },
    async publish(doc, parentPageId) {
      const all = doc.blocks.map(b => toNotionBlock(b));
      const page = await call('POST', '/pages', {
        parent: {type: 'page_id', page_id: parentPageId},
        icon: doc.icon ? {type: 'emoji', emoji: doc.icon} : undefined,
        properties: {title: {title: toRichText(rt(doc.title))}},
        children: all.slice(0, MAX_CHILDREN),
      });
      for (let i = MAX_CHILDREN; i < all.length; i += MAX_CHILDREN) {
        await call('PATCH', `/blocks/${page.id}/children`, {children: all.slice(i, i + MAX_CHILDREN)});
      }
      return {id: normalizeId(page.id), url: page.url, blocks: all.length};
    },
  };
}

// ---------- service used by the HTTP routes ----------
// Resolves which page to show: NOTION_PAGE_ID, else the page last published (kept in the
// metadata table), else the catalog preview. Notion failures fall back to the preview.
export function createNotionService({store, config = notionConfig(), fetch} = {}) {
  const client = createNotion({token: config.token, fetch});
  let cache = null;

  const meta = async key => (await store.db.query('SELECT value FROM metadata WHERE key = $1', [key])).rows[0]?.value ?? null;
  const setMeta = (key, value) => store.db.query('INSERT INTO metadata(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
  const pageId = async () => config.pageId || normalizeId(await meta('notion_page_id'));

  async function preview({fresh = false} = {}) {
    const fallback = async warning => ({
      document: buildPlanDocument(await store.catalog()),
      notion: {configured: !!client, canPublish: !!(client && config.parentPageId), pageId: await pageId(), ...(warning ? {warning} : {})},
    });
    const id = client && await pageId();
    if (!id) return fallback(client ? 'No Notion page yet. Publish the plan to create one.' : null);
    if (!fresh && cache && cache.id === id && Date.now() - cache.at < config.cacheMs) return cache.value;
    try {
      const document = await client.fetchDocument(id);
      const value = {document, notion: {configured: true, canPublish: !!config.parentPageId, pageId: id, url: document.url}};
      cache = {id, at: Date.now(), value};
      return value;
    } catch (error) {
      return fallback(`Could not read the Notion page (${error.code || error.status || 'error'}). Showing the local preview.`);
    }
  }

  async function publish() {
    if (!client) throw Object.assign(new Error('Set NOTION_TOKEN to publish to Notion.'), {status: 503});
    if (!config.parentPageId) throw Object.assign(new Error('Set NOTION_PARENT_PAGE_ID (a page shared with your integration).'), {status: 503});
    const doc = buildPlanDocument(await store.catalog());
    const result = await client.publish(doc, config.parentPageId);
    await setMeta('notion_page_id', result.id);
    await setMeta('notion_page_url', result.url);
    cache = null;
    return result;
  }

  return {preview, publish, configured: !!client};
}
