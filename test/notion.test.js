import {test, expect} from 'bun:test';
import seedCatalog from '../data/catalog.json' with {type: 'json'};
import {buildPlanDocument, fromNotionBlock, normalizeId, toNotionBlock} from '../src/notion.js';
import {setup} from './helpers.js';

const PARENT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_PAGE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const env = (extra = {}) => ({NOTION_TOKEN: 'secret_test', NOTION_PARENT_PAGE_ID: `https://www.notion.so/Helios-${PARENT}`, ...extra});

// A tiny in-memory Notion: records writes, serves a page with a nested toggle.
function fakeNotion() {
  const calls = [];
  const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
  const fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({method: init.method, path: u.pathname, body, auth: init.headers.authorization, version: init.headers['notion-version']});
    if (init.method === 'POST' && u.pathname === '/v1/pages') return json({id: NEW_PAGE, url: 'https://www.notion.so/helios-plan'});
    if (init.method === 'PATCH') return json({results: []});
    if (u.pathname.startsWith('/v1/pages/')) return json({url: 'https://www.notion.so/helios-plan', last_edited_time: '2026-11-22T00:00:00.000Z', icon: {type: 'emoji', emoji: '☀️'},
      properties: {title: {type: 'title', title: [{plain_text: 'Edited in Notion'}]}, Status: {type: 'select', select: {name: 'Voting'}}}});
    if (u.pathname === `/v1/blocks/${NEW_PAGE.replace(/-/g, '')}/children`) return json({has_more: false, results: [
      {id: 't1', type: 'toggle', has_children: true, toggle: {rich_text: [{plain_text: 'Bus stop', annotations: {bold: true}}]}},
      {id: 'd1', type: 'divider', has_children: false, divider: {}},
    ]});
    if (u.pathname === '/v1/blocks/t1/children') return json({has_more: false, results: [{id: 'p1', type: 'paragraph', has_children: false, paragraph: {rich_text: [{plain_text: 'Near my house', href: 'https://example.org'}]}}]});
    return json({message: 'not found', code: 'object_not_found'}, 404);
  };
  return {fetch, calls};
}

test('builds a plan document with every goal, grouped by category', () => {
  const doc = buildPlanDocument(seedCatalog, {generatedAt: '2026-11-22T00:00:00Z'});
  const toggles = JSON.stringify(doc.blocks).match(/"HGA-\d{3}"/g);
  expect(new Set(toggles).size).toBe(100);
  expect(doc.blocks.filter(b => b.type === 'heading_2')).toHaveLength(seedCatalog.categories.length);
  expect(doc.properties.Goals).toBe('100');
});

test('converts blocks to and from the Notion API shape', () => {
  const api = toNotionBlock({type: 'callout', icon: '🛡️', color: 'orange_background', rich: [{text: 'x'.repeat(4500), bold: true}]});
  expect(api.callout.rich_text).toHaveLength(3);
  expect(api.callout.rich_text[0].annotations.bold).toBe(true);
  expect(api.callout.icon).toEqual({type: 'emoji', emoji: '🛡️'});
  const back = fromNotionBlock({id: '1', type: 'heading_2', heading_2: {is_toggleable: true, rich_text: [{plain_text: 'Hi', annotations: {italic: true, color: 'red'}}]}});
  expect(back).toEqual({id: '1', type: 'heading_2', toggleable: true, rich: [{text: 'Hi', italic: true, color: 'red'}]});
  expect(normalizeId('https://www.notion.so/My-Page-0123456789abcdef0123456789ABCDEF?pvs=4')).toBe('0123456789abcdef0123456789abcdef');
});

test('without Notion configured, the preview comes from the catalog', async () => {
  const rt = await setup({env: {}});
  try {
    const r = await rt.app(new Request('http://localhost/api/notion/preview'));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.document.source).toBe('catalog');
    expect(body.notion.configured).toBe(false);
  } finally { await rt.store.close(); }
});

test('publishes in batches of 100, then serves the page read back from Notion', async () => {
  const notion = fakeNotion();
  const rt = await setup({env: env(), notionFetch: notion.fetch});
  try {
    const denied = await rt.app(new Request('http://localhost/api/notion/publish', {method: 'POST'}));
    expect(denied.status).toBe(403);

    const r = await rt.app(new Request('http://localhost/api/notion/publish', {method: 'POST', headers: {authorization: 'Bearer test-admin'}}));
    expect(r.status).toBe(201);
    const create = notion.calls.find(c => c.method === 'POST');
    expect(create.body.parent.page_id).toBe(PARENT);
    expect(create.body.children.length).toBeLessThanOrEqual(100);
    expect(create.auth).toBe('Bearer secret_test');
    expect(create.version).toBe('2022-06-28');
    const appended = notion.calls.filter(c => c.method === 'PATCH').reduce((n, c) => n + c.body.children.length, 0);
    expect(create.body.children.length + appended).toBe((await r.json()).blocks);

    const preview = await (await rt.app(new Request('http://localhost/api/notion/preview'))).json();
    expect(preview.document.source).toBe('notion');
    expect(preview.document.title).toBe('Edited in Notion');
    expect(preview.document.properties.Status).toBe('Voting');
    expect(preview.document.blocks[0].children[0].rich[0].href).toBe('https://example.org');
  } finally { await rt.store.close(); }
});

test('falls back to the catalog preview when Notion errors', async () => {
  const notion = fakeNotion();
  const rt = await setup({env: env({NOTION_PAGE_ID: 'cccccccccccccccccccccccccccccccc'}), notionFetch: notion.fetch});
  try {
    const body = await (await rt.app(new Request('http://localhost/api/notion/preview'))).json();
    expect(body.document.source).toBe('catalog');
    expect(body.notion.warning).toContain('object_not_found');
  } finally { await rt.store.close(); }
});
