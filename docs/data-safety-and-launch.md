# HeliosAI: data safety and first participant launch

This guide is for the live Fly app `helios-ai-laws`. The only persistent database currently confirmed by `/api/health` is `pglite` on the Fly volume `helios_data` at `/data/pglite`.

## 1. Inspect and capture a database-volume snapshot

Fly generally takes daily volume snapshots with five-day default retention, **but check this particular volume**; never assume a snapshot exists or is restorable. Snapshots can lag behind the newest writes and the one-volume, one-Machine deployment is not replicated.

From your Mac (requires authenticated `fly` CLI):

```sh
fly volumes list -a helios-ai-laws
# Copy the exact existing ID whose name is helios_data; never create/destroy a replacement.
bash scripts/fly-volume-snapshot.sh vol_YOUR_ID list
# To request a manual snapshot of that same volume (optional, confirms interactively):
bash scripts/fly-volume-snapshot.sh vol_YOUR_ID create
```

A snapshot request is asynchronous: use `list` again and verify a new entry reaches a completed/created state. Keep the snapshot ID and UTC time in a private operations log. Snapshots can incur storage charges. **Do not overwrite or attach a restored snapshot to the production Machine.**

Before you trust recovery, perform a separate **staging restore drill** into a new volume and a different app. Verify the restored database reads correctly and matches the expected proposal count. Never test recovery on production, and never copy a live PGlite data directory while another process is writing to it.

A Fly snapshot is not the same as a separately stored, restorable database export. For critical public participation records, add encrypted independent off-platform backups and rehearse restores before you scale up. Keep backups private: proposals, email subscriber records, and sessions can contain sensitive information.

## 2. Test without contaminating real participation

GitHub's `Helios Fly image smoke` job builds the production image and uses a temporary isolated `/data` Docker volume. It creates one **local-only** draft and one unreviewed amendment, restarts Docker, and verifies both persisted unchanged. The script refuses any non-loopback host:

```sh
node scripts/smoke-local-proposal.mjs create http://127.0.0.1:18080
```

Do **not** POST synthetic ballots, proposals, or amendments to `https://helios-ai-laws.fly.dev`. Production health checks and participant walkthroughs should use read-only GET requests.

Manual participant walkthrough (desktop and mobile):

1. Open `/` and choose **New here? Start here**; confirm the guide loads and links work.
2. Open `/laws`, search by topic and inspect one of the 100 original editorial drafts. It is **not** an enacted law.
3. Record a **private demo position** (Support, Unsure, Oppose) and a note; reload to confirm it remains only in the browser. Check that these controls are never counted as public votes.
4. Open the editor and inspect the mandatory fields, public-submission notice, safeguards, and cancellation. **Do not publish test content on production.**
5. Use a staging database to submit a proposal, submit an amendment based on its version, and verify review history; verify an amendment does not automatically become accepted.
6. Verify the external Civic Synthesis link is labeled **advisory, not binding**, and that a first-time visitor can leave without creating an account or giving an email address.

## 3. Welcome participants responsibly

The new `/welcome` guide invites reading first, careful disagreement second, and optional public contribution third. The app does not claim to be a government election, and it does not tally browser demo stances as votes.

Send invitations only to people who have opted in or who you already have an appropriate relationship with. A good invitation should link directly to `/welcome` and explain that opinions are voluntary, public proposals require care, and private demo notes stay in the visitor's browser. Do not upload private journals or contact lists for outreach without permission.

## 4. Keep production stable

The app's 1 GB RAM configuration is protected by `scripts/deploy-fly-safe.sh`; use it from a clean Helios repository checkout with the existing Fly config (including the mount) saved in `fly.toml`. Verify the existing `helios_data` mount and port `8080` before every deploy. Never remove that volume to "fix" the app.

Check the live health endpoint: `https://helios-ai-laws.fly.dev/api/health`. Expect `status=ok`, `storage=pglite`, `runtime=fly-machine`, and `seedCount=100`. Proposal count may grow beyond 100 as real submissions arrive. An existing hourly uptime check handles availability alerts, **not backup integrity**.

Fly volume guidance: https://fly.io/volumes/
PGlite data-dir API: https://pglite.dev/docs/api
