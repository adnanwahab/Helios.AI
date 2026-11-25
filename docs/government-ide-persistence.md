# Government IDE persistence

The database status strip reads GET /api/workspace-status, not generic health. Connect shared data to start a browser session. Refresh restores an explicitly connected session in the same tab; no practice actions are uploaded. A confirmed write is followed by a separate read-back of the selected vote, comment or amendment. Acknowledged writes with failed read-back are marked separately. Comments and amendments remain pending review.

Production: set SUPABASE_DB_URL in Netlify Functions scope, Production context only. Preserve/migrate existing Fly data before changing authoritative stores. Do not set production credentials on previews.

Preview: use a separate disposable Supabase project/database, set HELIOS_PREVIEW_DB_URL (secret) and HELIOS_PREVIEW_WRITES=1 in Functions scope, Deploy Previews context only. Optionally HELIOS_PREVIEW_CA_CERT. Redeploy. The server requires Netlify deploy context and the opt-in, refuses a matching production target when visible, and uses only the test database for workspace sessions, reads and writes. Other civic endpoints are disabled in isolated preview mode; the separately provisioned research service and optional account configuration retain their own existing routes; unconfigured previews are practice-only. Do not use a production database as the preview target even if its production URL is not visible to the preview.

Check /api/workspace-status for writable:true, mode:preview-test and storage:supabase-postgres. Connect, cast a test vote, confirm Saved & read-back verified, refresh, then clear the test vote. No production write is required for testing.

If a production connection was set in all contexts, the preview still refuses to use it. The legacy health endpoint can report Fly PGlite availability without granting writes; workspace-status is authoritative for persistence. Restrict the production connection secret to Functions / Production in the Netlify dashboard.
