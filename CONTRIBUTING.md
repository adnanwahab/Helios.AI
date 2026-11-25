# Contributing to Helios AI

Welcome. Helios is a voluntary civic research workshop, not an official government. We want helpful contributions from people with and without programming experience.

## Choose your first task

1. Visit [the contribution hub](https://helioshtml.com/contribute) and [open issues](https://github.com/adnanwahab/HeliosHTML/issues). Read the [launch roadmap](docs/contributor-launch.md).
2. Pick a small task, especially one labeled `good first issue`, and comment with your intended approach. Coordinate with maintainers before overlapping work. For new work, open an issue or use the homepage proposal form.
3. Non-code contributions can be a source-backed research brief, a policy revision, a design mockup, a bug report, a documentation correction, or a model critique. Link to sources and identify uncertainty.
4. For code, use a branch, keep the diff focused, and open a pull request against `main`. Include the issue, why the change helps, how to verify it, and known limitations.
5. Respond to feedback and revise. A maintainer reviews before merging; reviews are not a guarantee of acceptance.

## Local development

Install Node.js 22+ and Bun 1.3+ (CI uses 1.4.2). Use a local clone; after licensing terms are clarified, fork or branch according to the repository's contribution rules. Use only code and assets you have the right to submit.

```sh
git clone https://github.com/adnanwahab/HeliosHTML.git
cd HeliosHTML
bun install --frozen-lockfile
bun run dev
# http://127.0.0.1:3000/contribute
```

Leave `SUPABASE_DB_URL` unset for local PGlite. Never copy production credentials or real participant records. Keep changes and testing isolated from production; see [data safety](docs/data-safety-and-launch.md).

```sh
bun --no-env-file test
bun run build
bunx playwright install chromium
CI=1 bun run test:browser
```

On CI the browser suite installs Chromium and uses isolated temporary storage. For a static GitHub Pages build use `node scripts/build-pages.mjs`.

## Review and acceptance

- Prefer small, independently reviewable PRs. Coordinate schema changes or shared files in the issue.
- State assumptions, evidence and limitations. Synthetic votes must remain visibly separate from actual participant responses. Do not promise government action or consensus.
- Preserve keyboard access, readable contrast, mobile layouts and accessible descriptions.
- Add relevant tests. Include exact preview route and status tied to the current commit plus desktop/mobile screenshots or the capture artifact for UI changes. Follow [AGENTS.md](AGENTS.md) and the [visual-review guide](docs/pr-visual-previews.md).
- Never bypass required review or checks. Maintainers should keep human judgment in the loop, particularly for data, security and policy changes.
- Do not post private journals, personal identifiers, secrets or unpublished participant data. Public GitHub issues and PRs are public.
- Disclose material AI-generated content and verify sources, code and claims. Do not submit automated votes or impersonate participants.

## License and attribution

Licensing and third-party asset provenance require maintainer review before an open-source release. Public visibility is not a grant of redistribution rights. Submit only work you have permission to contribute, and identify third-party material and its terms. Do not assume a project-wide license until the maintainer publishes one.

We aim to acknowledge accepted contributions in release notes, with opt-in public attribution. Follow our [code of conduct](CODE_OF_CONDUCT.md). The [roadmap](docs/contributor-launch.md) describes proposed roles, milestones and launch gates, not promises of employment or authority.
