# Founding contributor operations kit

Prepared November 25, 2026 for the December 1 launch target. This file makes the recruiting, onboarding, workshop, experiment, and publication work ready to run. It does **not** record those activities as completed. Actual delivery, attendance, accepted contributions, and published links belong in the [launch dashboard](https://deploy-preview-75--heliosailol.netlify.app/launch) with evidence.

## Operating owners and prerequisites

A named volunteer must accept each duty: outreach coordinator, workshop facilitator, first-contribution reviewer, release maintainer, and moderator with a backup. One person may cover several duties if their availability is stated. Use the role definitions in [GOVERNANCE.md](../../GOVERNANCE.md); this kit does not appoint anyone.

Before inviting a broad public audience, verify the advertised contribution route works, the public/private distinction is clear, a private moderation channel is available, reviewers can handle the queue, and the launch dashboard's privacy/persistence and licensing gates are resolved for the proposed release. If the live backend is unavailable, a workshop can use a clearly labeled local demonstration and public GitHub submissions; do not tell participants their practice responses were saved centrally.

## Invite 20–30 founding contributors

Aim for a mix of perspectives and skills: developers, designers, policy researchers, accessibility reviewers, and people who understand the community problem. Start with people who have expressed interest or with whom an appropriate existing relationship exists. Membership in a public group is not evidence that someone wants repeated direct contact.

The coordinator chooses 20–30 actual recipients, checks the correct identity and preferred channel, sends individualized invitations, and respects declines and non-response. Track consent and delivery privately. Keep personal email addresses out of the repository, public dashboard, and screenshots; the dashboard needs only aggregate delivery counts and, where people opt in, public handles. This kit supplies no invented recipients or delivery counts.

### Individual invitation

> Hi [name] — I'm building Helios, a civic research workshop where people improve proposals, question assumptions, and review changes together. I thought of you because [specific, honest reason]. Would you like to help shape the first version with one small contribution in [area]? Research notes, design feedback, testing, and documentation are as useful as code. Here's the contribution hub: [verified link]. There is also an optional one-hour workshop at [confirmed time, time zone, and link]. No pressure; if it isn't a fit, I won't keep following up.

Personalize the reason rather than copying a generic compliment. Include only an event time and URL that have actually been confirmed. Send at most one appropriate follow-up when the relationship supports it; stop on a decline or request not to contact.

### Welcome reply after someone opts in

> Thanks for joining. What kind of contribution would you enjoy: research, design, testing, documentation, or code? Pick one small issue from [good first issues](https://github.com/adnanwahab/HeliosHTML/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), or tell us a concern you'd like to investigate. Your reviewer will help agree on a manageable output. You can contribute under your chosen public handle, and public credit is optional.

## First-contribution support

The reviewer and contributor agree on a task before work expands. Prefer one source-backed objection, one accessibility finding, one documentation fix, or one small tested change that can be reviewed independently.

| Stage | Contributor action | Maintainer action | Completion evidence |
| --- | --- | --- | --- |
| Match | Choose an area and small issue. | Confirm scope, acceptance criteria, and a reviewer. | Issue comment with agreed task; no private contact details. |
| Begin | Share a proposed approach or first draft. | Answer the first blocking question and provide one example. | A concrete draft or reproduction, not just assignment. |
| Submit | Add a note/design/test or open a focused PR. | Acknowledge within the response target and link next steps. | Submitted artifact tied to the issue. |
| Review | Respond to feedback or explain a different approach. | Give criterion-based feedback and a verifiable next step. | Human review and revisions. |
| Accept or defer | Confirm any requested public credit. | Record acceptance, merge when authorized, or explain deferral. | Accepted contribution or explicit unresolved work, with a link. |
| Continue | Choose whether to take another task. | Offer a bounded follow-up without pressure. | Optional next task; participation can stop here. |

Do not close a newcomer task merely because a bot generated code. If a person is stuck or unavailable, offer pairing or a clean handoff and keep their earlier work credited.

## One-hour introductory workshop

**Scheduling status:** agenda ready; date, host, meeting link, accessibility needs, and attendees must be confirmed. Suggested window: November 28–30, 2026, using **America/Chicago** in the invite and an explicit equivalent for remote participants. No calendar event has been created by this document.

Ask in advance whether anyone needs captions, a recording alternative, keyboard-only participation, or an asynchronous option. Recording requires participants' informed consent; otherwise record a separate demonstration using fictitious text. Publish the agenda and issue links in advance.

| Minutes | Activity | Outcome |
| --- | --- | --- |
| 0–5 | Welcome, voluntary participation, conduct rules, what is public. | Everyone knows how to ask for help and how to leave or contribute asynchronously. |
| 5–12 | Demonstrate concern → proposal → objection → revised draft. | Participants see the exact revision and the boundary between simulated and real responses. |
| 12–20 | Demonstrate **Propose a change**, GitHub handoff, issue acceptance criteria, and a PR review. | One complete contribution path is understandable without local setup. |
| 20–25 | Match people into research, design, test, docs, or code tasks. | Each volunteer chooses one bounded task and knows the reviewer. |
| 25–43 | Hands-on contribution with optional pairing. | A source note, sketch, reproduction, documentation edit, or code draft. |
| 43–53 | Two or three volunteers share; reviewers give specific feedback. | The group practices constructive review and identifies the next action. |
| 53–58 | Submit drafts or public issues/PRs with explicit consent. | Real artifact links; no forced publishing of unfinished or private work. |
| 58–60 | Recap open questions, next review time, and optional follow-up. | Contributors know when they will hear back and how to keep going. |

Keep setup help outside the main hour when possible. Non-programmers should have equally useful tasks while developers install dependencies. After the session, record the actual date, approximate attendance, artifact links, and anonymous feedback themes. Attendance alone is not an accepted contribution.

## Short contribution-workflow video

Target: **90–120 seconds**, with readable captions and a text transcript. Use fictitious content and a preview/local environment. Do not record personal journals, tokens, inboxes, browser account menus, or participant contact details.

| Time | Screen/action | Caption or narration |
| --- | --- | --- |
| 0–12s | Homepage and **Propose a change** control. | “Start with one problem and one change you want to try.” |
| 12–30s | Type a short proposal and review the exact text. | “Explain who it helps, what could go wrong, and how you would check it.” |
| 30–45s | GitHub handoff and public-submission notice. | “You decide what becomes public. The GitHub route uses your own account.” |
| 45–65s | Show an actual example PR with a clear problem, changes, and linked issue. | “A small contribution has acceptance criteria and a reviewable result.” |
| 65–85s | Open exact preview, test results, and desktop/mobile screenshot evidence. | “Review behavior, evidence, and remaining limitations.” |
| 85–105s | Human review and revision record; show review status accurately. | “A person reviews the change. Revisions and checks stay attached to the PR.” |
| 105–120s | Launch dashboard and contribution hub. | “Choose your first task and follow progress here.” |

If the example PR is still open, say “awaiting review”; do not stage a fake merge. The artifact must show the workflow itself, not only a slide announcing it. Before marking this task complete, record the video file or published URL, source commit, duration, accessible transcript, and confirmation that the public link plays. A script alone is preparation.

## 24-hour response process

The target is a substantive first maintainer response within 24 hours of a new issue or PR. An automated greeting does not count. This is an operating target, not a claim that past activity already met it.

1. An opted-in maintainer checks the [issue queue](https://github.com/adnanwahab/HeliosHTML/issues) and [PR queue](https://github.com/adnanwahab/HeliosHTML/pulls) at least daily while the launch is active. A backup takes over planned absences.
2. Triage by newcomer support, broken contribution paths, privacy/security, then ongoing feature work. Apply existing labels and link duplicates without discarding the useful report.
3. Respond with an acknowledgment, scope or clarification, owner/reviewer, and next review step. If resolution needs longer, say when the next update is expected.
4. Escalate an approaching 24-hour gap to the backup and record actual missed targets. Do not invent a response to improve the metric.
5. Publish aggregate response times, queue size, and unresolved blockers in the weekly update. Do not publish private reporter details.

The dashboard may mark the process prepared when the guide exists. Mark the operating task complete only after a real rota is accepted and observed issue/PR timestamps demonstrate the first launch cohort received timely responses; ongoing compliance still needs monitoring.

## First public collaborative law-design experiment

**Working title:** “Can we improve a voluntary backyard-homes pilot by addressing its strongest objections?”

**Purpose:** test whether a small group can turn disagreement into a clearer, more reviewable proposal. The result is a research draft and learning record; it is not a law, a representative poll, or a claim that everyone agrees.

Use the existing housing example and [issue #76](https://github.com/adnanwahab/HeliosHTML/issues/76) for source-backed objections. The facilitator publishes the exact starting draft revision, scope, public-submission notice, agenda, and a closing time before collecting responses. Recruit people with varied experiences; participation and dissent remain voluntary.

### Starting prompt

> Consider a voluntary pilot allowing one additional home on an eligible property, subject to drainage/infrastructure checks and privacy standards. What is the strongest reason you would support or oppose this draft? What evidence or specific change would affect your view? You may choose “unsure,” abstain, or decline to participate. Please avoid private personal details; responses submitted to the public discussion are public.

### Two-round protocol

1. **Prepare the packet.** Include the exact draft, a short plain-language summary, relevant source links, proposed measures, budget questions, and known uncertainties. Name the facilitator, reviewer, and response venue.
2. **Round one.** Invite real participants to state support, opposition, uncertainty, abstention, and optional reasons for that revision. Keep synthetic simulation results in a separate clearly labeled panel or file. Do not claim responses are unique verified people unless the collection method establishes that.
3. **Synthesize objections.** Group concerns by topic, quote only with permission, link evidence, and preserve views that do not fit a group. Ask participants whether the summaries represent their concerns accurately.
4. **Revise.** Propose specific changes addressing the strongest objections: one-home limit, transparent tax assessment, drainage checks, setbacks, capped pilot budget, voluntary participation, and affordability/financing questions. Record costs and trade-offs instead of promising benefits.
5. **Round two.** Publish a new revision and ask for fresh responses. Never carry votes silently from the previous text or count silence as support.
6. **Review and publish.** Record each revision, number of responses, recruitment/collection limitations, unresolved objections, accepted edits, remaining evidence needs, and next steps. People can disagree with the outcome without losing access or credit.

A useful success criterion is a published before/after draft with at least three well-described objections and a traceable disposition for each. Participant count is reported as observed. Do not set unanimity or a synthetic approval score as the condition for success.

**Completion evidence:** the actual public session/discussion URL, time, anonymized aggregate participation counts, before/after revision links, review record, and a participant-facing summary. A prepared agenda or a simulation run alone does not complete this checklist item.

## Public-launch publication kit

Publish only when the destination site's rules permit the post and the linked experience matches the claims. Choose a real person to answer comments. Target December 1 is conditional on the dashboard's remaining gates; do not announce all gates passed while licensing, privacy, persistence, or review enforcement remains unresolved.

### Hacker News draft

**Title:** Show HN: Helios — a workshop for revising civic proposals together

> We are building Helios to make civic ideas easier to examine and improve. You can draft a proposal, explore explicitly labeled simulations, address objections, and contribute research, design, tests, documentation, or code through GitHub. We are running a small collaborative experiment around a voluntary housing pilot and would value feedback on the contribution workflow and how disagreement is represented. Demo: [verified production URL]. Source and contribution guide: [repository URL]. Current limitations and launch evidence: [dashboard URL]. [Add the verified license status and observed persistence limitations at publication time.]

### Community post draft

**Title:** Looking for feedback on a small civic proposal-review experiment

> I am working on Helios, a voluntary research workshop for improving proposals through evidence and disagreement. Our first experiment asks how a backyard-homes pilot should address concerns about drainage, privacy, cost, and participation. If this fits the community's rules, we'd welcome source-backed objections, design/accessibility feedback, or help testing the contribution path. These are draft proposals and illustrative simulations, not official ballots. [Verified experiment link and dates.] [One specific question appropriate to this community.]

Check the chosen community's current self-promotion, research, and political-discussion rules before posting. Do not copy the same message into many communities or ask people to manipulate ranking/votes.

### Social post draft

> We're opening a small Helios contribution pilot: bring one concern, investigate the strongest objections, and help improve a proposal. Research, design, testing, docs, and code all welcome. Try the verified demo [link], pick a starter task [link], and see what is ready and what remains [dashboard link].

Record the actual public URLs and dates on the dashboard only after publication. These drafts do not imply that any post has been sent.

## Weekly progress update

Publish on a consistent day after the first public experiment; choose the day and owner with the maintainer rota. A versioned report in the repository can be the durable record, with a short linked announcement in Discussions once it is enabled.

```md
# Helios weekly progress — YYYY-MM-DD

## What became usable

- [Merged PR or accepted non-code artifact]: concrete user benefit, evidence, remaining limits.

## Contributions accepted this week

- [Public handle, only with opt-in credit]: [accepted artifact].
- Accepted contributions: [observed count]. First-time contributors: [observed count].

## What we learned from disagreement

- [Proposal revision]: strongest objection, evidence, change made, unresolved question.

## Reliability and review

- [Verified health/persistence evidence and date].
- First substantive response median: [observed value and definition].
- Issues/PRs over 24 hours without a maintainer response: [observed count].

## Current blockers

- [Issue]: owner or unassigned, next action, evidence needed.

## Next three challenges

1. [Small scoped task with acceptance criteria and reviewer].
2. [Small scoped task with acceptance criteria and reviewer].
3. [Small scoped task with acceptance criteria and reviewer].

## Join in

[Verified contribution hub] · [good first issues] · [next confirmed event or async option]
```

Count accepted work, actual participants, and real reviews. Do not include bot identities as human contributors, synthetic voters as participants, unmerged drafts as shipped features, or promises as outcomes. Keep the denominators and collection window explicit.

## Evidence required to close the human-work tasks

| Checklist task | Prepared now | Evidence still required |
| --- | --- | --- |
| Invite 20–30 people | Individual invitation, recipient-selection and consent process. | Verified deliveries to actual appropriate recipients; aggregate public count only. |
| Host a one-hour workshop | 60-minute agenda and facilitation plan. | Confirmed event, actual session, attendance summary, and contribution links. |
| Help newcomers finish meaningful contributions | Step-by-step support and review rubric. | Individual accepted artifact links and contributor-confirmed outcomes. |
| Respond within 24 hours | Queue process and target definition. | Accepted rota and actual response timestamps; ongoing review. |
| Publish public-launch posts | Platform-specific drafts. | Verified posts on the chosen permitted destinations. |
| Run the first public experiment | Starting prompt, two rounds, review protocol. | Actual session, real responses, revisions, and report. |
| Publish weekly progress | Reusable reporting template. | A published dated update with accepted work and observed metrics. |
