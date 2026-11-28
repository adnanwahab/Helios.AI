# Research coordinator and shared future keyframes

The research playground is a supervision and collaboration control plane. A room
can plan **100–1,000 research assignments**, with a configurable limit of **1–100
active worker leases**. Creating a plan does not start an agent process or call a
paid AI provider. Worker execution is an optional, separate integration.

The default collaborator target is 1,000. Actual contributors are distinct guest
browser sessions or signed-in accounts that saved a room, frame, supervision edit,
or note. They are not verified people or an online-presence count. Connected workers are distinct worker IDs
holding unexpired task leases. These counts start at one contributor and zero
workers when a shared room is created.

## Shared data and draft mode

The server stores rooms, task plans, keyframes, immutable frame revisions, worker
outputs, contributions, and activity in its configured private database schema.
All new tables use the existing private-schema/RLS convention. Browser mutations
require a session, same-origin request, CSRF token, bounded JSON, rate limits, and
an `Idempotency-Key`. The same key with a different payload returns `409`.

The creator's guest browser session or signed-in account supervises the pipeline.
Anyone with the room link can read the room; a participant with a browser session can propose keyframe edits
and notes. Do not put private source material in a shared room. Changing a
supervision field or keyframe requires its current revision. Stale writes return
`409` without overwriting another participant's saved work.

When the preview does not have a configured research database, the UI uses a
clearly labeled browser draft and JSON export. That mode does not share
updates across devices. Connecting the optional isolated preview database is a
deployment configuration step, not something the browser can do.

Login is optional. The `open_login` control lets an existing account sign in for
future saved activity when the backend supports account persistence. Guest-owned
rooms and earlier browser votes remain separate; signing in does not transfer
them. See [optional login](optional-login.md) for account capabilities, provider
readiness, and the cross-device saving contract.

## Optional isolated preview database

Netlify routes `/api/research/*` to an isolated runtime when
`HELIOS_RESEARCH_DB_URL` is configured. This connection is separate from
`SUPABASE_DB_URL`/`DATABASE_URL`; an unavailable research database returns `503`
and never falls back to the civic database or Fly service.

Provision a dedicated runtime login that owns only the research schema, without
superuser, role-creation, database-creation, or access to `helios_civic`. Provision
the private schema before connecting the application. The runtime refuses to
create a missing non-civic schema and rejects `helios_civic` as the research
schema. Store the following values as server-only function environment settings
for the intended deployment context:

| Setting | Purpose |
| --- | --- |
| `HELIOS_RESEARCH_DB_URL` | Dedicated Supabase transaction-pooler connection string. |
| `HELIOS_RESEARCH_DB_SCHEMA` | Optional private schema; defaults to `helios_research_preview`. |
| `HELIOS_RESEARCH_DB_CA` | Optional PEM root CA; TLS certificate verification stays enabled. |
| `HELIOS_RESEARCH_WORKER_TOKEN` | Optional separate worker credential; omit to leave workers disconnected. |

The isolated runtime initializes the shared store's tables inside that schema,
including its own sessions and public seed catalog. It receives no civic
maintainer, email, model-provider, or other integration credentials. Configure
the environment only after the required credential-transfer approval and deploy
again so the functions receive it. No connection string or worker token is part
of this change.

Use `GET /api/research/session` to establish a session. In the isolated Netlify
runtime, the response cookie is named `helios_research_session`, is HttpOnly,
Secure and SameSite=Lax, and is scoped to `/api/research`. Only that cookie is
forwarded into the isolated runtime; a `helios_session` civic cookie cannot
authenticate there. Local development uses the existing in-process session
implementation. A research session's CSRF token must come from the same research
session endpoint and origin as its writes.

Validate a connected preview with two independent browser sessions: create a
room, copy its room link, save a keyframe from the second session, and reload the
first. Check that stale edits return `409`, the second participant cannot operate
supervisor controls, and `connectedWorkers` remains zero until an authorized
worker holds a lease. A browser-draft screenshot alone does not establish hosted
shared persistence.

## Browser API

All paths below begin with `/api/research`.

