# Archived Helios experiences

The default homepage is now the citizen and government Helios Loops. The citizen has three visible lanes (Express → Synthesize → Decide); the government preview has four steps (Understand → Evaluate → Respond → Measure). The original multi-tab dashboard is retained as `docs/legacy-home.html` and built as `/experiments.html`. The top-right searchable Docs drawer and footer archive link open previous experiences in new tabs, preserving drafts; the archive links back to Helios and repository documentation. No old demo tabs appear in the primary homepage navigation. This is navigation hiding, not access control; old direct URLs still work.

## Experience inventory

| Experience | Existing route / file |
| --- | --- |
| Landing page | /embed/helios-ai |
| Hippie landing | /embed/hippie |
| Notion plan | /notion |
| World Plan Simulator | /embed/world-plan |
| Vote Radar | /radar |
| Neighborhood Consensus | /consensus |
| Three-Editor Merge | /merge |
| 100 Shared Goals | /laws |
| Acts in Orbit | /embed/orbit |
| Support Every Country | /flags |
| Unified | /embed/unified |
| The Long Coil | /coil |
| Communal Science Lab | /embed/dynamicland |
| MorphLab | /embed/morphlab |
| HappyBearLandia Pocket | /pocket |
| Digital Pensieve | legacy dashboard tab |
| Braindance | /braindance |
| Mail | /embed/mail (existing operator controls still apply) |
| YC Research | /proxy/ycr/ |
| Fork Helios | /embed/fork |
| Rainbow Brain Realms | /rainbow-brain |
| Sunshine for Breakfast | /embed/sunshine |
| Eight Billion, Five Laws | /public/eight-billion-five-laws/index.html |
| Welcome | /welcome |
| Signup | /signup |
| Other standalone demos | eight_billion_map.html, health_wealth_of_nations.html, heliosai-particle-interface.html, sand_castle.html, morphlab-offline-demo.html |

## Helios Loop

1. Journal: memory-only private text, no network request or model download.
2. Synthesis: locally suggest a topic and first-sentence excerpt. The visitor defines the public issue, desired outcome and implementation. This is deterministic guided drafting, not an LLM inference.
3. Proposed law: edit the exact public fields, add safeguards and measurable outcomes. Explicit approval is required before the existing same-origin session and proposal API is called. Successful submissions produce an HGP record in the shared proposal library; a proposal is not enacted legislation. Raw journal text is not separately submitted; review and remove any personal details from the proposal.

Static GitHub Pages builds support drafting and JSON download only. They never post to the production backend. The Fly/Netlify build uses the existing CSRF, rate limiting and idempotent proposal API. The raw draft remains only in the current page; refresh clears it. The existing API's moderation behavior is unchanged.

## Two connected workflows

The header role switch preserves both drafts in the same page. Citizens may explicitly load the shared public catalog and match against the public concern locally using keywords and policy area. An existing proposal can be reviewed, marked Support / Oppose / Unsure / Need more evidence locally, opened for amendment through the existing library, or handed off to the government preview. No position is counted or transmitted. New public proposal submission still uses the existing consent and proposal API.

The government preview can load the same public catalog, accept a selected or newly published proposal from the citizen flow, or use an explicitly labeled sample. It guides reviewers through jurisdiction, evidence, cost, alternatives, objections, a suggested disposition, owner, metrics and a review date. Downloading a draft exports JSON; previewing citizen feedback displays only the response, measures and next step in the citizen view. This is not an authenticated government portal, a representative opinion poll, or a binding government decision. No government response or private journal is posted. All preview positions, reviews and feedback are held in page memory and disappear on refresh. The static build uses only illustrative sample records and makes no API calls. Real government use would require an authenticated, authorized response API, audited provenance, a participation protocol, and privacy and moderation review.

## Constitution workbench

The citizen homepage keeps three lanes visible: **Express** (private journal and local typing signal), **Synthesize** (deduplicated shared constitution), and **Decide** (clause-level advisory positions, comments and public clause contributions). On narrow screens the lanes stack. The earlier proposal drafting and government workflows remain intact. The Docs drawer is searchable and links to previous experiences without closing the current journal.

The synthetic corpus is deterministic and versioned: 256 invented participants, each contributing several sample clauses and one simulated stance per distinct clause. Case and whitespace variants are grouped by normalized wording, with repeated mentions by the same participant removed. Distinct qualifiers, competing proposals and dissent are not merged. Synthetic tallies are fixed and explicitly separate from shared real browser-session tallies.

The default is **practice mode**, with no API calls caused by typing or practice votes/comments. On Fly/Netlify, **Connect shared board** explicitly establishes a pseudonymous session and loads shared counts; it refreshes periodically while visible. A real position can be changed or cleared, with one current vote per session per clause. A public contribution requires explicit approval of the exact wording; identical normalized wording joins the existing clause and counts once per session. New clauses and comments are held for human moderation before appearing publicly. They are not official votes or representative opinion. Practice activity is never uploaded. GitHub Pages remains practice-only.

API: GET `/api/constitution`; POST `/api/constitution/vote`, `/api/constitution/contribute`, `/api/constitution/comment` (existing CSRF/session/rate-limit/idempotency protections). Moderation is maintainer-only: GET `/api/constitution/moderation` with the configured bearer admin token; POST `/api/constitution/moderate` with the same token plus a valid browser session, CSRF and idempotency key, body `{"kind":"clause"|"comment","id":"...","decision":"approved"|"rejected"}`. No raw journals are stored or transmitted automatically. Only approved comments and clauses appear to others. Pending moderation is not a claim of approval. This is an early prototype: no verified personhood, semantic clustering, representative weighting, large-scale aggregation, or public moderation UI yet.
