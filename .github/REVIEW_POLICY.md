# Human review and delivery evidence

Every change to `main` goes through a pull request. The author supplies a direct
feature preview, the preview homepage, relevant tests, and desktop/mobile visual
evidence for user-facing changes. Reviewers assess behavior, clarity, privacy,
accessibility, and the strength of the evidence. Generated policy language and
simulation outputs remain proposals, not enacted laws or real public consent.

The `evidence` workflow verifies the PR description and current-head backend,
browser, visual-capture, and Netlify results with a read-only token. It waits for
the other workflows and reruns when the PR description changes. Forks need no
repository secrets. This check never approves, merges, changes access, or runs
privileged PR code. Link the current visual-capture run in the PR so its screenshots can be traced
to the checked head. A screenshot of an old revision does not verify a new one.

## Repository settings

Configure protection for `main` with at least one independent approving human
review, dismissal of stale approvals, approval of the latest reviewable push,
resolved conversations, and an up-to-date branch. Required checks are `verify`,
`capture`, `fly-image`, `netlify/heliosailol/deploy-preview`, and `evidence` once
that workflow is available. Keep force pushes and branch deletion disabled.
Apply the protection to administrators and leave bypass lists empty.

This policy file and workflow do not enable GitHub branch protection themselves.
The launch dashboard records the observed settings separately. Contributors
must not self-approve or bypass checks to obtain a preview. Production deployment
and merge decisions remain with authorized human maintainers.

## Review order

1. Confirm the issue's acceptance criteria and the change's scope.
2. Open the direct feature preview and compare the screenshots on desktop/mobile.
3. Review relevant tests and current-head CI. Check error and empty states.
4. Check consent, private data handling, source attribution, and simulation labels.
5. Resolve conversations and record an independent approval when ready.

Maintainers aim to acknowledge new contributions within 24 hours. A scheduled
queue report can surface overdue work, but acknowledgement and useful review
must actually happen before they count as completed.
