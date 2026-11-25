# Linked law workshop

The bottom of the homepage reads the existing /api/catalog (100 editorial proposals plus community proposals) and /api/laws/:id revision records. These are public GETs with no journal text or browser-session creation. Offline/static mode uses the bundled seed read-only. The separate archived atlas and version-scoped voting remain unchanged.

- Twelve synthetic constitution clauses have curated related law IDs, not claims of equivalent wording or consensus. Community clauses can link by explicit law ID or by a proposal created from a visible clause.
- Edits submit amendments against the displayed version. Maintainer approval is required for adoption, preserving existing revision history.
- The two-answer quiz sends only explicitly opted-in public-safe answers to OpenAI. No provider call occurs when using the manual template. The generator returns strict JSON, never executable code. Drafts are not persisted until explicit publish consent; the bounded simulator spec and related clause ID persist with the proposal's version in the existing database.
- Charts are normalized illustrative scenarios, not empirical forecasts or official votes.
- Enable the paid generator explicitly on the server: HELIOS_LAW_GENERATION_ENABLED=1 and OPENAI_API_KEY (secret); optional HELIOS_LAW_DRAFT_MODEL (defaults to OPENAI_MODEL or gpt-4.1-mini). Do not put the key in client code or git. The default is disabled; without the configured API, the manual template remains available. Generation uses same-origin session/CSRF, per-IP/session limits, two concurrent requests per runtime and bounded timeouts. The Netlify gateway forwards only the named civic endpoints to the existing Fly backend when no database is configured.
- CI screenshot capture demonstrates the two questions and manual draft visualization without contacting the paid model or publishing real proposals. Browser regression uses a mocked transformer and isolated local database.
