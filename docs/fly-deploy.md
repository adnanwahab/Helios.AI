# Deploy Helios.AI to the existing Fly app

The live app is **helios-ai-laws**. It listens on port 8080 and uses the existing Fly volume **helios_data** mounted at `/data` for PGlite data at `/data/pglite`. **Do not delete or replace that volume.**

## Keep the Docker build context small

**The build context is the first positional directory in `fly deploy`, not necessarily the directory where the Dockerfile lives.** Docker reads `.dockerignore` from the *context root*. If you run `fly deploy` from `~/Documents/GitHub`, it can upload other repositories and local files, and the `.dockerignore` inside `Helios.AI` won't apply.

Helios uses an allowlist in the repository's `.dockerignore`, so the context includes only production HTML, `public/`, `src/`, `scripts/`, `data/catalog.json`, `netlify.toml`, and the package/build files. Local `node_modules/`, test outputs, cloned projects, large datasets, secrets and databases are excluded.

Start from a **clean checkout** of `adnanwahab/Helios.AI`. If an existing local branch cannot fast-forward, do not reset or delete local changes; clone to a separate folder instead.

```sh
# A fresh checkout avoids local branch conflicts and nested repositories.
REPO="$(mktemp -d "$HOME/Helios.AI-deploy.XXXXXX")"
git clone --depth 1 --branch main https://github.com/adnanwahab/Helios.AI.git "$REPO"
cd "$REPO"
pwd
git rev-parse --show-toplevel
test -f Dockerfile && test -f .dockerignore && test -f netlify.toml && echo "Correct Docker context"
```

If you already have a clean checkout, you can `cd` directly into its repository root instead of cloning again. **Before deploying, `pwd` and `git rev-parse --show-toplevel` must point to the same HeliosAI repository root**. The `test` line must print `Correct Docker context`; otherwise, stop.

## Preserve Fly config and deploy

```sh
fly auth whoami
fly config save -a helios-ai-laws
# The safe deploy wrapper will pin the 1 GB VM setting before deployment.
fly volumes list -a helios-ai-laws
fly config show -a helios-ai-laws
```

Review `fly.toml`: it must preserve the existing `helios_data` mount at `/data` and the HTTP service's `internal_port = 8080`. The memory pinning helper (also called by `scripts/deploy-fly-safe.sh`) **fails closed** if those values are missing or multiple VM blocks are present. It edits only VM memory to `memory_mb = 1024`, keeping other Fly config fields intact and saving a private local backup. The repo intentionally does not track the actual `fly.toml` because it must be downloaded from the running app. **Run the helper before every future deploy** so an older saved `512 MB` VM setting cannot silently come back. `fly config save` may omit build-only settings. If the saved `[build]` stanza pins an old `image` that conflicts with Dockerfile builds, remove only that `image` field; leave mounts, services, checks and the app name unchanged.

```sh
# This wrapper pins memory, selects the repository as Docker build context,
# checks old build-image settings, and verifies health after deploying.
bash scripts/deploy-fly-safe.sh
```

Expect a small build context, a healthy listener on `0.0.0.0:8080`, passing checks, and HTTP 200 from `/api/health`. Health now reports the actual database adapter (`pglite` or `supabase-postgres`) and actual runtime (`fly-machine`, `netlify-functions`, or `node-server`), not hardcoded labels. With the PGlite Fly configuration in this guide, expect `"storage":"pglite"` and `"runtime":"fly-machine"`. A successful health check also queries the catalog from the database.

**Important:** A small Docker upload is not itself a cure for an existing Fly VM/Machines API timeout, old unhealthy Machine, or a Node.js out-of-memory crash. If an image builds successfully but the Machine replacement times out, check `fly machine status 8e7dd9c7600938 -a helios-ai-laws`, `fly scale show -a helios-ai-laws`, `fly volumes list -a helios-ai-laws`, and new logs before making further changes. Increasing RAM may be needed for PGlite, but preserve the attached volume. Do not repeatedly change secrets to fix a crashing image.

If the Machine still fails, collect fresh logs and checks:

```sh
fly logs -a helios-ai-laws
fly checks list -a helios-ai-laws
```

For persistence, `HELIOS_PGLITE_DIR=/data/pglite`, `PORT=8080`, and `HOST=0.0.0.0` are safe environment settings. The app also defaults to those values on Fly when no overriding values are supplied.

**Storage warning:** `/data/helios.sqlite` (older SQLite) and `/data/pglite` (PGlite) are different databases. A healthy API does not prove older SQLite records have been migrated. Back up the original volume and perform an explicit migration if existing data must be preserved in the new service.

## Deploy with GitHub Actions (manual, guarded)

The repository has a manual workflow, [Deploy HeliosAI to Fly (manual)](https://github.com/adnanwahab/Helios.AI/actions/workflows/fly-deploy-manual.yml), which uses the existing safe deployment wrapper. It never automatically deploys a PR or a push.

Prerequisite: authorize GitHub to deploy **only** the existing `helios-ai-laws` app. From a trusted computer where `flyctl` is logged in:

```sh
fly tokens create deploy -a helios-ai-laws -x 720h
```

Put the resulting token into **GitHub → adnanwahab/Helios.AI → Settings → Secrets and variables → Actions → New repository secret**, named `FLY_API_TOKEN`. Do not commit it, paste it into issues/chats, or place it in the repository. Rotate the token before expiration. Without that secret, the workflow fails before performing any deployment.

Run **Actions → Deploy HeliosAI to Fly (manual) → Run workflow**, selecting `main`. The workflow:

1. Requires `main` and the Fly deploy token.
2. Reads the running app's actual Fly config and persistent `helios_data` volume. If the expected `helios_data:/data` mount or port 8080 is missing, it refuses to deploy.
3. Pins the VM to 1024 MB using `scripts/pin-fly-memory.mjs`, preserving the other configuration.
4. Records the live PGlite health and proposal count before deploying.
5. Deploys from a clean GitHub checkout using `scripts/deploy-fly-safe.sh`. It does **not** remove/recreate the Fly volume or run database migrations.
6. Checks the volume still exists, the health endpoint is OK, the proposal count has not decreased, and the latest participant welcome page and optional WebGPU screening UI are served publicly.

The Fly app is a stateful service. Keep this workflow manual unless an explicit change-management decision allows production deployments on each push. A healthy API and unchanged proposal count are useful smoke checks but are **not** a complete database backup or substitute for tested restores.