| Method and path | Behavior |
| --- | --- |
| `GET /status` | Actual storage, write availability, worker configuration and reason when disconnected. |
| `GET /session` | Establish the research browser session and return its CSRF token. |
| `GET /rooms` | Up to 30 rooms the verified account or current browser session owns or contributed to. No public enumeration or actor identifiers. |
| `POST /rooms` | Create a paused room and 1–24 supplied or seeded keyframes. |
| `GET /rooms/:id` | Room, up to 24 full keyframes, up to 1,000 task summaries, last 50 activity entries, and actual counts. |
| `POST /rooms/:id/brief` | Creator-only revision-checked supervision inputs. |
| `POST /rooms/:id/plan` | Creator-only: queue assignments across discovery, evidence, modeling, critique, and synthesis. Existing plans are preserved. |
| `POST /rooms/:id/control` | Creator-only: pause/resume new claims. Existing leases may finish. |
| `GET /rooms/:id/tasks/:taskId` | Full prompt, notes, result, revision, and task state. Lease tokens are never exposed to browsers. |
| `POST /rooms/:id/tasks/:taskId` | Creator-only notes and review decisions, using the current task revision. |
| `POST /rooms/:id/frames` | Add a future keyframe containing up to ten draft laws. |
| `POST /rooms/:id/frames/:frameId` | Save a revision-checked frame edit and retain its history. |
| `GET /rooms/:id/frames/:frameId/history` | Most recent 20 revisions. Continue with `?beforeRevision=` using the returned cursor. |
| `POST /rooms/:id/contributions` | Append `{frameId,text}` without replacing another person's text. |

Successful browser mutations return the committed full room snapshot. Their
idempotency receipts store only the room identifier, so retrying a request can
return a newer shared snapshot without repeating the mutation. Task summaries
omit prompts, notes, and results to keep a 1,000-assignment board bounded. Load
the task detail before editing its notes. Keyframe history is also paginated.

Changing the agent count after a plan has been queued is rejected. Create another
room for a differently sized research cycle. A new plan never deletes completed
work. An approved result remains approved; new research belongs in another cycle.
Task approval is a research review state, not enactment of a law or a public vote.

## Mini Symphony worker

The repository includes a runnable adapter at
`scripts/mini-symphony-worker.mjs`. See [the worker guide](research-worker.md)
for local exercises, real web research, and a separate optional Fly deployment.

Set a dedicated server-side `HELIOS_RESEARCH_WORKER_TOKEN` of at least 32
characters to enable this API on a writable database. Keep it out of browser code,
URLs, prompts, and screenshots. No token is provided or enabled by this PR.

Each endpoint accepts `Content-Type: application/json` and
`Authorization: Bearer <worker token>`. Worker credentials are separate from civic
maintainer credentials and browser sessions.

1. **Claim** — `POST /api/research/worker/claim` with
   `{roomId,workerId}`. A paused room returns `{task:null,paused:true}`. At capacity
   or with no queued work, `task` is null. Otherwise the response includes the
   full task, its `leaseToken`, `leaseExpiresAt`, and the room's current inputs.
2. **Heartbeat** — `POST /api/research/worker/heartbeat` with
   `{roomId,taskId,leaseToken}`. Renew before the fixed 90-second lease expires.
   A stale or mismatched lease returns `409`; the worker must stop.
3. **Complete** — `POST /api/research/worker/complete` with
   `{roomId,taskId,leaseToken,result}`. A current lease submits a result into
   `needs_review`, clears the lease, and preserves an immutable attempt output.
   Only the room creator can approve the result.
4. **Fail** — `POST /api/research/worker/fail` with
   `{roomId,taskId,leaseToken,errorCode}`. A current lease records a bounded
   failure, clears its result and lease, and pauses dispatch for owner review.
   Supported codes are `provider_unavailable`, `timeout`, `no_output`,
   `interrupted`, and `heartbeat_unavailable`. A failed task cannot be approved
   until a later attempt returns an actual result.

Claims lock the room before checking capacity and selecting a queued task. Each
worker ID can hold one active lease in a room. Concurrent claimers cannot exceed
that room's lease limit. Expired leases enter `needs_review`; they are not silently
retried. Duplicate or late completions are rejected. Pausing stops new claims but
does not kill processes that are already running. A lease limit is a database
admission limit, not a guarantee that a remote process has exited.

Claims include bounded current keyframes and excerpts of approved outputs. The
included runner performs web research, heartbeats, and submits a bounded text
draft with source links. It requires its own model credentials and supports
1–20 lanes, explicit local demo mode, cancellation, and a per-process task cap.
No runner is deployed or paid model calls made merely by publishing the UI.
Provider account budgets remain necessary; the task cap is not a dollar limit.

## Verification and limits

Integration tests exercise two independent browser sessions, persistence across a
PGlite restart, 100 queued tasks, optimistic conflict handling, owner controls,
idempotency, CSRF, room isolation, worker lease capacity, fencing, and human review.
They do not establish production throughput for 1,000 simultaneous people.

Keyframe paragraphs are editable scenarios built from stated assumptions and
proposed laws. They are not validated forecasts. Saving draft laws in a frame
does not change the shared civic catalog, enact a law, or cast a real ballot.
