# Helios features, routes, and backend setup

Open **`/features`** for the directory of all 15 features. Each card includes its
route, where work is saved, and the capability reported by this deployment.
`GET /api/features` provides that public capability list without credentials or
account data. It checks the configured runtime, not provider billing or delivery:
each write still needs a successful receipt. Worker configuration is separate
from observed active worker leases.

## Route directory

| Feature | UI route | Backend/API | What is implemented |
| --- | --- | --- | --- |
| Landing page | `/` | None for viewing or local drafting | Existing civic workshop and an All features entry. Sharing is an explicit later action. |
| Three.js / WebGPU experiences | `/experiences` | None for the graphics | Existing interactive experience collection; graphics support depends on the browser/device. |
| World suitability map | `/world-map` | None | Browser calculations, five preference controls, and shareable URL state. |
| Synthetic population simulations | `/simulate` | None for simulation | Consensus World, editable assumptions and comparisons, distinct from recorded human votes. Optional AI uses the drafting API below. |
| Read the original 100 laws | `/laws` | None required; optional `GET /api/catalog`, `GET /api/laws/:id` | Bundled editorial catalog, with connected versions/history when available. Existing `HGP-` proposal receipt links are preserved. |
| Private local journal | `/journal` | None; no journal upload endpoint | Explicit device-local saves, entry list, export, delete, and cross-tab overwrite detection. No account/API connection on this page. |
| Save real advisory votes | `/votes` | `GET /api/law-board`; `POST /api/law-board/:id/vote` | Existing durable support/oppose/unsure positions tied to exact law revisions, with clear practice/connected modes. |
| Propose and revise shared laws | `/proposals` | `POST /api/laws`; `POST /api/laws/:id/amendments`; `POST /api/law-board/:id/update` | Guided proposal creation and existing amendment/revision workflows; acceptance remains a maintainer action. |
| User accounts and saved preferences | `/account` | `GET /api/account/config`, `/api/account/me`; `GET` and `POST /api/account/preferences` | Existing optional authentication plus durable display name, workspace appearance, reduced motion, and favorite proposals. Conflicting revisions return 409. |
| Create GitHub pull requests | `/pull-requests` | `GET /api/github/config`; `POST /api/github/pull-requests` | Reviewed, consented proposal JSON becomes a public **draft PR** in this repository; confirmed URL receipt and duplicate-safe retries. |
| AI law drafting | `/draft` | `GET /api/drafting/config`; `POST /api/drafting/revise` | Select a public law or write a draft, approve provider transmission, compare suggested wording/objections, and copy/export the result. No automatic adoption. |
| Email notifications | `/notifications` | `GET /api/email/config`; `POST /api/email/subscribe`; `/email/unsubscribe`; scheduled `email-tick` | Explicit opt-in to the existing single delayed follow-up, unsubscribe, and truthful saved-versus-delivered status. This is not a recurring/event-notification system. |
| Mini Symphony research agents | `/agents` | `/api/research/status`; room `/plan`, `/control`, `/tasks/:taskId`; worker `/claim`, `/heartbeat`, `/complete`, `/fail` | Queue supervision, a real long-running research worker, source-backed outputs, leases, failure handling, and human result review. |
| Shared research dashboards | `/research` | `GET` and `POST /api/research/rooms`; `GET /api/research/rooms/:id`; room `/brief` and `/contributions` | Saved briefs, assignments and evidence; Your shared rooms reconnects owned/contributed rooms for the current account or guest session. |
| Collaborative future keyframes | `/keyframes` | `POST /api/research/rooms/:id/frames`; `POST /api/research/rooms/:id/frames/:frameId`; `GET .../frames/:frameId/history` | Shared future frames, linked laws, contributions, version history, and optimistic concurrency. Opens the keyframe editor directly. |

The three research routes share one room model. A URL such as
`/keyframes?room=room-...` opens the same saved room as `/research?room=room-...`.
The room list only returns rooms the current actor owns or contributed to; it
does not enumerate everyone else's rooms. Individual shared rooms are accessible
by their share URL, so include only material intended for that room's readers.

## Where the code runs

The new services use the existing shared runtime in `src/`, so the same API
contract works in Netlify Functions and the local/Fly Node server. The browser
calls same-origin `/api/...` routes. Netlify's function owns those paths; no
browser-visible provider or GitHub credential is needed.

- Production shared work uses the existing private Supabase Postgres schema.
  Configure `SUPABASE_DB_URL` in the runtime's secret environment, redeploy, and
  verify `/api/health` and the specific feature capability. Do not expose the
  database schema through a public browser client.
- Local development uses PGlite and exercises the same write/revision contracts.
  A fresh local database is not the production database.
