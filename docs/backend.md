# Persistent shared goals

Helios.AI owns the `helios-global-agreements-100` collection. It seeds the exact 100 HGA editorial records from the existing page, preserving HFL source references. No Civic Synthesis votes, records, receipts or repository identities are migrated or overwritten. The user-facing library contains proposals, not enacted laws or evidence of public consensus.

## Architecture

- **Static site:** `dist/` is built from the HTML pages and `public/` by `scripts/build-netlify.mjs`, and published by Netlify's CDN. Only the allowlisted files are published, so source, data and scripts are never served.
- **API:** `netlify/functions/api.mjs` handles `/api/*`, `/email/unsubscribe` and `/proxy/ycr/*`. It runs `src/app.js`.
- **Database:** Supabase Postgres, reached through `src/db.js` with `SUPABASE_DB_URL`. The schema is created on first use (`SCHEMA` in `src/store.js`) under an advisory lock.
- **Email:** `netlify/functions/email-tick.mjs` is a Netlify scheduled function (hourly, UTC). It sends due day-3 emails and stops starting new sends after a 7-second budget, so a run finishes inside the function timeout.

Bun and SQLite are no longer used. Netlify functions have no persistent local disk, so all state lives in Postgres.

## API behavior

The API contract is unchanged from the SQLite version: `POST /api/laws` and amendment proposals need a session cookie, `X-CSRF-Token`, a unique `Idempotency-Key` and a same-origin `Origin`. Accepting an amendment needs `Authorization: Bearer <HELIOS_ADMIN_TOKEN>` at `POST /api/laws/:id/amendments/:amendmentId/accept`. Without the token, acceptance returns 503 and amendments stay proposed.

Writes run in a transaction. Each law's row is locked (`FOR UPDATE`) while an amendment is proposed or accepted, so a stale base returns 409 and concurrent accepts cannot both apply. Idempotency receipts are written in the same transaction as the record they describe. Rate limits use a per-key advisory lock.

Browser sessions are pseudonymous, not verified civic identities. Cookies are HttpOnly, SameSite=Lax and Secure in production. `Fly-Client-IP` is gone: Netlify's `x-nf-client-connection-ip` is used for rate limits and is set by the edge, not by the client.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `SUPABASE_DB_URL` | Netlify (secret) | Supabase transaction-pooler connection string (port 6543) |
| `SUPABASE_CA_CERT` | Netlify (optional) | PEM root certificate from the Supabase dashboard, if default TLS trust fails |
| `HELIOS_ADMIN_TOKEN` | Netlify (secret) | Enables amendment acceptance; keep it out of source and browser code |
| `PUBLIC_ORIGINS` | Netlify | Comma-separated extra origins allowed for writes |
| `RESEND_*`, `EMAIL_*`, `PUBLIC_BASE_URL` | Netlify (secret) | Email; see `docs/email.md` |

Set these in the Netlify UI (Site configuration → Environment variables), not in `netlify.toml`.

## Deploying

1. In Supabase, create a project. Copy the transaction-pooler connection string (Project settings → Database) into `SUPABASE_DB_URL` on Netlify.
2. Connect the repository to a Netlify site. `netlify.toml` builds `dist/` and deploys the functions. Deployment does not create tables or seed data; the first API call does that, once.
3. Check `https://<site>/api/health`. `seedCount` should be 100 and `storage` should be `supabase-postgres`.
4. Point `helioshtml.com` at the Netlify site, and update the Resend webhook URL to `https://helioshtml.com/api/email/inbound`.

Netlify functions are stateless and run in several instances, so do not add in-memory state for anything that must persist. The `pg` pool holds at most two connections per instance.

## Migrating the existing SQLite data

The live data is on the Fly volume (`/data/helios.sqlite`), which this code cannot read. Copy it off first:

```sh
fly ssh sftp get /data/helios.sqlite ./helios.sqlite --app helios-ai-laws
bun scripts/migrate-sqlite.js ./helios.sqlite     # needs SUPABASE_DB_URL; the target must be empty
```

The script copies every table with its IDs and timestamps, so amendment base versions and signup tokens still work. It refuses to run against a database that already has Helios data, and it compares row counts before committing. Stop writes to the Fly app before the copy, or signups made after it will be missing. Keep the Fly volume until the new site has run a full email cycle.

## Operations

- Accept a reviewed amendment from a trusted shell with `SUPABASE_DB_URL` set: `node scripts/accept-amendment.js HGA-002 AMD-<uuid>`. The public UI only proposes amendments.
- Email status and replies: `node scripts/email-status.js`. Make an address due now: `node scripts/email-status.js send-now you@example.com`.
- Backups: Supabase takes daily backups on paid plans. For an off-site copy, run `pg_dump --format=custom "$SUPABASE_DB_URL" > helios-$(date +%F).dump` from a trusted machine and store it outside Supabase.

## Local development and tests

```sh
bun install
bun test                 # API, email and migration tests on in-process Postgres (PGlite)
bun run dev              # builds dist/ and serves it with the API on http://localhost:3000
bun run test:browser     # Playwright against the dev server
```

Without `SUPABASE_DB_URL`, the dev server uses a PGlite database in `.data/pglite`. Netlify-specific behavior (CDN redirects, function routing, scheduled runs) is only verified on a Netlify deploy. `netlify dev` can run the real functions locally if you prefer.

## API writes

Create a session with `GET /api/session`. Send its cookie, `X-CSRF-Token`, a unique UUID `Idempotency-Key`, JSON content type and same-origin Origin with submissions. `POST /api/laws` accepts title, category, sharedGoal, illustrativeLocalOption, risksAndSafeguards and suggestedMeasures. `POST /api/laws/:id/amendments` accepts baseVersionId, reason and a proposal object containing those fields. Replaying the same submission key and body returns the same receipt; reusing that key for another body returns 409. `GET /api/laws/:id` exposes canonical text, versions and proposed amendments, never session credentials.

## Netlify without a configured database

The existing Fly application and its persistent PGlite volume are the source of shared civic data on the original Helios Netlify project when neither database URL is set. The narrowly allowlisted gateway (src/fly-civic-gateway.js) forwards public proposal reads, browser sessions, ordinary proposal/amendment writes and constitution reads/votes/contributions/comments to the fixed Fly origin. It checks the original site and host, same-origin POST, CSRF/idempotency headers and bounded JSON bodies, and forwards only the Helios session cookie. No maintainer routes, mail operations, or unrelated proxy paths are forwarded. Browser sessions remain host-specific; the same underlying public board is shared, including Netlify previews. Connecting or submitting is explicit. All upstream limits remain enforced; users sharing a gateway egress may hit the upstream IP limit. No cross-database fallback is attempted if a configured database fails. The gateway returns a structured 503 if Fly is unavailable or the constitution API is not deployed. The Netlify scheduled mail worker skips if no database is configured; it does not run Fly's mail worker. If mail or other administrative operations are required, configure the existing appropriate backend separately. Fly must run the current main before the constitution API works.
