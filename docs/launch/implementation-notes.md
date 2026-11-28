# Implementation reference from before the launch dashboard

This is a technical snapshot of the documentation at commit `5ca54f8cd03c20b6e11a885d4d5375108d216f82` on November 25, 2026. It preserves route descriptions and operator details while the [README](../../README.md) focuses on getting started. Deployment capabilities can differ by environment; verify the live health response and current configuration before using an integration. These notes are not launch acceptance evidence.

The full earlier README, including exploratory product ideas, remains in [Git history](https://github.com/adnanwahab/HeliosHTML/blob/5ca54f8cd03c20b6e11a885d4d5375108d216f82/README.md). Those ideas are not commitments, measured results, or a statement of current functionality.

## What's in this repo

- `index.html` — Front-page 100-law atlas with interactive per-law scenario charts, version-scoped advisory voting and proposed updates via the Supabase backend; three-lane constitution workbench with live typing, deduplicated sample clauses, advisory votes and moderated comments; Helios Loops: citizen (express → synthesize → decide) and government preview (understand → evaluate → respond → measure). Private journal text stays in the page; public proposal submission is explicit; preview positions and government feedback stay local.
- [Archived experiences](../../docs/experiences.md) — the former multi-tab dashboard and demo routes, accessible through the top-right **Docs** tabbed iframe viewer (with a compact drawer) and footer archive link without cluttering the main workflow.
- `helios_ai_landing_page.html` — the Helios AI landing page
- `helios_hippie_landing.html` — HeliosAI hippie-style landing page ("8 billion people, one big circle")
- `helios_fork.html` — Fork Helios page with GitHub fork button, setup instructions and static preview (`/embed/fork`)
- `world_plan_simulator.html` — World Plan Simulator: a synthetic year of daily journal pages from 8.2 billion people, turned into needs, a plan and a regional vote (served at `/embed/world-plan`)
- `vote_radar.html` — Vote Radar: a radar-style dot map of the US where a 24-hour sweep lights up simulated daily votes state by state, with a day per ballot, a live feed, callouts for needs, consensus and dissent, and running totals. Sample data, not an official ballot (served at `/radar` and `/embed/radar`)
- `eight_billion_map.html` — Eight billion people, five laws: a deck.gl map that gives each person one response per law, with area shading and a sample of individual dots (served at `/eight-billion`). Laws, population and thoughts are synthetic placeholders, not polling data.
- `three_editor_merge.html` — Three-editor merge: two journals on the sides, the constitution merged from them in the middle with duplicates removed, and an infinite scroll over 8 billion sample journals generated in the browser (served at `/merge` and `/embed/merge`; [S3 layout](../../architecture.md))
- `helios_100_frontend_demo.html` — 100 Shared Goals demo, with estimated arrival dates for each goal ([assumptions](../../docs/arrival-estimates.md))
- `heliosai_acts_orbit.html` — Acts in Orbit: all 111 HELIOSAI acts in one list, with a draft Universal Basic Income Act at #1, as a three.js solar system and D3 circle-pack, ranked by importance or shuffled (served at `/embed/orbit`)
- `support_every_country.html` — Support Every Country: all 195 flags (the 193 UN members plus Vatican City and Palestine) waving one at a time under "Support <country>", with a custom message, seconds per flag, region filter, shuffle and a searchable wall of every flag (served at `/flags` and `/embed/flags`; images in `public/flags/`)
- `neighborhood_consensus.html` — Neighborhood Consensus: a liquid 3D surface of how support for a local proposal spreads across a neighborhood, by blocks from the site and by week, with a cooperation view, a replayable sweep and five linked charts (map, time, turnout, across-blocks, all proposals). Sample ballots for a made-up neighborhood, not real votes; you can paste your own ([docs](../../docs/neighborhood-consensus.md); served at `/consensus` and `/embed/consensus`)
- `long_coil.html` — The Long Coil: technology from 3.3 million BCE wound into a 3D coil, one loop per century, then projected ten years ahead to 2036. Each projected milestone names the plan, roadmap or trend it rests on and a confidence tier; forecasts made in the past are checked against what happened, and a ledger view lists everything as tables. The record of about 500 sourced entries is inlined in the page (served at `/coil` and `/embed/coil`)
- `helios_notion_preview.html` — the plan as a Notion document, synced through the Notion API ([docs](../../docs/notion.md))
- `helios_braindance.html` — Braindance: Mirrorworld Pensieve. Key events from Nov 2019 to Nov 2033 around a mirror line at 23 Nov 2026: recorded events on a 3D globe above a pensieve surface, scheduled, planned and projected ones on its reflection below, with a weekly calendar grid, a time scrubber and a searchable log of every event. The event records live in the page and `bun test` checks them (served at `/braindance` and `/embed/braindance`; three.js loads from jsDelivr)
- `helios-unified.html` — Helios Unified (Universe · Communal Science Lab · Futures)
- `communal_science_lab_webgpu (1).html` — the Communal Science Lab (WebGPU)
- `sunshine_breakfast.html` — Sunshine for Breakfast: a PS1-style Three.js scene where the dialogue moves one line per scroll step, with original characters and dialogue (served at `/embed/sunshine`)
- `public/eight-billion-five-laws/` — Eight Billion, Five Laws: a deck.gl map of 2.1 million sampled dots, each standing for about 3,815 people, with one simulated response per law (served at `/public/eight-billion-five-laws/`). Laws, thoughts and population are synthetic placeholders, not polling data.

## Running locally

```sh
bun install
bun run dev
```

Then open http://localhost:3000/ or http://localhost:3000/laws. Without `SUPABASE_DB_URL` the dev server keeps the 100 goals, proposals and amendment history in a local PGlite database (`.data/pglite`). Browser-local demo notes remain local. See [backend and deployment documentation](../../docs/backend.md) for the API, the Supabase database, the Netlify functions and the SQLite migration.

## MorphLab · WebGPU particle studio

The Helios dashboard includes **MorphLab · WebGPU** (`/morphlab.html`): type a prompt and morph a glowing particle cloud into a procedural 3D sculpture, or drag in an uncompressed GLB model. OpenAI-powered shape recipes use a server-side, explicitly enabled API and fall back to local presets when unconfigured. See [MorphLab setup and security](../../docs/morphlab.md).

- `public/mystery.html` — The Missing Amendment, a fictional choose-your-own-adventure civic mystery. No real vote or personal information is sent. Available from the homepage and Docs.

## Homepage Message / PR contribution modal

Open **Message / PR** or `/?compose=pr` on the Fly application. Drafting requires no account and stays in the page. After review and explicit consent, choose one of two routes:

- **Helios inbox:** sends the exact title, message and topic to the existing private Helios database (Fly PGlite volume or configured Supabase PostgreSQL). A pseudonymous browser session receives a durable receipt and can view its own recent status and PR links. This does not automatically dispatch agents or create PRs.
- **GitHub:** copy the reviewed public JSON file, continue to GitHub's file editor, sign into GitHub, create a branch or fork and open a pull request. GitHub handles authentication, branch protection, CI and merging. No GitHub token, server-side Git client or merge API is required in Helios.

### Maintainer handoff

The existing `HELIOS_ADMIN_TOKEN` protects the inbox and status API. Do not expose that secret to the browser, public visitors or untrusted agent prompts. For an authorized operator:

```sh
curl -H "Authorization: Bearer $HELIOS_ADMIN_TOKEN" https://helios-ai-laws.fly.dev/api/contributions/inbox
# After triaging a record, use its actual ID:
curl -X POST -H "Authorization: Bearer $HELIOS_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"expectedStatus":"queued","status":"researching"}' \
  https://helios-ai-laws.fly.dev/api/contributions/CONTRIBUTION_ID/status
```

The operator can move a reviewed request from queued → researching → implementing → review (include the actual positive integer `prNumber`) → closed, return active work to queued for triage, or return review to implementation. Status changes are conditional on the expected prior state. No status represents a verified GitHub merge; use the linked PR for authoritative checks and review.

For Mini Symphony (separate worker queue PR #65), a trusted coordinator should review each untrusted contribution, enqueue its ID with an approved task description using the worker queue's idempotent enqueue contract, then report real progress and the PR number through the operator API. The inbox is not a worker lease queue and this PR does not wire or start any agents. Worker GitHub credentials, if needed, belong only to the worker environment. Use least privilege and human review; never execute arbitrary messages directly.

Netlify deploy previews keep the public GitHub handoff available but do not access the production inbox. Fly production deployment is manual after merge and preserves its existing database volume. No database switch or new GitHub credentials are required.
