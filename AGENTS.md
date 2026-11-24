# Helios.AI contributor instructions

## Pull request delivery

- Put a **Deploy links** section at the very top of every PR description. For any user-facing change, the first link must be the exact changed route (including meaningful query parameters), followed by the preview homepage and the deployment/check details when available.
- Resolve the Netlify preview from the PR head commit status. Confirm it succeeded for that SHA before describing it as live. If pending, label the expected URL pending; if failed, link to the failure details and say so. Never represent a stale preview as the current commit or a PR preview as production.
- Update the description after the PR is opened and whenever the feature route or deployment status changes. Include the direct route in the final handoff to the user as well.
- Include desktop/mobile screenshots or a link to the existing visual-review capture run for UI PRs. For non-UI changes, say which checks verify the change and include the preview link if one exists; otherwise explain why it is unavailable.
- Do not change production, bypass branch protection, or merge solely to obtain a preview URL.
