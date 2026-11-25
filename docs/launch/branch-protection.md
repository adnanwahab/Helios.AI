# Main branch protection — verified November 25, 2026

**Status: enabled.** The rule for `main` was saved in GitHub and its persisted settings were reopened and checked at approximately **3:23 p.m. America/Chicago (21:23 UTC)**. GitHub displayed “Branch protection rule created.” A separate public branch-metadata read at approximately **3:29 p.m. Chicago (21:29 UTC)** confirmed `protected: true`, enforcement for `everyone`, and the five required check contexts below.

## Saved settings

| Setting | Verified value |
| --- | --- |
| Branch name pattern | `main` |
| Pull request required before merging | Enabled |
| Approving reviews required | 1; the repository review policy requires an independent human reviewer |
| Dismiss stale approvals when new commits are pushed | Enabled |
| Approval of the most recent reviewable push | Required |
| Status checks before merging | Required |
| Branch must be up to date before merging | Required |
| Review conversations | Must be resolved |
| Bypass of the above requirements, including administrators | Not allowed |
| Force pushes | Not allowed |
| Branch deletion | Not allowed |

## Required check contexts

| Check | Purpose |
| --- | --- |
| `verify` | Unit/browser verification and repository consistency checks |
| `capture` | Desktop/mobile visual capture |
| `fly-image` | Container build and isolated restart/persistence smoke test |
| `netlify/heliosailol/deploy-preview` | PR deployment preview |
| `evidence` | Current-head preview, test and visual evidence in the PR description |

GitHub branch metadata tied the four Actions contexts to GitHub Actions (`app_id: 15368`) and the deployment context to Netlify (`app_id: 13473`). The observed main SHA was `f8199008b15821f48ca93df3ad138cd1e05408ba`.

## Evidence and limits

- [Repository branch settings](https://github.com/adnanwahab/HeliosHTML/settings/branches) — the saved rule was reopened in the authenticated UI. Repository administration access may be required to view it.
- [Public main-branch metadata](https://api.github.com/repos/adnanwahab/HeliosHTML/branches/main) — reports protection and required status contexts; this is a live endpoint and can change.
- [Human review policy](../../.github/REVIEW_POLICY.md) — review order, independent approval, and delivery evidence expectations.
- [Launch PR checks](https://github.com/adnanwahab/HeliosHTML/pull/108/checks) — results for the current launch PR head.

The integration cannot read the full `/branches/main/protection` administration endpoint. The detailed review settings above were verified in GitHub's saved UI; the public metadata independently confirms protection and status contexts. No credentials or private account details are recorded here.

The earlier re-authentication blocker is resolved. This receipt records that the rule is enabled; it is not an approval of PR #108, a merge, a production deployment, or proof of production recovery. Each new PR head still has to satisfy the required checks and receive independent human review.
