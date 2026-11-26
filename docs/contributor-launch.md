# Founding contributor launch

The [live launch dashboard](https://deploy-preview-108--heliosailol.netlify.app/launch) and [versioned evidence ledger](launch/STATUS.md) carry the current status of all 22 launch tasks. The gates below describe the release requirements, including work that still awaits review and merge.

Target: ten active human contributors by the December 1, 2026 pilot, then 25 by December 7, 50 by December 14 and 100 by January 1, 2027. These are aspirational milestones, not forecasts or current counts.

## Launch gates

- [ ] Maintainer confirms mission, project scope and asset provenance; chooses and publishes a license only after rights review.
- [ ] Contributor guide, conduct rules, issue templates, and contribution hub reviewed and merged.
- [ ] Publish a private moderation contact and backup reviewer.
- [ ] Confirm GitHub Discussions or an equivalent public forum and human review rules. Protect main with required CI and appropriate maintainer review; do not bypass existing checks.
- [ ] Confirm production health, preview isolation, privacy, moderation and persistence using the existing data-safety guide. No changes to production solely for a preview.
- [ ] Assign named volunteer maintainers to six working areas; coordinate overlapping work and publish a review schedule.
- [ ] Invite 20–30 interested people individually and respectfully, host an optional one-hour workshop, and support first contributions.
- [ ] Publish a short demo, public roadmap and first collaborative experiment. No simulated result may be advertised as real public consent.
- [ ] Release a weekly progress report with opt-in credit, open questions, next tasks and review-time metrics.

## Suggested working groups

- **Civic research**: Evidence, policy drafts and explicit trade-offs.
- **Simulation**: Reproducible models and uncertainty.
- **Visualization**: Accessible, beautiful ways to explore outcomes.
- **Consensus**: Understand disagreement without inventing public consent.
- **Infrastructure**: Reliable, secure, documented software.
- **Community**: Help newcomers learn, participate and stay involved.

## Starter backlog (30 published issues)

Each row links to its published GitHub issue (#76–#105). Comment with your approach before starting so a maintainer can confirm scope and coordinate overlapping work.

| Area | Task | Acceptance criteria | First issue |
| --- | --- | --- | --- |
| research | [Map objections to a housing pilot](https://github.com/adnanwahab/HeliosHTML/issues/76) | Create an evidence table with three objections, potential mitigations and unresolved questions. | Yes |
| research | [Review childcare subsidy assumptions](https://github.com/adnanwahab/HeliosHTML/issues/77) | Cite three credible sources and distinguish cost, eligibility and uncertainty. | Yes |
| research | [Define a drainage pilot evidence checklist](https://github.com/adnanwahab/HeliosHTML/issues/78) | Document baseline, proposed intervention, measurable outcomes and missing data. | Yes |
| research | [Create a policy citation rubric](https://github.com/adnanwahab/HeliosHTML/issues/79) | Specify source quality, publication date, geography, conflicts of interest and claim verification. | Yes |
| research | [Draft comparative policy research template](https://github.com/adnanwahab/HeliosHTML/issues/80) | Include alternatives, implementation constraints, costs, benefits and dissent. | Yes |
| simulation | [Document a reproducible consensus run](https://github.com/adnanwahab/HeliosHTML/issues/81) | Record seed, revision, population, assumptions and exact run instructions. | Yes |
| simulation | [Add uncertainty explanation to results](https://github.com/adnanwahab/HeliosHTML/issues/82) | Explain scenario dependence and why synthetic approval is not a real poll. | Yes |
| simulation | [Test deterministic vote batches](https://github.com/adnanwahab/HeliosHTML/issues/83) | Assert matching seed and revision produce equal results across batch sizes. | No |
| simulation | [Add scenario sensitivity comparison](https://github.com/adnanwahab/HeliosHTML/issues/84) | Compare at least two explicit model assumptions with matching seeds. | No |
| simulation | [Benchmark streaming aggregation](https://github.com/adnanwahab/HeliosHTML/issues/85) | Record throughput, memory and sample size on one documented environment. | No |
| visualization | [Audit chart labels and color contrast](https://github.com/adnanwahab/HeliosHTML/issues/86) | Check three existing charts for labels, contrast and non-color encodings. | Yes |
| visualization | [Add a readable legend to a policy chart](https://github.com/adnanwahab/HeliosHTML/issues/87) | Provide labels, units, accessible alternatives and mobile screenshot. | Yes |
| visualization | [Design a before-and-after policy view](https://github.com/adnanwahab/HeliosHTML/issues/88) | Create a mockup with baseline, scenario, delta and assumptions. | Yes |
| visualization | [Prototype a population vote timeline](https://github.com/adnanwahab/HeliosHTML/issues/89) | Show synthetic support, opposition and abstention with explicit sample labels. | No |
| visualization | [Measure WebGPU fallback behavior](https://github.com/adnanwahab/HeliosHTML/issues/90) | Document capability checks and provide a usable non-GPU fallback. | No |
| consensus | [Write a glossary of vote states](https://github.com/adnanwahab/HeliosHTML/issues/91) | Define support, oppose, abstain, unresolved and not yet voted. | Yes |
| consensus | [Draft a review checklist for objections](https://github.com/adnanwahab/HeliosHTML/issues/92) | Require evidence, strongest counterargument and a documented unresolved option. | Yes |
| consensus | [Test revision-specific vote isolation](https://github.com/adnanwahab/HeliosHTML/issues/93) | Verify votes cannot silently carry across changed proposal revisions. | No |
| consensus | [Design minority objection summaries](https://github.com/adnanwahab/HeliosHTML/issues/94) | Show disagreement themes without inferring individual intent or erasing dissent. | No |
| consensus | [Document decision and appeal process](https://github.com/adnanwahab/HeliosHTML/issues/95) | Propose transparent review, escalation, revision and appeal criteria. | Yes |
| infrastructure | [Verify clean local setup](https://github.com/adnanwahab/HeliosHTML/issues/96) | Follow documented Node and Bun setup in a fresh environment and record blockers. | Yes |
| infrastructure | [Audit public routes on mobile](https://github.com/adnanwahab/HeliosHTML/issues/97) | Check home, contribute, welcome and one simulator; file reproducible failures. | Yes |
| infrastructure | [Review dependency and asset licenses](https://github.com/adnanwahab/HeliosHTML/issues/98) | Inventory sources, provenance, permissions and unresolved license questions. | No |
| infrastructure | [Document safe preview deployment](https://github.com/adnanwahab/HeliosHTML/issues/99) | Explain no production credentials, exact commit checks and screenshot artifacts. | Yes |
| infrastructure | [Review branch protection and secret exposure](https://github.com/adnanwahab/HeliosHTML/issues/100) | Record recommended settings; do not change production or expose credentials. | No |
| community | [Draft a first contribution walkthrough](https://github.com/adnanwahab/HeliosHTML/issues/101) | Show how to choose a task, comment, submit work and get reviewed. | Yes |
| community | [Write a welcome workshop agenda](https://github.com/adnanwahab/HeliosHTML/issues/102) | Include a demo, hands-on task, review and optional follow-up. | Yes |
| community | [Create a respectful contributor feedback rubric](https://github.com/adnanwahab/HeliosHTML/issues/103) | Define actionable review comments, dispute resolution and escalation. | Yes |
| community | [Draft a weekly progress update format](https://github.com/adnanwahab/HeliosHTML/issues/104) | Include merged work, open blockers, contributor credits and next tasks. | Yes |
| community | [Define contributor activation metrics](https://github.com/adnanwahab/HeliosHTML/issues/105) | Define first contribution, active contributors, review time and privacy-preserving counting. | Yes |

## Metrics and operating rhythm

Define an activated contributor as a human who submits a useful issue, research note, review, design or pull request accepted for review. Count unique contributors over a rolling seven-day window from public contributions or opt-in records only; do not count bots or simulated voters. Track time to first contribution (target under ten minutes for a small task), median time to first maintainer response (target under 24 hours), reviewed contributions, unresolved blockers and repeat contributors. Publish aggregate counts and opt-in credits; no private analytics are needed for the pilot.

Suggested schedule: November 25–26 foundation; November 26–27 onboarding; November 27–28 community setup; November 28–30 invitations and workshop; December 1 pilot if gates pass. If safety or licensing gates remain unresolved, delay an open-source launch and keep the workshop limited.

## Decisions still needed

License and third-party rights, moderation contact, maintainer roster, GitHub settings, actual recruitment and launch authorization are human decisions. No claim that the project has already recruited contributors or earned agreement.
