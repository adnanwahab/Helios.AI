# Mini Symphony: Fly + Supabase pilot

A deliberately bounded pilot for HGA-051. One authenticated API process and one worker, with a private PostgreSQL job queue. The worker performs a real OpenAI model request to produce a neutral implementation/objections brief. It does not browse, run arbitrary code, publish a revision, or open PRs; evidence is **unverified**. It sends only the selected public proposal and approved question. The response is stored for human review. There is one lifetime pilot job ID; retries of identical submissions return the existing job. Do not delete jobs to bypass that safeguard. This is not yet the general 20-agent Codex orchestration.

## Deploy (from repo root, after reviewing and merging)

1. Use a dedicated Symphony Supabase database/project. Do not run schema.sql against the production citizen database. Apply schema.sql in that project's SQL editor as its database owner. Create a scoped login symphony_runner separately with a generated strong password and apply the commented grants and policies. Do not expose mini_symphony through the Data API. Verify the role can read/update the queue but cannot access unrelated schemas. Use the direct/session-mode database connection URL for that role and Supabase CA certificate if required. Never use the service-role key or a postgres owner URL for the worker.
2. Set max_agents=1 for the pilot. Check the queue contains no unrelated jobs. This pilot worker is not compatible with arbitrary coding jobs.
3. In an authenticated local Fly CLI, create your own app if it does not exist:
   
   fly apps create helios-mini-symphony

   If the name is unavailable use a name you own and adjust app in fly.toml. Do not use the existing helios-ai-laws app. Fly charges apply.
4. Import secrets locally (never commit these, never paste them in chat):
   
   fly secrets set -a helios-mini-symphony SYMPHONY_DATABASE_URL="$SYMPHONY_DATABASE_URL" SYMPHONY_OPERATOR_TOKEN="$SYMPHONY_OPERATOR_TOKEN" OPENAI_API_KEY="$OPENAI_API_KEY"
   
   Generate the separate operator token using openssl rand -hex 32. Configure SYMPHONY_DB_CA if needed. Set an OpenAI project budget/limits and use a restricted key. Optional: add your exact owned preview origin to SYMPHONY_ALLOWED_ORIGINS in fly.toml. No wildcard origins.
5. Deploy and scale:
   
   fly deploy -c tools/mini-symphony/fly.toml --ha=false
   fly scale count api=1 worker=1 -a helios-mini-symphony
   fly status -a helios-mini-symphony
   fly logs -a helios-mini-symphony

6. Check GET /health (DB reachability only). Check unauthenticated GET /pilot returns 401. In your own Helios homepage use the pilot control to load the exact saved revision, check the question and consent, and submit. If the homepage wiring has not landed, use curl with Authorization: Bearer and GET /pilot followed by POST /pilot with JSON {versionId,question,consent:true}. The API resolves HGA-051 from the live Fly civic library; it will not fall back to a seed draft. GET /pilot returns the stored job. Do not paste the operator token into URLs, issue text, logs, or screenshots.

## Acceptance gates

- No API key in frontend bundle. Unknown origins and missing credentials rejected.
- Repeated identical submissions return the same job; different submissions conflict.
- Actual queued/running/needs_review transitions and stored model text; no fake live status.
- Stale lease cannot finish; expired attempt quarantined, never automatically retried.
- Verify model usage, exact version, no external sources verified; human review required.
- No live traffic, citizen DB changes, auto-publication or autoscaling before these checks.

This deployment requires your own Fly credentials, dedicated database, model API key and operator token. Code alone does not establish a live deployment. The 1500 output token cap and single job limit bound this experiment; they are not a guaranteed dollar cap. Scale only after a reviewed multi-job design, per-mission budgets and retry policy.
