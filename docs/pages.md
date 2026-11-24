# GitHub Pages: static HELIOSAI preview

This repository includes a GitHub Actions workflow at
.github/workflows/pages.yml. It builds a static mirror of the HTML demos
on every push to main, and can also be run manually.

## Enable it on this repository

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open **Actions → Deploy static preview to GitHub Pages → Run workflow**
   if a new push has not already triggered it.
4. When deployment succeeds, the expected site URL is
   https://adnanwahab.github.io/Helios.AI/.

## If you fork this repository

A fork **does not automatically receive a published website**. GitHub
disables Actions on forks by default. On your fork:

1. Open **Actions**, and enable GitHub Actions for your fork.
2. Open **Settings → Pages**, and choose **GitHub Actions** as the source.
3. Run the **Deploy static preview to GitHub Pages** workflow manually,
   or push a commit to main.

The fork's site will be at https://YOUR-USERNAME.github.io/REPO-NAME/
unless you set a custom domain. Every subsequent push to main will
automatically deploy the fork's latest HTML demo.

## What is and is not hosted

GitHub Pages serves only static files. The workflow runs
node scripts/build-pages.mjs to copy the HTML demos and public assets,
replace Bun-only iframe URLs with relative links that work at a subpath,
and generate an external link for the YC Research proxy tab.

The static Pages version **does not run Bun, SQLite, server-side proxy
routes, email subscription delivery, or persistent proposal/amendment
writes**. Demo pages may show browser-local or bundled sample data.
The static preview's header explicitly links to the hosted app for
backend-dependent interactions. It never packages source credentials,
the SQLite database, or the server into the Pages artifact.

For the fully functioning version, use the Fly/Netlify deployment
described in docs/backend.md.

## How the workflow runs

The workflow has two jobs. **Build GitHub Pages preview** runs
node scripts/build-pages.mjs, configures Pages and uploads dist-pages
as the github-pages artifact. **Deploy GitHub Pages** runs after it and
publishes that artifact with actions/deploy-pages.

Keep the deploy in its own job. When it ran in the build job, it looked
for the artifact a fraction of a second after the upload and sometimes
failed with "No artifacts named github-pages were found", even though
the artifact existed. test/pages-build.test.js checks the two-job layout.
If a deploy still fails, re-run the failed jobs from that Actions run.
