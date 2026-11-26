# Everyone blogs (`/blogs`)

Helios = everyone blogs whenever. People keep writing on their own blogs, on any platform. A post votes by including one **Helios line**, and Helios counts each blog's position on **Free Weed for Everyone** (`DRAFT-CANNABIS`) and the **100 laws** (`HGA-001` to `HGA-100`).

```text
Helios: support FREE-WEED HGA-031; oppose HGA-012
```

Blog votes are advisory and unverified, like every other Helios vote. They are counted separately from the law board's votes.

## The Helios line

- A line starts with `Helios:` (or `Helios votes:`), followed by positions and law IDs. Each position word applies to the IDs after it: `support`, `oppose`, `unsure`, or `withdraw`. `yes`, `no`, `for`, `against`, `abstain` and `maybe` also work.
- IDs: `HGA-031`, `hga31`, the original proposal number `HFL-031`, and `FREE-WEED` (also `FREE-JOINTS` or `DRAFT-CANNABIS`) for Free Weed for Everyone.
- Short forms: `+HGA-031` supports, `-HGA-012` opposes and `?HGA-050` is unsure.
- **One blog is one voice per law, and its newest post wins.** To change a position, publish a new line. `Helios: withdraw HGA-031` takes one vote back, and `Helios: withdraw all` clears every vote.
- An ID with no position before it is skipped, not guessed. Helios never infers a position from anything else in the post.
- Lines inside `<blockquote>`, `<pre>` and `<code>` are ignored. That way, quoting someone else's line, or showing the syntax, does not vote.
- Some feeds only include the start of each post, so put the line near the top.

`public/blogroll-line.js` holds the parser and the line builder. The page and the server both use it, so the page's **Check a post** box reads a post exactly the way the server will.

## How Helios reads blogs

1. **Adding.** Anyone with a session can add a blog address or a feed address on `/blogs`, or paste a list (one address per line, or an OPML blogroll; the browser extracts the feed addresses). One request takes up to 200 addresses. Addresses are normalized: `http` becomes `https`, tracking parameters and trailing slashes are removed, and duplicates are skipped.
2. **Finding the feed.** For a page, Helios uses its `<link rel="alternate">` RSS, Atom or JSON Feed link. Otherwise it tries common paths (`/feed`, `/rss`, `/feed.xml`, `/index.xml`, ...). Two addresses for the same feed become one blog, and the second is marked `duplicate`.
3. **Reading.** A single added address is read immediately, so its author sees what Helios found. After that, `netlify/functions/blogroll-tick.mjs` runs every 15 minutes and reads up to 120 due blogs per run:
   - every 15 minutes for blogs that have voted and posted in the last two weeks;
   - every 3 hours for voting blogs that are quiet;
   - every 6 hours for blogs with no Helios line yet. Authors press **Read now** after posting their first line.
   Feeds are requested with `If-None-Match` and `If-Modified-Since`, so an unchanged feed costs one small request. Failed reads back off from 30 minutes to a day. A blog that fails three times shows as failing to whoever added it. Addresses that can never work wait 30 days.
4. **Counting.** For each post in the feed (up to 50), Helios parses Helios lines. It stores only the posts that contain one (link, title and the line itself), then rebuilds the blog's positions from its stored posts, oldest first. If an author edits a line out of a post, that post stops counting.

## What is public

- **Public list:** blogs with at least one current vote. Each entry shows its name, link, counts and the post that holds each vote. The list downloads as OPML from `/api/blogroll/opml`.
- **Not listed:** blogs that someone added but whose authors have not written a Helios line. Adding someone else's blog only means Helios reads it.
- **Private:** the session or account that added a blog. It is used only for the "Blogs you added" list.
- **Maintainers** can take a blog off the public list (spam, impersonation, a farm of throwaway blogs) and restore it later.

## API

| Method and path | Who | What |
| --- | --- | --- |
| `GET /api/blogroll` | anyone | Per-law counts with the newest 6 voices, the public list, totals and your own additions. |
| `GET /api/blogroll/opml` | anyone | The public list as OPML. |
| `POST /api/blogroll/blogs` | session | `{urls: [...]}` (1–200 addresses). Needs CSRF, `Idempotency-Key` and same-origin. A single address is read at once and returned as `read`. Limited to 30 requests an hour per session and 120 per IP. |
| `POST /api/blogroll/poll?max=25` | maintainer | Reads due blogs now (`Authorization: Bearer $HELIOS_ADMIN_TOKEN`). |
| `POST /api/blogroll/hide` | maintainer | `{id, hidden}`, where `hidden` is `true` to take a blog off the public list or `false` to restore it. |

Blog votes are written where law-board votes are: the Supabase database, or the local PGlite dev server. Deployed Fly PGlite and Netlify previews show the page, but they do not take blogs. There, the line builder and checker still work.

To read due blogs by hand on a running server:

```sh
HELIOS_ADMIN_TOKEN=... bun run blogroll:poll                                  # http://127.0.0.1:3000
HELIOS_ADMIN_TOKEN=... bun run blogroll:poll -- --url https://helioshtml.com --max 40
```

## Safety

Anyone can submit an address, so every read is guarded (`src/blogroll/fetch.js`):

- **Addresses:** only https on port 443. No credentials, no IP literals, and no local or reserved names.
- **DNS:** checked inside the socket's own lookup, so the address that was checked is the one connected to. Every address the name resolves to must be public.
- **Redirects:** each one is checked again, up to 4.
- **Responses:** must be text, are capped at 2 MB and time out after 8 seconds.
- **Identification:** Helios identifies itself as `HeliosBlogroll/1.0`.
- **Feed parsing** (`src/blogroll/feed.js`) never resolves DTDs or external entities.

## Limits and next steps

- **Capacity.** One scheduled run reads up to 120 blogs, about 11,000 reads a day. That covers roughly 100 actively posting voting blogs plus a few thousand quiet ones. Beyond that, add WebSub (push) subscriptions for platforms that support them, or run the poller as a dedicated worker.
- **Identity.** One person can run several blogs. The public list makes that visible, and maintainers can hide blogs. Proving blog ownership (a `rel="me"` link or a Helios code in a post) would let verified blogs be counted separately.
- **Wording.** Blog votes are per law ID, not per wording. If a law is revised, earlier blog votes still count toward it.

## Files

- **Parser:** `public/blogroll-line.js`
- **Page:** `public/blogroll.{html,css,js}`
- **Server:** `src/blogroll/{fetch,feed,reader,store}.js`
- **Routes:** `src/app.js`
- **Scheduled reads:** `netlify/functions/blogroll-tick.mjs`
- **Manual reads:** `scripts/blogroll-poll.mjs`
- **Tests:** `test/blogroll*.test.js` and `test/browser/blogroll.e2e.js`

```sh
bun run test:blogroll
CI=1 bunx playwright test test/browser/blogroll.e2e.js
```
