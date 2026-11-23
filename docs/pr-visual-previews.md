# Visual previews for Helios.AI pull requests

Every open or updated PR receives an automatically maintained **HeliosAI visual review** comment:

- A direct link to its Netlify deploy preview.
- An inline **desktop screenshot** of the built homepage, plus expandable **mobile** and **Mail · Resend** screenshots.
- The exact PR head commit used for the screenshots and a link to the CI run and downloadable artifacts.

The screenshot and deployment are deliberately separate: the screenshot is generated
locally from the PR's merged source without production credentials, and the
deploy URL comes from the commit's Netlify preview status. If Netlify has not
confirmed deployment, the comment labels the expected preview URL as pending.

## How it works

1. **Helios PR Screenshot** (`.github/workflows/pr-visual-capture.yml`) runs on
   `pull_request` events with read-only permissions. It builds the current PR,
   starts an isolated PGlite-backed dev server, and uses Playwright/Chromium
   to render `desktop.png`, `mobile.png`, and `mail.png`.
2. The capture workflow always uploads an artifact (including the PR number
   and head SHA, even if rendering fails).
3. **Helios PR Preview Comment** (`.github/workflows/pr-visual-publish.yml`)
   runs only from the default branch after the capture run finishes. It checks
   the artifact against the current PR, publishes validated PNGs to the
   dedicated `pr-visual-assets` branch, and creates or updates a single
   marked comment on the PR. The separate branch keeps generated screenshots
   out of `main` and out of the deployed HTML build.
4. On subsequent pushes, the same comment is updated, rather than adding
   another comment for each commit.

### Refresh an older PR

In **Actions → Helios PR Screenshot → Run workflow**, enter its PR number.
This is also a way to refresh if the Netlify status was previously pending.
The manual capture checks out the trusted current `main` capture tooling and
screenshots the existing Netlify deploy preview for that PR, even when the
older PR branch does not contain the latest scripts. This workflow still has
read-only permissions. It requires a successful Netlify preview status and
never requests a maintainer token or unlocks an inbox.

## Security and operational limits

- Never run PR code in the privileged publishing workflow. It uses trusted
  scripts from `main` and treats downloaded screenshots as untrusted data.
- The capture runner gets **no Resend API key, Supabase production database,
  Helios admin token, or other production secrets**. The mail screenshot only
  depicts the intentionally locked operator interface.
- The publishing job checks the current PR number, head SHA and source
  repository before accepting automatic PR artifacts. Outdated captures are
  skipped. PNG signature and maximum file size are checked before publication.
- `GITHUB_TOKEN` needs repository `contents: write` and `issues:
  write`/`pull-requests: write` permissions in the publishing workflow;
  organization restrictions may require an administrator to allow these.
- Netlify must have **Deploy Previews** enabled for the PR. A pending
  expected URL is not proof the deployed preview is ready, and a screenshot
  does not prove server-side APIs, mail sending, or inbound webhook behavior.
- Fork PRs may require approval before their unprivileged capture Actions run.
- Images on `pr-visual-assets` remain available after merge so historic PR
  discussions keep working. If they accumulate, consider retention/cleanup.

To troubleshoot, check the two corresponding Actions runs and the Netlify
deploy preview status. A failed capture still produces a PR comment when its
identification artifact is available.
