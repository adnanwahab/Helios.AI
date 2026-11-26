import {test, expect} from '@playwright/test';

const voice = (position, blog, post, hours) => ({position, castAt: new Date(Date.now() - hours * 3600000).toISOString(),
  blog: {id: blog.toLowerCase().replace(/\W+/g, '-'), title: blog, siteUrl: `https://${blog.toLowerCase().replace(/\W+/g, '')}.blog/`},
  post: {url: `https://${blog.toLowerCase().replace(/\W+/g, '')}.blog/p/1`, title: post}});
const board = {
  writable: true,
  laws: {
    'DRAFT-CANNABIS': {support: 3, oppose: 1, unsure: 1, voices: [voice('support', 'Riverside Dispatch', 'Why I vote from my blog', 5), voice('oppose', 'Ana Builds', 'Childcare first', 120)]},
    'HGA-031': {support: 4, oppose: 0, unsure: 0, voices: [voice('support', 'Maple Notes', 'Free weed, but make it public health', 30)]},
    'HGA-012': {support: 1, oppose: 2, unsure: 0, voices: [voice('oppose', 'Maple Notes', 'On zoning', 72)]},
  },
  blogs: [
    {id: 'riverside', title: 'Riverside Dispatch', siteUrl: 'https://riverside.blog/', feedUrl: 'https://riverside.blog/feed', votes: 4, support: 4, oppose: 0, unsure: 0, lastVoteAt: new Date(Date.now() - 5 * 3600000).toISOString()},
    {id: 'maple', title: 'Maple Notes', siteUrl: 'https://maplenotes.blog/', feedUrl: 'https://maplenotes.blog/feed', votes: 3, support: 2, oppose: 1, unsure: 0, lastVoteAt: new Date(Date.now() - 30 * 3600000).toISOString()},
  ],
  stats: {watching: 12, voting: 5, votes: 16, lastReadAt: new Date(Date.now() - 4 * 60000).toISOString()},
  mine: [],
};

