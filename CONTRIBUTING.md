# Contributing to Helios AI

Helios welcomes useful contributions from people with and without programming experience. Start with a small problem you understand, explain the evidence, and leave the work easier for the next person to review.

## Your first contribution without a terminal

1. Open the [contribution hub preview](https://deploy-preview-75--heliosailol.netlify.app/contribute) and choose research, design, testing, documentation, or code. After the launch PR is deployed, the same route is `/contribute` on the main site.
2. Pick a [good first issue](https://github.com/adnanwahab/HeliosHTML/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Read its acceptance criteria and existing comments. Add a short comment describing what you plan to do so others can coordinate.
3. Put your work in a comment or attachment when that fits the task: a source table, a sketch, a screenshot with reproduction steps, or suggested wording is welcome. Keep private participant information out of public GitHub records.
4. To propose a new idea, use **Propose a change** on the homepage. Review the public text and follow the GitHub option to its file editor. A GitHub account is needed to submit there; a Helios account and local development setup are not required. The Netlify preview does not send to the private production inbox.
5. Request review on the linked issue or PR. A maintainer should acknowledge it within 24 hours, give a concrete next step, and credit the accepted contribution using your preferred public name if you opt in.

A good first contribution is complete when it meets the issue's acceptance criteria and a human reviewer accepts it or explains the remaining work. An automated response, a simulated vote, or merely opening a PR is not a merge or approval.

### Choose an output you can finish

| Contribution | A reviewable output |
| --- | --- |
| Research | One claim, primary sources, publication dates, jurisdiction, and uncertainty. |
| Policy revision | Exact draft/revision, a strong objection, proposed wording, and remaining trade-offs. |
| Design | One screen or flow, intended user action, accessibility considerations, and a visual. |
| Testing | Exact route, browser/device, steps, expected behavior, actual behavior, and redacted screenshot. |
| Documentation | A specific correction or a setup walkthrough with observed results. |
| Code | Focused diff, relevant tests, exact preview route, and an explanation of the resulting behavior. |

## Local development

Install Git, Node.js 22+, and Bun 1.3+ (CI requests Bun 1.4.2). Use only code and assets you have the right to submit.

```sh
git clone https://github.com/adnanwahab/HeliosHTML.git
cd HeliosHTML
bun install --frozen-lockfile
bun run dev
```

Open `http://127.0.0.1:3000/`. To review the launch dashboard before merge, switch to `feat/contributor-launch` and open `/launch`. The setup target is five minutes after prerequisites are installed; download time varies.

In a fresh shell, leave `SUPABASE_DB_URL` unset to use local PGlite in `.data/pglite`. Do not copy production credentials or participant records. Check the [data-safety guide](docs/data-safety-and-launch.md) before a persistence, migration, or deployment change.

```sh
bun --no-env-file test
bun run build
bunx playwright install chromium
CI=1 bun run test:browser
```

The browser suite uses its own temporary database and port 3101. CI installs Chromium and Linux dependencies; a local machine may need Playwright's supported system dependencies. For a static GitHub Pages build, use `node scripts/build-pages.mjs`.

## Review and acceptance

Open a focused PR against `main`, link the issue, and explain the problem, change, verification, and limitations. Describe any material AI assistance and verify its output. Human review remains the decision point.

For changes that affect users:

- Put **Deploy links** at the top of the PR. Link the exact changed route first, then the preview homepage and deployment/check details.
- State whether the deployment succeeded for the current head SHA. A previous successful preview is not evidence for a new commit.
- Include desktop and mobile screenshots or a link to the visual capture artifact. Explain what the screenshots demonstrate.
- Include meaningful tests for changed behavior. A simple wording correction can use focused inspection; a storage or authorization change needs tests for its actual risks.
- Preserve keyboard access, readable contrast, mobile layouts, and accessible status explanations.

For every change, follow [AGENTS.md](AGENTS.md) and the [visual-review guide](docs/pr-visual-previews.md). Do not bypass required review, branch protection, or checks. Report failing checks honestly. Production deploys are a separate operator action and must preserve existing storage.

### Research and simulation review

Name the exact proposal revision, source, model version, population, seed, and assumptions when relevant. Distinguish editorial drafts, synthetic responses, browser practice, and actual participant contributions. State unresolved objections; a high simulated support score is not a representative poll or real consent. Do not execute arbitrary code supplied in an issue or model output.

### Feedback and disagreement

A useful review identifies the relevant acceptance criterion, explains an observed problem, and suggests a verifiable next step. Authors may ask for the evidence, propose an alternative, or request a second reviewer. Conflicted reviewers should recuse themselves. The [governance guide](GOVERNANCE.md) covers decisions and appeals; the [code of conduct](CODE_OF_CONDUCT.md) covers behavior and sensitive reporting.

## License, privacy, and attribution

Helios code, tests, scripts and documentation are licensed under [AGPL-3.0-or-later](LICENSE). Policy text, meaning goals, bills, acts, moonshots and public proposals, is dedicated to the public domain under [CC0 1.0](LICENSE-CC0). The [README](README.md#licensing) lists exactly what each license covers and what is excluded.

By submitting a contribution, you agree to license code and documentation under AGPL-3.0-or-later and to dedicate policy wording under CC0 1.0, and you confirm that you have the right to do both. Third-party material keeps its own terms: name its source and license in your PR, and include it only if those terms allow redistribution here. A proposal sent by email is added to the repository only after its sender agrees to these terms.

Never post private journals, secret keys, contact lists, unpublished participant data, or unredacted personal details in public issues, PRs, screenshots, or recordings. Use fictitious examples for walkthroughs. Accepted contributors may opt into public credit; declining credit does not affect review.

## How to take on more responsibility

See [GOVERNANCE.md](GOVERNANCE.md) for contributor, reviewer, area maintainer, release maintainer, and moderation roles. Additional responsibility follows demonstrated work, consent, and a documented human decision; contribution counts do not grant access automatically. See the [operations kit](docs/launch/community-operations.md) for onboarding and the 24-hour response process.
