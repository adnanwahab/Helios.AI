# Persistent shared goals

Helios.AI owns this database and the `helios-global-agreements-100` collection. It seeds the exact 100 HGA editorial records from the existing page, preserving HFL source references. No Civic Synthesis votes, records, receipts or repository identities are migrated or overwritten. The user-facing library contains proposals, not enacted laws or evidence of public consensus.

Bun serves the existing HTML plus `/api/catalog`, `/api/laws`, `/api/laws/:id` and `/api/session`. New proposals receive HGP UUID IDs. Existing HGA IDs are immutable. Each canonical text has a numbered immutable revision and UUID. Amendments store their base version UUID, full proposed text, reason and status separately. Submission does not replace the current text. Maintainer acceptance appends a revision transactionally, preserving the original and history. A stale base is rejected with409; review the newer text before resubmission. New content cannot change source IDs, collection identity or legal/vote status.

Browser sessions are pseudonymous, not verified civic identities. HttpOnly/SameSite cookies and a session-bound CSRF token protect writes; production cookies are Secure. JSON/size/field bounds, exact Origin checks, persistent submission limits and idempotency receipts apply. The editor warns that submissions are public and retains text after failure. Existing local demo stances/notes stay local and are never silently uploaded. No vote/approval quorum or automatic civic adoption is introduced.

## Fly and Netlify

`helioshtml.com` currently uses Netlify. `netlify.toml` proxies `/api/*` to the dedicated `helios-ai-laws` Fly application over HTTPS; the frontend uses relative same-origin API requests. `/laws` opens the existing 100-goal page. Deploying Fly alone cannot install the Netlify proxy; the frontend configuration must also be published through the site's normal Git deployment. No domain/DNS change is required.

Fly runs one shared CPU/512MB machine in ord, with SQLite WAL/full synchronous commits at `/data/helios.sqlite` on the1GB `helios_data` volume. Do not scale this SQLite app across machines with separate volumes: those files do not replicate. The process drops to Bun's unprivileged user after setting volume-directory ownership. Static serving uses an explicit allowlist; DB, secrets, Git and source code are not served by Bun. Catalog bootstrap is transactional/idempotent and refuses a changed source catalog without a reviewed migration.

Commands from this checkout:

```sh
bun --no-env-file test
fly apps create helios-ai-laws --org personal
fly volumes create helios_data --app helios-ai-laws --region ord --size 1 --yes
fly deploy --app helios-ai-laws --ha=false --strategy immediate
```

A maintainer with authenticated Fly SSH access can accept a reviewed amendment directly, without any secret in browser code:

```sh
fly ssh console --app helios-ai-laws --command "bun scripts/accept-amendment.js HGA-002 AMD-actual-amendment-id"
```

This is a trusted-shell action; the public UI only proposes amendments. The same transaction/history/stale-base checks apply.

For an optional HTTP maintainer integration, set `HELIOS_ADMIN_TOKEN` from your secret manager using `fly secrets import`; do not put it in source, browser code, logs or shell arguments. Without it, proposals and amendments work, but canonical amendment acceptance returns503 and remains fail-closed. A maintainer acceptance request needs the usual browser session/cookie/CSRF headers plus `Authorization: Bearer <token>` at `POST /api/laws/:id/amendments/:amendmentId/accept`. This publishes an editorial revision only, never an enacted law or official vote. No private journal text is imported.

A dedicated volume survives app restarts/deployments but is not high availability. Fly snapshots are configured for14days; also create an application-consistent off-machine backup, rather than relying only on snapshots. On the machine:

```sh
bun scripts/backup.js /data/backups/unique-backup-name.sqlite
```

The backup command uses SQLite VACUUM INTO and validates integrity, refusing missing sources or overwrite. Copy backups to an operator-controlled separate destination; a backup retained only on the same volume is not disaster recovery. Restore first into a separate offline test DB and verify counts/history before a human schedules a stopped-app restore. Never replace live DB files while the app is writing. No destructive reset/restore HTTP endpoint exists.

## API writes

Create a session with `GET /api/session`. Send its cookie, `X-CSRF-Token`, a unique UUID `Idempotency-Key`, JSON content type and same-origin Origin with submissions. `POST /api/laws` accepts title, category, sharedGoal, illustrativeLocalOption, risksAndSafeguards and suggestedMeasures. `POST /api/laws/:id/amendments` accepts baseVersionId, reason and a proposal object containing those fields. Replaying the same submission key/body returns the same receipt; reusing that key for another body returns409. GETdetail exposes canonical text, versions and proposed amendments, never session credentials.
