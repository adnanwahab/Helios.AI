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

## Original 100-law workbench and Supabase

The homepage ships only the original public editorial catalog from the repository at build time, so the atlas and simulations work without a database. The 100 law IDs retain their HFL source references. Each proposal has an illustrative normalized scenario using its first suggested measure, a distinct policy lever, a category rollout family, and user-adjustable effect, reach, capacity, lag and horizon. These are assumption-sensitive thought experiments, not forecasts, calibrated impact estimates, or legal/budget feasibility analysis.

Connect a dedicated Helios Supabase project using its transaction-pooler connection string in the Netlify **Functions** secret `SUPABASE_DB_URL` (production and appropriate review contexts; prefer a separate test database for previews). Do not put credentials in the browser or Git. The server initializes the private `helios_civic` schema, revokes public/anon/authenticated schema access, and uses transaction-local search paths. If legacy public law/version tables exist, initialization refuses to create a parallel store; explicitly migrate them first. Do not expose the private schema through Supabase's Data API. An existing Fly PGlite store must be reviewed/migrated before switching authorities; do not discard original revisions, sessions, votes or comments. No Supabase project or credentials are created by this PR.

- `GET /api/law-board`: all 100 current records, real advisory vote totals, update counts, caller's own position; storage and writable status.
- `POST /api/law-board/HGA-xxx/vote`: current versionId, support/oppose/unsure or null to clear. One current position per pseudonymous session and revision. Older votes stay with their historical wording.
- `POST /api/law-board/HGA-xxx/update`: current versionId, public goal, implementation, safeguards, reason and explicit consent. Existing amendment mechanism stores the proposed revision without replacing the current text; maintainer review accepts it.
- `GET /api/law-board/HGA-xxx`: original and subsequent versions, their vote totals, and proposed/accepted updates. The API never returns actor/session identifiers.

Production law-board writes require Supabase; Fly PGlite is read-only for these new endpoints. Local PGlite development exercises the same write contract. GitHub Pages is simulation-only. A missing or failed Supabase connection must never turn a simulated position into a real vote. Browser-session advisory counts are not verified unique people or official elections.

**Deployment checklist:** select/create a dedicated Supabase project, preserve any existing civic data in an explicit migration, configure the secret on the deployment, redeploy, verify `GET /api/health` reports `supabase-postgres`, verify `GET /api/law-board` returns 100 records and `writable:true`. Use isolated test deployment(s) to verify writes and revision acceptance. Run Supabase security advisors on the actual provisioned project before public launch.