- The existing fixed Fly civic gateway remains a compatibility path for its
  allowlisted older routes. It does not silently acquire support for the new
  preferences, AI, or PR endpoints when the shared database is missing.
- GitHub Pages keeps browser features and local drafts. Feature links are
  rewritten to portable files, and the new shared workspaces are explicitly
  disconnected; they do not send a fork's submissions to the original site.
- A configured database error does not fall back to another database. Previews
  cannot write production records. Existing isolated-preview opt-in rules remain
  in force; new-law publishing and external provider calls stay disabled there.

See [backend setup](backend.md) and [research preview isolation](research-coordinator.md)
for the existing database and deployment contracts. The separate research
database, when configured, is the authority for research status as well as writes.

## Configure the optional integrations

Keep these values in server-side deployment secrets, never in HTML, `public/`,
or Git. A configuration change requires a new deployment/runtime restart.

| Capability | Required configuration | Verification |
| --- | --- | --- |
| Account preferences | Writable shared database; the existing approved Supabase Auth project | Sign in to an existing account, save, and read the same revision in another signed-in session. New-user email/signup availability still follows `public/account-config.js` and the project's SMTP setup. |
| Drafting | `CONSENSUS_AI_ENABLED=1`, `OPENAI_API_KEY`, explicit `OPENAI_MODEL` supporting the Responses API and structured output | `/api/drafting/config` reports configuration; a consented draft request returns a validated suggestion. No default model ID is assumed. |
| Automatic PRs | `HELIOS_GITHUB_PR_ENABLED=1`, `HELIOS_GITHUB_TOKEN` scoped to this repository with Contents and Pull requests write access | `/api/github/config`, then a reviewed submission by a signed-in account. Repository and contribution path are fixed by the server. |
| Email delivery | `RESEND_API_KEY`, verified `EMAIL_FROM`, appropriate `PUBLIC_BASE_URL`; the scheduled sender | `/api/email/config`, then verify an authorized test delivery. Defaults to one follow-up after 72 hours; optional `EMAIL_DELAY_HOURS` changes the delay. A stored address alone does not prove delivery. |
| Research worker | API: `HELIOS_RESEARCH_WORKER_TOKEN`; worker: same token, `HELIOS_RESEARCH_API_BASE_URL`, `HELIOS_RESEARCH_ROOM_ID`, `OPENAI_API_KEY`, explicit `HELIOS_RESEARCH_MODEL` | Save and resume a task plan, start the separate runner, observe an actual lease and a persisted result requiring review. See [worker guide](research-worker.md). |

The research runner can live on a separate Fly Machine while the API stays on
Netlify. `fly.worker.toml` and `scripts/Dockerfile.mini-symphony` provide that
outbound-only worker. They do not change the existing Fly app or attach its civic
data volume. Starting a queue needs an operator to select a room, model and
budget; adding source files alone does not start research.

## Persistence and review

Shared writes use the established session, same-origin, CSRF and durable
idempotency protections. Preferences and automatic PRs also require a token
verified by the configured Auth service. A preference's expected revision
prevents silent overwrites; retrying the unchanged request returns the receipt.
Rate limits for paid/provider operations are stored in the database.

GitHub publication writes one bounded proposal JSON file on a deterministic
branch and creates a draft PR. The server cannot choose arbitrary repositories,
edit executable app code, approve, or merge. Public sharing and contribution
rights are confirmed in the UI before submission. Lost responses can be retried
with the same request ID without intentionally making another PR.

AI input goes to the configured provider only after explicit consent. Generated
revisions are retained in the private server receipt table for retries; there is
currently no automatic receipt-expiry job. The original request is recorded as a
hash, and generated text is not published or adopted automatically. Journal
entries never enter this flow unless the person manually copies text into a
different, explicitly shared feature.

Votes are actual stored participant positions, but guest sessions and optional
accounts do not verify unique civic identities. These are advisory records, not
official election ballots. Synthetic population output never becomes a stored
human vote. Worker outputs similarly stay unapproved until a person reviews
their sources and reasoning.

## Verification

```sh
bun --no-env-file test
bun run build
CI=1 bun run test:browser
node scripts/build-pages.mjs
```

New backend coverage checks ownership, revision conflicts, durable retries,
provider errors, preview isolation, research room-list isolation, worker leases,
and safe configuration reporting. Browser coverage checks route discovery,
device-local journal persistence without API calls, consent and retry behavior,
account conflicts, PR receipts, email status, shared-room reconnection, and safe
research source links. External provider/Auth/GitHub calls are mocked in tests.
The PR visual workflow captures desktop and mobile versions of the directory
and new workspaces before the existing experience screenshots.