test('write a Helios line, add a blog and see where the blogs stand', async ({page}, testInfo) => {
  const posted = [];
  let current = structuredClone(board);
  await page.route('**/api/blogroll', route => route.fulfill({json: current}));
  await page.route('**/api/blogroll/blogs', async route => {
    const body = route.request().postDataJSON();
    posted.push({body, csrf: route.request().headers()['x-csrf-token'], key: route.request().headers()['idempotency-key']});
    if (body.urls.length === 1) {
      current = {...current, mine: [{id: 'mine-1', url: 'https://quietfield.blog/', title: 'Quiet Field', siteUrl: 'https://quietfield.blog/', status: 'ok', votes: 2, lastReadAt: new Date().toISOString(), lastError: null}]};
      return route.fulfill({status: 201, json: {added: [{id: 'mine-1', url: 'https://quietfield.blog/'}], existing: [], invalid: [], readNow: 'mine-1',
        read: {id: 'mine-1', url: 'https://quietfield.blog/', feedUrl: 'https://quietfield.blog/feed', title: 'Quiet Field', status: 'ok', postsRead: 9, postsWithLines: 1,
          votes: [{law: 'DRAFT-CANNABIS', position: 'support'}, {law: 'HGA-031', position: 'support'}]}}});
    }
    return route.fulfill({status: 201, json: {added: body.urls.slice(1).map((url, i) => ({id: 'n' + i, url})), existing: [{id: 'old', url: body.urls[0]}], invalid: [], readNow: null, read: null}});
  });

  await page.goto('/blogs?support=FREE-WEED');
  await expect(page.locator('#line-output')).toHaveText('Helios: support FREE-WEED');
  await expect(page.locator('#stat-voting')).toHaveText('5');
  await expect(page.locator('#stat-votes')).toHaveText('16');
  await expect(page.locator('#backend-status')).toBeHidden();

  // Build a line from the picker; the address keeps the choices so it can be shared.
  await page.locator('#law-search').fill('childcare');
  await expect(page.locator('#law-picker > li:visible')).toHaveCount(1);
  await page.locator('#law-picker li[data-law="HGA-031"] [data-position="support"]').click();
  await page.locator('#law-search').fill('HGA-12');
  await page.locator('#law-picker li[data-law="HGA-012"] [data-position="oppose"]').click();
  await expect(page.locator('#line-output')).toHaveText('Helios: support FREE-WEED HGA-031; oppose HGA-012');
  await expect(page).toHaveURL(/support=FREE-WEED%2CHGA-031&oppose=HGA-012|oppose=HGA-012.*support=FREE-WEED%2CHGA-031/);
  await page.locator('#featured-pick [data-position="support"]').click();
  await expect(page.locator('#line-output')).toHaveText('Helios: support HGA-031; oppose HGA-012');
  await page.locator('#featured-pick [data-position="support"]').click();

  // The checker reads a post the way the server will.
  await page.locator('#checker summary').click();
  await page.locator('#check-text').fill('My reasons.\nHelios: support FREE-WEED HGA-777; oppose hfl-12');
  await expect(page.locator('#check-result .chip')).toHaveText(['Support FREE-WEED · Free Weed for Everyone', 'Oppose HGA-012 · Flexible Homes for Changing Families']);
  await expect(page.locator('#check-result')).toContainText('Skipped (not a law ID, or no position before it): HGA-777');

  // The board: Free Weed first, then the laws with the most blog support.
  await expect(page.locator('#featured-law h3')).toHaveText('Free Weed for Everyone');
  await expect(page.locator('#featured-law .counts')).toContainText('3support');
  await expect(page.locator('#featured-law .voices a').first()).toHaveAttribute('href', 'https://riversidedispatch.blog/');
  await expect(page.locator('#law-board > li')).toHaveCount(12);
  await expect(page.locator('#law-board > li').first()).toHaveAttribute('data-law', 'HGA-031');
  await page.locator('#law-board li[data-law="HGA-012"] summary').click();
  await expect(page.locator('#law-board li[data-law="HGA-012"] .voices')).toContainText('On zoning');
  await page.locator('#board-more').click();
  await expect(page.locator('#law-board > li')).toHaveCount(100);
  await expect(page.locator('#blog-list > li')).toHaveCount(2);

  // Add one blog: Helios reads it at once and shows the votes it found.
  await page.locator('#blog-url').fill('quietfield.blog');
  await page.locator('#add-submit').click();
  await expect(page.locator('#add-result h3')).toHaveText('Helios read Quiet Field');
  await expect(page.locator('#add-result .chip')).toHaveText(['Support FREE-WEED', 'Support HGA-031']);
  await expect(page.locator('#mine-list')).toContainText('Quiet Field');
  expect(posted[0].body).toEqual({urls: ['quietfield.blog']});
  expect(posted[0].csrf).toMatch(/^[a-f0-9]{64}$/);
  expect(posted[0].key).toMatch(/^[0-9a-f-]{36}$/);

  // Add a list: plain addresses and OPML both work.
  await page.locator('#import summary').click();
  await page.locator('#import-text').fill('<opml version="2.0"><body><outline xmlUrl="https://a.blog/feed?x=1&amp;y=2"/><outline xmlUrl="https://b.blog/rss"/><outline xmlUrl="https://c.blog/atom.xml"/></body></opml>');
  await page.locator('#import-submit').click();
  await expect(page.locator('#import-status')).toContainText('Added 2 new blogs; 1 already on the list.');
  expect(posted[1].body).toEqual({urls: ['https://a.blog/feed?x=1&y=2', 'https://b.blog/rss', 'https://c.blog/atom.xml']});

  await testInfo.attach('blogroll-desktop', {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
  await page.setViewportSize({width: 390, height: 844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach('blogroll-mobile', {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
});

test('on a fresh database the blogroll is empty and refuses private addresses', async ({page}) => {
  await page.goto('/blogs');
  await expect(page.locator('#stat-voting')).toHaveText('0');
  await expect(page.locator('#backend-status')).toBeHidden();
  await expect(page.locator('#blog-list')).toContainText('No blog has voted yet');
  await expect(page.locator('#featured-law')).toContainText('No blog has voted on this yet.');
  await page.locator('#blog-url').fill('https://localhost/feed');
  await page.locator('#add-submit').click();
  await expect(page.locator('#add-result h3')).toHaveText('Helios can’t use that address');
  await expect(page.locator('#add-result')).toContainText('That address is not a public website.');
});

test('without the blogroll API the line builder still works', async ({page}) => {
  await page.route('**/api/blogroll', route => route.fulfill({status: 503, json: {error: 'unavailable'}}));
  await page.goto('/blogs?oppose=HGA-005');
  await expect(page.locator('#backend-status')).toContainText('not available on this deployment');
  await expect(page.locator('#add-submit')).toBeDisabled();
  await expect(page.locator('#line-output')).toHaveText('Helios: oppose HGA-005');
  await expect(page.locator('#stat-voting')).toHaveText('—');
});
