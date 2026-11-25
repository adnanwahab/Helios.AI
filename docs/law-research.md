# 100-law research dashboard

Open `/public/law-research.html` from the homepage. For local development, run `bun install` and `bun run dev` from the repository root (the server serves the rebuilt `dist/` tree).

- Select a canonical Helios proposal. The dashboard reads the shared Supabase revision when available and falls back to the original bundled editorial catalog; the extra featured draft is excluded from the canonical 100.
- Choose 100,000 (default), one million, or ten million synthetic identities per law, a simulated day, and either mechanism-language suggestions or a neutral control. Run all 100, missing baselines, or the selected law with reviewed manual effects. A single seed and identical IDs are used across all laws. Eight-billion-agent rounds remain in Consensus World.
- Review source snapshots, assumptions, exact vote counts and objection dimensions. Open an exact recorded baseline in Consensus World, revise the law, and compare on the same identities/day/population. Research runs never cast real votes or modify shared wording.
- Results, research notes, and revision history are browser-local. Pause stops after the current law. Up to five baselines per law are retained; export JSON to preserve evidence before clearing browser data. The 100-law batch does not run in the background. Actual advisory counts, when available for the same shared revision, are separate from model results.
- Rule-based suggestions are intentionally limited to explicit implementation language; they do not infer effects from aspirations or risk descriptions. Equal vectors necessarily produce equal synthetic votes. Outputs are not calibrated predictions or legal evidence and must not be optimized as if they were human consent.

The daily challenge rotates through canonical IDs by UTC day. It is a starting point for human review, not a public ballot or a scheduled compute job.
