# Plan · Notion

The **Plan · Notion** tab (`/notion`, embedded at `/embed/notion`) shows the Helios plan as a Notion document: cover, icon, properties, toggles per goal, callouts, to-dos, an outline sidebar, ⌘K search, dark mode and Markdown export.

## Where the content comes from

`GET /api/notion/preview` picks the first that works:

1. `NOTION_PAGE_ID`, read live from the Notion API (cached `NOTION_CACHE_MS`, default 60 s; `?fresh=1` skips the cache — the **Sync from Notion** button).
2. The page last created by `notion:publish` (its id is kept in the `metadata` table).
3. A preview built from the live catalog (the same document that publish would send).

If Notion errors, the screen falls back to (3) and shows a warning. Static builds also ship `notion-preview.json` so the screen works on GitHub Pages.

## Set up

1. Create an internal integration at https://www.notion.so/profile/integrations and copy its secret.
2. Make a page in Notion (e.g. "Helios"), open **⋯ → Connections** and add the integration.
3. Set the environment (Netlify UI or `.env`):
   ```
   NOTION_TOKEN=ntn_...
   NOTION_PARENT_PAGE_ID=<that page's URL or id>
   ```
4. Publish the plan:
   ```sh
   bun run notion:publish                                   # local / Supabase DB directly
   HELIOS_URL=https://helioshtml.com HELIOS_ADMIN_TOKEN=... bun run notion:publish   # through the deployed API
   ```
   This creates a new child page each run (a weekly "patch") and points the screen at it.

Edit the page in Notion and the tab shows the edits after a sync. Supported blocks: paragraphs, headings (including toggle headings), lists, to-dos, toggles, callouts, quotes, dividers, code, images, bookmarks, tables, columns and child-page links.

`POST /api/notion/publish` requires `Authorization: Bearer $HELIOS_ADMIN_TOKEN`.
