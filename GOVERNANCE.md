# Helios governance and maintainer progression

Helios is a voluntary civic research project. Repository maintenance decides what software and documentation the project accepts. It does not grant governmental authority or turn project feedback into a binding public vote.

## Roles and authority

| Role | Responsibility | Access and limits |
| --- | --- | --- |
| Contributor | Submit evidence, objections, designs, documentation, tests, or code; respond to review. | Public contribution paths; no administrative access is needed. |
| Reviewer | Check a defined area, reproduce results, explain concerns, and help newcomers. | Review and recommendation; this role alone does not authorize merging or production access. |
| Area maintainer | Own the review queue and quality standards for an agreed area; keep decisions and handoffs visible. | Repository permissions are granted separately by an administrator, with the smallest scope needed. |
| Release maintainer | Verify checks, reviewed preview, release notes, and operational gates; coordinate a release. | Production and merge permission must be explicitly assigned. No bypass of required checks or protections. |
| Community moderator | Apply conduct rules, handle sensitive reports, arrange independent review and appeals. | A private reporting channel and backup moderator must exist before public recruitment at scale. |
| Repository administrator | Manage access, branch rules, integrations, and emergency coordination. | Confirm existing rules before changing them; document access and policy changes. |

The repository is owned by the GitHub account [`adnanwahab`](https://github.com/adnanwahab/HeliosHTML). This document does not appoint additional people, establish their availability, or assert that a named person has accepted any new duty. The initial reviewer, release-duty, and moderation roster is **unfilled until people opt in**. Maintainers record each accepted role, area, public handle, start date, and backup in a reviewed update to this file. Private contact details do not belong in the public roster.

## Working areas

Civic research, simulation, visualization, consensus, infrastructure, and community share one review process. A task should name a primary area and an owner who has explicitly accepted it. Cross-area changes should name the second reviewer or leave that review request open. Volunteers may decline or hand off work at any time.

## Earning responsibility

1. **First contribution:** complete a bounded issue and work through human feedback. Research, design, testing, and documentation count alongside code.
2. **Reviewer nomination:** after a track record of useful contributions and respectful reviews, an existing maintainer proposes a person for a specific review area, linking examples and asking for their consent. There is no automatic quota or points threshold.
3. **Trial responsibility:** record a bounded review scope and a suggested four-week trial. Pair with an existing maintainer and agree on availability; grant only permissions needed for that role.
4. **Maintainer appointment:** the repository administrator and an independent established maintainer review the examples, conduct, availability, and conflicts. If the project has only one administrator, do not represent that as independent review; record the gap and recruit a second reviewer before delegating release authority.
5. **Review and handoff:** review role fit at the end of the trial and periodically afterward. A maintainer can step back without losing contribution credit. Remove unnecessary access and document a replacement or an open vacancy.

No title grants access to private journals, participant records, secrets, or production systems. Such access needs a concrete operational reason and a separate recorded authorization.

## Decisions and merge policy

Small changes are evaluated against the issue's acceptance criteria. Substantial product, privacy, model, data, or policy changes start with a written proposal: problem, affected groups, alternatives, strongest objections, evidence, costs, and measurable outcome. The decision record names the reviewed revision, reviewer, decision, reasons, unresolved concerns, and follow-up.

Before merging relevant changes, require passing automated checks and a human review of the current diff and exact preview. Authors do not count their own approval as independent review. Reviewers may request changes or defer a decision when evidence is insufficient. Branch settings must enforce the intended policy; a statement here is not proof that enforcement is enabled. The [launch dashboard](https://deploy-preview-75--heliosailol.netlify.app/launch) tracks the settings evidence separately.

A research contribution may be accepted with uncertainty documented. A proposal receiving support does not erase opposing views. Publish the scope of the decision and keep an accessible path for a revised proposal or appeal.

## Disagreement and appeal

First identify the disputed acceptance criterion or decision and link evidence. Ask for a second reviewer who was not responsible for the original decision; reviewers with conflicts recuse themselves. Record the resolution and remaining uncertainty. Sensitive conduct reports use the private moderation process when published, or the platform's reporting controls; never ask someone to disclose personal details in a public issue.

## Operating rhythm

The target for a first substantive maintainer response is **within 24 hours**. A human acknowledgment names an owner or the next review step; a bot message does not satisfy the target. Review the queue at least daily while the launch is active, reassign work when someone is unavailable, and report actual response times and gaps. The [community operations kit](docs/launch/community-operations.md#24-hour-response-process) defines the queue process. A rota and observed performance are still required before this service target can be marked achieved.
