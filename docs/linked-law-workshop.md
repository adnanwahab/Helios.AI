# Linked law workshop

The bottom of the homepage reads the existing /api/catalog (100 editorial proposals plus community proposals) and /api/laws/:id revision records. These are public GETs with no journal text or browser-session creation. Offline/static mode uses the bundled seed read-only. The separate archived atlas and version-scoped voting remain unchanged.

- Twelve synthetic constitution clauses have curated related law IDs, not claims of equivalent wording or consensus. Community clauses can link by explicit law ID or by a proposal created from a visible clause.
- Edits submit amendments against the displayed version. Maintainer approval is required for adoption, preserving existing revision history.
- The two-answer quiz sends only explicitly opted-in public-safe answers to OpenAI. No provider call occurs when using the manual template. The generator returns strict JSON, never executable code. Drafts are not persisted until explicit publish consent; the bounded simulator spec and related clause ID persist with the proposal's version in the existing database.
- Charts are normalized illustrative scenarios, not empirical forecasts or official votes.
- Enable the paid generator explicitly on the server: HELIOS_LAW_GENERATION_ENABLED=1 and OPENAI_API_KEY (secret); optional HELIOS_LAW_DRAFT_MODEL (defaults to OPENAI_MODEL or gpt-4.1-mini). Do not put the key in client code or git. The default is disabled; without the configured API, the manual template remains available. Generation uses same-origin session/CSRF, per-IP/session limits, two concurrent requests per runtime and bounded timeouts. The Netlify gateway forwards only the named civic endpoints to the existing Fly backend when no database is configured.
- CI screenshot capture demonstrates the two questions and manual draft visualization without contacting the paid model or publishing real proposals. Browser regression uses a mocked transformer and isolated local database.

## Shared review and URLs

On the live site, the constitution automatically reads the existing database. Selecting an advisory position creates or reuses a pseudonymous browser session and saves the position to the existing constitution_votes table. Comments and new clauses keep their explicit public-consent and moderation flow. No journal text is sent by initialization. If the database cannot be reached, shared controls are disabled until retry; private practice is only an explicit choice. Static and Netlify PR previews remain practice-only for constitution review, with a deep link to the live app. Existing private practice votes and comments are never uploaded retroactively.

- `/?clause=S-002&law=HGA-011#review-title` restores the clause and linked law, with focus on review.
- `/?clause=S-002&law=HGA-012#ll-detail` restores the chosen law and its simulator.
- `/law-atlas.html?law=HGA-011#law-title` restores an original law on the standalone atlas. The older public library uses `/laws?goal=HGA-011`.
- `/?law=HGA-012&labView=workshop#communal-science-lab` opens the homepage Communal Science Lab's public workshop on that law. The lab and the linked-law workshop share `?law=`; without `labView`, the lab stays closed.
- Back/Forward restore selections without a network write. The URL stores public IDs only; never journal text, comments, or unsaved proposals. Practice mode may be restored with `review=practice`. Community clause links retrieve only approved records, including a linked clause outside the first 200.
