// Publishes the current Helios plan to Notion as a new page under NOTION_PARENT_PAGE_ID,
// and records it as the page the "Plan · Notion" screen shows.
//   bun run notion:publish                 → uses SUPABASE_DB_URL, else local PGlite (.data/pglite)
//   HELIOS_URL=https://helioshtml.com bun run notion:publish   → asks the deployed app (needs HELIOS_ADMIN_TOKEN)
const remote = process.env.HELIOS_URL;
if (remote) {
  const r = await fetch(new URL('/api/notion/publish', remote), {method: 'POST', headers: {authorization: 'Bearer ' + (process.env.HELIOS_ADMIN_TOKEN || '')}});
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`Publish failed (${r.status}): ${body.error || 'unknown error'}`); process.exit(1); }
  console.log(`Published ${body.blocks} blocks → ${body.url}`);
  process.exit(0);
}

const {createRuntime} = await import('../src/runtime.js');
const db = process.env.SUPABASE_DB_URL ? undefined : await (async () => {
  const {createPGliteDatabase, pgliteDataDir} = await import('../src/db-pglite.js');
  return createPGliteDatabase(pgliteDataDir());
})();
const runtime = await createRuntime({db, secure: false});
try {
  const result = await runtime.notion.publish();
  console.log(`Published ${result.blocks} blocks → ${result.url}`);
  console.log(`Page id ${result.id} saved; set NOTION_PAGE_ID=${result.id} to pin it explicitly.`);
} catch (error) {
  console.error('Publish failed:', error.message);
  process.exitCode = 1;
} finally {
  await runtime.store.close();
}
