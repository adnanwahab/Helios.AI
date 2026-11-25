# Helios launch status

**14 / 22 tasks complete.** Target: December 1, 2026, subject to readiness.
Snapshot: 2026-11-25T21:31:28Z. User-facing dates use America/Chicago.

[Dashboard preview](https://deploy-preview-108--heliosailol.netlify.app/launch) · [Launch PR](https://github.com/adnanwahab/HeliosHTML/pull/108)

This file is generated from `public/launch-checklist.json`. A prepared plan does not count as an executed task. Work in this PR is available in its preview; production deployment and readiness are tracked separately.

## Establish the foundation — November 25–26

- [x] **L01: Finalize the project’s mission in one paragraph.** — Done
  A single mission now leads the README and defines who can contribute, voluntary participation, human review, and the role of simulations.
  Evidence: [Read the mission](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/README.md).

- [ ] **L02: Select an open-source license after checking third-party rights.** — Blocked
  MIT is the candidate for original code. The audit found missing provenance for bundled assets, downloaded data, and external dependencies, so a blanket license has not been applied.
  Next: Resolve the asset and data provenance inventory, preserve required notices, and approve the exact scope of the license.
  Evidence: [Rights audit](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/license-audit.md) · [License task #99](https://github.com/adnanwahab/HeliosHTML/issues/99).

- [x] **L03: Rewrite the README with screenshots, a live demo and five-minute setup instructions.** — Done
  The README now includes the mission, live demo and preview links, five-minute setup commands, and inspected desktop/mobile screenshots from the hosted capture run. Dependency installation and builds passed; screenshot progress is labeled as a dated snapshot.
  Evidence: [README](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/README.md) · [Desktop/mobile capture](https://github.com/adnanwahab/HeliosHTML/actions/runs/45698534055).

- [x] **L04: Create CONTRIBUTING.md and a code of conduct.** — Done
  Contribution and conduct guides cover developers and non-programmers, evidence, consent, review, and reporting. A private moderation contact and backup coverage remain a separately identified staffing gate.
  Evidence: [Contributor guide](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/CONTRIBUTING.md) · [Code of conduct](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/CODE_OF_CONDUCT.md).

## Make contributing easy — November 26–27

- [x] **L05: Add a prominent “Propose a change” button to the homepage.** — Done
  The homepage button opens the existing proposal workflow; the contributor hub and dashboard link to the same entry point.
  Evidence: [Homepage implementation](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/index.html) · [Button change #73](https://github.com/adnanwahab/HeliosHTML/pull/73).

- [x] **L06: Support contributions from non-programmers as well as developers.** — Done
  The contributor hub offers proposal, research, design, simulation, testing, documentation and code paths. A GitHub web-editor walkthrough requires no local development setup.
  Evidence: [Contributor hub](https://deploy-preview-108--heliosailol.netlify.app/contribute) · [No-terminal walkthrough](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/CONTRIBUTING.md#your-first-contribution-without-a-terminal).

- [x] **L07: Create 30 well-scoped GitHub issues with acceptance criteria.** — Done
  All 30 launch issues, #76–#105, are published with scoped deliverables and acceptance criteria. Existing issues were verified instead of duplicated.
  Evidence: [All launch issues](https://github.com/adnanwahab/HeliosHTML/issues?q=is%3Aissue+in%3Atitle+%22Launch%3A%22) · [Roadmap and issue index](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/contributor-launch.md).

- [x] **L08: Label beginner-friendly issues as good first issue.** — Done
  21 of the 30 launch issues have the good first issue label; larger infrastructure, modeling and rights-review tasks remain separate.
  Evidence: [Beginner-friendly issues](https://github.com/adnanwahab/HeliosHTML/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

- [x] **L09: Require automated tests, screenshots and deployment previews for relevant PRs.** — Done
  Automated unit/browser tests, desktop/mobile capture, container persistence smoke, Netlify deployment previews and current-head PR evidence are now required checks on main. All five delivery checks passed on the preceding launch head; every new head must satisfy them again.
  Evidence: [PR evidence workflow](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/.github/workflows/pr-evidence.yml) · [Review policy](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/.github/REVIEW_POLICY.md) · [PR checks](https://github.com/adnanwahab/HeliosHTML/pull/108/checks) · [Verified protection and required checks](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/branch-protection.md).

- [x] **L10: Establish human review and branch protection.** — Done
  Main branch protection was saved and reopened to verify one required approval, stale-review dismissal, latest-push approval, an up-to-date branch, all five required checks, resolved conversations and no administrator bypass. Public GitHub metadata independently confirms protection for everyone. The policy requires independent human review.
  Evidence: [Saved branch-protection receipt](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/branch-protection.md) · [Human review policy](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/.github/REVIEW_POLICY.md) · [Branch settings](https://github.com/adnanwahab/HeliosHTML/settings/branches).

## Create a community — November 27–28

- [x] **L11: Enable GitHub Discussions for ideas, questions and announcements.** — Done
  GitHub Discussions is enabled and its repository setting was verified through the GitHub API.
  Evidence: [Open Discussions](https://github.com/adnanwahab/HeliosHTML/discussions).

- [x] **L12: Create a public roadmap and contributor dashboard.** — Done
  The roadmap is paired with this 22-item dashboard, dated evidence, phase/status/search filters, task permalinks and a downloadable evidence ledger. Its completion count is derived from the records.
  Evidence: [Launch dashboard](https://deploy-preview-108--heliosailol.netlify.app/launch) · [Public roadmap](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/contributor-launch.md) · [Evidence source](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/public/launch-checklist.json).

- [x] **L13: Publish a short video demonstrating the entire contribution workflow.** — Done
  A 96-second captioned tutorial is published in this PR preview, with a transcript and capture provenance. It uses real app captures and clearly labeled GitHub/check/review instruction panels; no demonstration proposal was submitted or accepted.
  Evidence: [Watch the tutorial](https://deploy-preview-108--heliosailol.netlify.app/launch#workflow-video) · [Transcript and capture provenance](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/public/launch/contribution-workflow-transcript.md) · [Original capture run](https://github.com/adnanwahab/HeliosHTML/actions/runs/45698534170).

- [x] **L14: Define maintainer roles and how contributors earn additional responsibility.** — Done
  Governance defines contributor, reviewer, area-maintainer and release-owner responsibilities, evidence-based progression, recusal and access boundaries. It does not invent named staff or automatically grant repository access.
  Evidence: [Governance and progression](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/GOVERNANCE.md).

## Recruit founding contributors — November 28–30

- [ ] **L15: Personally invite 20–30 interested developers, designers and researchers.** — Ready to run
  An opt-in invitation and role-balanced recruitment plan are ready. No recipients were selected from private data and no invitations have been sent.
  Next: Choose 20–30 interested recipients and send personalized invitations. Record aggregate counts and voluntary responses, without publishing private contact details.
  Evidence: [Invitation and recruitment plan](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#invite-2030-founding-contributors).

- [ ] **L16: Host a one-hour introductory workshop.** — Ready to run
  A timed 60-minute agenda, preparation checklist and accessible asynchronous path are prepared. No workshop has been scheduled or held.
  Next: Choose a time, host, backup facilitator and meeting link; invite participants and hold the session.
  Evidence: [Workshop runbook](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#one-hour-introductory-workshop).

- [ ] **L17: Help each new contributor complete their first meaningful contribution.** — Ready to run
  An onboarding flow defines a small first task, a named buddy, acceptance criteria, first review and opt-in credit. No contributor completions are claimed.
  Next: Pair each person who opts in with a willing mentor and link the accepted contribution as it is completed.
  Evidence: [Onboarding process](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#first-contribution-support).

- [ ] **L18: Respond to new issues and pull requests within 24 hours.** — In progress
  A twice-daily assistant triage task is scheduled around 9 a.m. and 9 p.m. Chicago time, with substantive GitHub replies, duplicate prevention and human escalation. The response target and primary/backup process are documented; sustained 24-hour compliance is not yet measured.
  Next: Assign human primary and backup owners, inspect first-response metrics, and escalate decisions that require independent human review.
  Evidence: [Triage and response target](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#24-hour-response-process).

## Public launch — December 1 target

- [ ] **L19: Verify production reliability, privacy and data persistence.** — Blocked
  Fresh checks at 3:29 p.m. Chicago on November 25 still found canonical API health 502. Netlify is publishing an older November 23 source, not the new merges. Fly health and isolated persistence checks pass, but canonical readiness and production recovery remain unverified.
  Next: Verify the deployed version and intended authoritative store, repair production API configuration, and complete an isolated privacy, persistence and backup-restore drill.
  Evidence: [Production audit and recovery gates](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/production-readiness.md) · [Data safety runbook](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/data-safety-and-launch.md).

- [ ] **L20: Publish on Hacker News, relevant Reddit communities and social media.** — Ready to run
  Truthful launch copy and destination-specific posting guidance are prepared. Public promotion is held behind the license and production-readiness gates; no external launch posts are claimed.
  Next: Clear the launch gates, select permitted communities and the publishing accounts, then post and record each public URL.
  Evidence: [Public launch kit](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#public-launch-publication-kit).

- [ ] **L21: Run the first public collaborative law-design experiment.** — In progress
  The first asynchronous public experiment is open on GitHub with exact draft BH-PILOT-v1, an objection/evidence template, two revision rounds and voluntary participation. Opening the issue does not establish participant activity or agreement. A round-one synthesis is scheduled for November 30 morning, with human review required before round two.
  Next: Invite willing participants to issue #107, review real round-one responses by November 29 at 6 p.m. Chicago time, and publish a reviewed revision and outcome without inventing participation.
  Evidence: [Join the public experiment #107](https://github.com/adnanwahab/HeliosHTML/issues/107) · [First experiment runbook](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#first-public-collaborative-law-design-experiment).

- [x] **L22: Publish weekly progress, accepted contributions and upcoming challenges.** — Done
  The initial public progress report is published with the merged foundation, pending follow-up work, verified accomplishments, unresolved gates and next challenges. Future factual reports are scheduled for Monday mornings around 9 a.m. Chicago time, starting November 30.
  Evidence: [Published progress report #109](https://github.com/adnanwahab/HeliosHTML/issues/109) · [Weekly progress template](https://github.com/adnanwahab/HeliosHTML/blob/feat/contributor-launch/docs/launch/community-operations.md#weekly-progress-update).

## Update the dashboard

1. Change the task record in `public/launch-checklist.json`, including evidence and the next action.
2. Use `done` only after the stated outcome happened; provide `completedAt` and an inspectable evidence URL.
3. Update `updatedAt` and run `bun run launch:sync`.
4. Run `bun --no-env-file test test/launch-dashboard.test.js` and include the updated status in the PR.

Role labels name the responsible function; they are not claims that volunteers have accepted assignments. Do not include private contact lists, credentials, or private journal content.
