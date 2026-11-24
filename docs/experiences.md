# Archived Helios experiences

The default homepage is now the three-screen Helios Loop: Journal → Synthesis → Proposed law. The original multi-tab dashboard is retained as `docs/legacy-home.html` and built as the unlisted `/experiments.html` route for compatibility and regression tests. No archived experience is linked from the new homepage. This is navigation hiding, not access control; old direct URLs still work.

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
