# Production readiness

**Launch checklist item 19: blocked.** The canonical site's API is unavailable, and a production backup/restore drill has not been evidenced. A passing preview or local persistence test does not close this gate.

## Recorded audit — November 25, 2026

Read-only checks ran at approximately **2:33–2:35 p.m. America/Chicago (20:33–20:35 UTC)**. Repository evidence below refers to PR #75 head `5ca54f8cd03c20b6e11a885d4d5375108d216f82`; later commits need their own CI and deployment evidence. These observations are a dated snapshot, not a live uptime display.

| Check | Observed result | Meaning |
| --- | --- | --- |
| [Canonical homepage](https://helioshtml.com/) | HTTP 200 | Static page available. This does not establish that saving works. |
| [Canonical health](https://helioshtml.com/api/health) | HTTP 502; a second request also returned 502 | Function reported missing `SUPABASE_DB_URL`. Its response included stack frames. |
| [Fly homepage](https://helios-ai-laws.fly.dev/) | HTTP 200 | Alternate app reachable. |
| [Fly health](https://helios-ai-laws.fly.dev/api/health) | HTTP 200, `status: ok`, `storage: pglite`, `runtime: fly-machine`, `seedCount: 100`, `proposalCount: 104` | Fly read its catalog at the time of the check. Counts can change. |
| [Backend CI](https://github.com/adnanwahab/HeliosHTML/actions/runs/45689728463) | 109 unit tests passed; 49 browser tests passed, 4 failed | Persistence tests passed; the browser suite had stale law/docs count assertions. This is not an all-green release result. |
| [Fly image smoke](https://github.com/adnanwahab/HeliosHTML/actions/runs/45689728472) | Passed, including proposal/amendment persistence after Docker restart | Evidence from an isolated temporary volume, not the production volume. |
| Production recovery | Not verified | No completed production backup record or isolated restore result was supplied during this audit. |

No ballots, proposals, amendments or participant records were written to production during these checks. No production credential was read, copied or changed.

## Error handling included in this PR

The branch already guarded configured database initialization; the older canonical deployment still exposed an initialization failure. `netlify/functions/api.mjs` now places both runtime initialization and the existing gateway call inside one awaited error boundary. Unexpected failures return a non-cacheable **503 JSON** response with `code: BACKEND_UNAVAILABLE`; error messages, connection details and stack frames are excluded from the response and this boundary's log message.

The existing site/route allowlist and preview contribution-inbox denial remain in force. A failed configured database never falls back to another store. Missing configuration may use the already-defined trusted Fly gateway; unknown deployments stay unavailable. This patch does not install credentials, select a new database, migrate data or deploy production.

Targeted checks:

```sh
bun --no-env-file test test/netlify-initialization.test.js test/fly-civic-gateway.test.js
node --check netlify/functions/api.mjs
```

The tests cover missing configuration on an untrusted deployment without network access, redaction of initialization failures, no database failover, asynchronous gateway rejection, preview inbox isolation, and a later request succeeding after an initialization failure. Local test success cannot verify the hosted configuration.

## Steps to close the gate

1. **Confirm the canonical deployment and authoritative store.** Record the production deploy ID and source SHA in the private operations record. Determine whether the approved deployment should use its configured Supabase database or the existing allowlisted Fly service. Do not create a fresh empty database merely to remove the error; preserve existing participant records and the selected source of truth. Inspect the current deployment before concluding that adding a credential is the only remedy.
2. **Restore the chosen backend path.** For an approved Supabase deployment, confirm that the existing restricted runtime credential is available to Netlify Functions in the intended production context, then deploy the reviewed release. Keep preview credentials isolated. Netlify configuration-file variables do not supply function secrets, and environment changes require a new deploy: see [Netlify function environment variables](https://docs.netlify.com/build/functions/environment-variables/). For serverless Postgres connections use the actual transaction-pooler connection details from the selected project, as described in [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres); do not guess a host or expose the credential in a PR. If using the approved Fly gateway, verify its existing site identity, route restrictions and returned backend metadata on the deployed release.
3. **Repeat read-only production checks.** Both homepage and `/api/health` must succeed on the canonical domain. Require `status: ok`, the intended storage adapter, a valid catalog hash, and the original 100 seeded IDs. Extra genuine proposals are permitted. Record timestamp, deploy SHA, status and redacted health fields. Check that an unavailable backend gives a bounded JSON error rather than stack traces or a false success.
4. **Verify writes and privacy in isolated staging.** Use synthetic records and two separate browser sessions against a staging-only store. Submit a draft and version-specific amendment, reload both sessions, restart the staging service, and confirm preserved records and revision history. Confirm that an amendment stays pending review, changed revisions do not inherit old votes, private drafts are not published, and unauthenticated/moderation writes are rejected. Exercise a failed-save/retry path without duplicating a record. Keep synthetic participation out of production.
5. **Prove recovery separately.** Follow the existing [data-safety and launch runbook](../data-safety-and-launch.md). Record a completed backup of the actual authoritative store and its retention policy privately; restore into an isolated staging environment. Verify expected IDs, revisions and counts, and record restore duration and recovery point. Never restore over production or replace its volume to test recovery. Publish only the redacted result and reviewer/date.
6. **Review the release evidence.** A human reviewer checks current-head CI, exact deployment SHA, desktop/mobile save/error behavior, preview isolation, sanitized errors and the recovery result. Update the dashboard to completed only when all evidence is attached. A PR merge or green uptime request alone is insufficient.

Safe public probes:

```sh
curl --fail --silent --show-error --max-time 20 https://helioshtml.com/api/health
curl --fail --silent --show-error --max-time 20 https://helios-ai-laws.fly.dev/api/health
```

## Required evidence before completion

- [ ] Canonical production deployment SHA and successful health response recorded.
- [ ] Intended authoritative store confirmed; no unintended database split.
- [ ] Isolated two-session save, restart, revision and retry results recorded.
- [ ] Preview/private-draft and authorization checks reviewed.
- [ ] Completed backup and isolated restore drill verified; private recovery details withheld from public artifacts.
- [ ] Human reviewer and review date recorded, with current-head CI and deployment links.

Owner: project maintainer. Current next action: inspect canonical Netlify deployment/backend configuration, then complete the isolated recovery evidence.

## Post-merge addendum — November 25, 2026, 3:09 p.m. Chicago

Fresh read-only probes after [PR #75](https://github.com/adnanwahab/HeliosHTML/pull/75) was merged still found the canonical API unavailable. Health responses were dated **21:09:23 UTC (3:09:23 p.m. America/Chicago)**; Netlify deployment metadata was checked immediately afterward.

| Check | Verified result |
| --- | --- |
| Canonical homepage | HTTP 200. |
| Canonical `/api/health` | HTTP 502, still reporting missing `SUPABASE_DB_URL` and returning stack frames. |
| Fly `/api/health` | HTTP 200; `status: ok`, `storage: pglite`, `runtime: fly-machine`, `seedCount: 100`, `proposalCount: 104`. |
| Currently published Netlify deployment | [`6b045bf3586967f4843f46bc`](https://app.netlify.com/projects/heliosailol/deploys/6b045bf3586967f4843f46bc), state `ready`, context `production`. |
| Published source | [`fcd1aacb09a27b53dfc95834500f050fd19cc000`](https://github.com/adnanwahab/HeliosHTML/commit/fcd1aacb09a27b53dfc95834500f050fd19cc000), published November 23 at 15:30:11.056 UTC. |

The Netlify project response identified that deployment as the currently published site. Its source is **older than the PR #75 merge commit** `792993a8fa9509e33e7af3b09993ff2f3815cfae`. The merge therefore does not establish that the launch changes or improved error handling are running on the canonical domain. This check did not determine why the older deployment remained published.

**Item 19 remains blocked.** Verify the intended production release and authoritative backend before changing database configuration, then repeat health and staging recovery checks. A successful Fly health read still does not prove production backup/restore readiness. This addendum records observations only; no deployment, configuration, credential or participant-data changes were performed.

## Follow-up observation — November 25, 2026, 3:29 p.m. Chicago

At **21:29:43 UTC**, a fresh read-only canonical health probe again returned **HTTP 502**, reporting the missing `SUPABASE_DB_URL` and including stack frames. Netlify still identified deployment `6b045bf3586967f4843f46bc` and source `fcd1aacb09a27b53dfc95834500f050fd19cc000` as the published production release. The deploy's `locked` value was `null`; that alone does not explain why the older release is published. The license and production gates remain open after main's research/account merge and the separate branch-protection setup. Inspect publication history and confirm the intended release/store before making a configuration change.
