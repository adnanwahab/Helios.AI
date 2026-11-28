# Mini Symphony: a working research runner

The shared dashboard at **`/research`** already stores research rooms, tasks,
supervisor decisions, and future keyframes. The runner in
`scripts/mini-symphony-worker.mjs` now processes that queue through its existing
HTTP API. It can run on a laptop or a separate Fly Machine; the API and database
remain the same ones used by the dashboard. A Netlify API does not need to keep a
request open while the worker researches.

## First mission

1. Configure the API with its dedicated Supabase database and a server-only
   `HELIOS_RESEARCH_WORKER_TOKEN` of at least 32 characters. See
   [research-coordinator.md](research-coordinator.md) for isolated preview setup.
2. Open `/research`, write a brief, add evidence and assumptions, and create a
   shared room. Keep private journals out of a public shared room.
3. Save its task plan. It starts paused. Copy the `room-...` identifier from
   `/research?room=room-...`.
4. Configure and start the runner as below. Resume dispatch in the dashboard
   when ready for model calls. Its **Connected workers** count comes from actual
   live task leases; a configured token by itself does not increment it.
5. Open a completed assignment, inspect its sources and assumptions, and approve,
   reject, or request a retry. Generated results enter **Needs review**. They do
   not change the law catalog, keyframes, or vote counts automatically.

The current planner creates 100–1,000 assignment slots; these are queued tasks,
not independently running processes. The runner starts with two concurrent
lanes. Increase its limit up to 20 only when the API, provider quota, and budget
can support it. The room's separate concurrency limit still applies globally.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `HELIOS_RESEARCH_API_BASE_URL` | Yes | Exact API origin, e.g. `https://helioshtml.com`; no path, query, or credentials. |
| `HELIOS_RESEARCH_ROOM_ID` | Yes | One shared room ID from the dashboard URL. |
| `HELIOS_RESEARCH_WORKER_TOKEN` | Yes | Same server-only worker credential configured on that API. |
| `OPENAI_API_KEY` | Real mode | Model provider credential; never part of the browser or Netlify static build. |
| `HELIOS_RESEARCH_MODEL` | Real mode | Explicit available Responses model supporting web search. There is no guessed model fallback. |
| `HELIOS_RESEARCH_CONCURRENCY` | No | Concurrent lanes, 1–20; default 2. |
| `HELIOS_RESEARCH_MAX_TASKS` | No | Maximum tasks claimed in this process, 1–1,000; default 100. |
| `HELIOS_RESEARCH_TIMEOUT_MS` | No | Per-model request deadline; default 120,000 ms. |
| `HELIOS_RESEARCH_POLL_MS` | No | Queue polling interval; default 5,000 ms. |
| `HELIOS_RESEARCH_WORKER_ID` | No | Unique operator label for this process; random per process by default. |

Choose a currently available model from the [OpenAI model catalog](https://developers.openai.com/api/docs/models) and set `HELIOS_RESEARCH_MODEL` explicitly.

Set secrets using your environment or secret manager; do not paste them into
source files. The worker needs no database password or civic administrator token.
After setting the variables:

```sh
node scripts/mini-symphony-worker.mjs --help
node scripts/mini-symphony-worker.mjs --once
node scripts/mini-symphony-worker.mjs
```

`--once` claims at most one assignment and exits; a paused or empty room exits
without model calls. Normal mode waits for queued work until interrupted or the
task limit is reached. The task cap resets on process restart. It is a call limit,
not a dollar budget; configure spending limits in the provider account.

Real mode uses the Responses API with web search, at most three built-in tool
calls and 2,500 output tokens per assignment. The result stores provider-supplied
source annotations and a human-review notice. Missing citations are explicitly
reported as an evidence gap. Search annotations establish provenance, not that
the model's interpretation is correct. No website text is executed as code.

## Local exercise without paid calls

Use an isolated local PGlite server and a test worker token. Create and resume a
shared room using that local `/research` page. Configure the runner for its
`http://127.0.0.1:3000` origin and copied room ID, then run:

```sh
node scripts/mini-symphony-worker.mjs --demo --once
```

`--demo` is rejected for non-loopback APIs. It writes a conspicuously labeled
**LOCAL DEMO — synthetic output** into the local task queue. It never calls a model
or search provider and must not be reported as completed real research. The same
queue claim, lease, durable completion, and human-review path are exercised.

## Failure and shutdown behavior

Claims have 90-second leases. The runner renews them every 20 seconds while it
works. A stale lease (`409`) aborts the model request and its result is discarded.
Only the matching live lease can complete an assignment.

Provider errors, timeouts, missing outputs, and interrupted work use
`POST /api/research/worker/fail`. The server preserves a failure record, clears
the live lease, leaves the task with no approvable result, and pauses new dispatch
for supervisor review. Existing live assignments may finish. The owner can edit
the notes, queue the failed task again, and resume dispatch after resolving the
cause. The runner does not automatically retry paid research.

SIGINT/SIGTERM stop new claims, cancel active requests, and attempt bounded
failure receipts. If a completion reply is lost, the runner reports
`completion_unconfirmed` rather than overwriting the result or running it again.
An unreachable API can leave a lease to expire; the existing queue quarantines
expired work for review. Logs contain event names and task identifiers, never
credentials, prompts, or private provider error bodies.

`GET /api/research/status` reports `workerConfigured` separately from
`activeWorkerLeases`, `connectedWorkers`, and `lastWorkerActivityAt`. An idle
worker without a task is not counted as a live lease; this is not a machine
health monitor.

## Optional separate Fly deployment

`fly.worker.toml` and `scripts/Dockerfile.mini-symphony` describe an outbound-only
worker with no public web service or volume. They do not alter `fly.toml` or
attach the existing `helios_data` database volume. Choose a **separate** app name.
After creating that worker app, set its API origin, room ID, worker token, and
OpenAI key through Fly's secret management. Then, from the repository root:

```sh
fly deploy -a YOUR_WORKER_APP --config fly.worker.toml
fly logs -a YOUR_WORKER_APP
```

The image requires no npm dependencies: the runner uses Node's built-in HTTP,
timers, and cryptography APIs. The example starts with two lanes on one Machine;
20 simultaneous HTTP/model tasks do not inherently require 20 Machines. Workload
capacity and costs still require measurement. The restart policy retries crashes
up to three times, but a process that reaches its task cap exits successfully and
is not automatically restarted. Launch another cycle deliberately.

## Verification

```sh
bun test test/research.test.js test/mini-symphony-worker.test.js
```

Tests use a temporary PGlite database and mocked provider responses. They cover
real queue persistence and ownership rules, active-lease reporting, citations,
concurrency, heartbeats, stale-lease cancellation, failure pausing, and graceful
stop. No production ballots, research rooms, or paid model requests are created.

References: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[web search](https://developers.openai.com/api/docs/guides/tools-web-search),
and [Fly configuration](https://docs.fly.io/reference/configuration).
