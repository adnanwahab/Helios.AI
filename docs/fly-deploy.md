# Deploy Helios.AI to the existing Fly app

The live app is **helios-ai-laws**. The application runs the Node server on port 8080 and stores local PGlite data on the already-mounted volume at `/data/pglite`. **Do not destroy or replace the existing `helios_data` volume.**

The following assumes `flyctl` is installed and authenticated, and that the current directory is a freshly pulled copy of `adnanwahab/Helios.AI` on `main`.

```sh
git pull --ff-only origin main
fly auth whoami
fly config save -a helios-ai-laws
# Check the saved fly.toml contains the existing volume source and destination.
# It should include a mount for helios_data at /data and service port 8080.
fly config show -a helios-ai-laws
fly deploy -a helios-ai-laws --dockerfile Dockerfile
fly status -a helios-ai-laws
curl -fsS https://helios-ai-laws.fly.dev/api/health
```

**Important:** Fly's `config save` restores the deployed app configuration (including mounts), but may omit build-only settings. Deploy with `--dockerfile Dockerfile` to explicitly build a *new image* instead of reusing the prior image. If the saved file includes a `[build]` image setting that conflicts with the Dockerfile override, remove the old `image` field from the downloaded config before deploying; leave mounts, services, checks, and app settings unchanged. No need to run `fly launch` or create a new app.

If the Machine still fails, check fresh logs after deployment:

```sh
fly logs -a helios-ai-laws
fly checks list -a helios-ai-laws
```

Success: no new `ENOENT` messages, an HTTP 200 from `/api/health`, and passing Fly Machine checks. The logs from before the deployment remain visible and are not evidence that the new release is broken.

For persistence, `HELIOS_PGLITE_DIR=/data/pglite`, `PORT=8080`, and `HOST=0.0.0.0` are safe environment settings. The app also defaults to those values on Fly when no overriding values are supplied.

**Storage warning:** `/data/helios.sqlite` (older SQLite) and `/data/pglite` (PGlite) are different databases. A healthy API does not prove older SQLite records have been migrated. Back up the original volume and perform an explicit migration if existing data must be preserved in the new service.
