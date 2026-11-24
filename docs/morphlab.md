# MorphLab · WebGPU particle sculptures

MorphLab is integrated into the Helios dashboard as **MorphLab · WebGPU**, and is directly available at `/morphlab.html`. It adapts the standalone MorphLab prototype into the Helios HTML/iframe architecture. No extra browser dependencies are needed.

## What visitors can do

- Type a prompt in the textarea. After 1.6 seconds of inactivity (or clicking **Morph particles**), the page asks the Helios backend to interpret it as a structured 3D shape.
- Watch 10,000–42,000 particles morph on a native WebGPU shader; use the Canvas fallback on browsers without WebGPU.
- Try built-in jellyfish, butterfly, galaxy, dragon, heart, DNA, Saturn, and flower presets, rotate/zoom, and import an actual uncompressed `.glb` model (up to 24 MB) for triangle-surface sampling.
- Turn off Auto-morph to avoid repeated AI API calls. A prompt goes to OpenAI only when the AI mode is enabled by the server.

## Production configuration

**OpenAI is disabled by default**, and the public page stays in local procedural mode until the operator explicitly enables the paid feature. Set these **server-side** environment variables in Netlify or Fly (not in a public HTML/JS file):

```sh
MORPHLAB_ENABLED=1
OPENAI_API_KEY=...             # Secret; never commit
OPENAI_MODEL=gpt-4.1-mini     # Optional, must support Responses API structured outputs
```

If Helios is served behind a reverse proxy, ensure its public HTTPS origin is in `PUBLIC_ORIGINS` (for example, `https://helios-ai-laws.fly.dev` or `https://helioshtml.com`), so origin validation works correctly.

For Netlify, set values in Site configuration → Environment variables. For Fly, configure secrets with `fly secrets set` and preserve the app's existing volume/configuration. **This PR does not configure secrets or deploy.**

Before enabling paid requests for a large audience, configure OpenAI project-level spending limits and monitor API usage. Limits here are a protection for a small demo, not a comprehensive abuse-prevention system.

## Backend contract

- `GET /api/morphlab/config` — exposes `{enabled, model}` but never the API key.
- `POST /api/morphlab/shape` — JSON `{prompt: string}`, 2–500 characters; requires same-origin `Origin`, a session cookie from `GET /api/session`, and its `X-CSRF-Token`.
- Requests are capped at 2 KB; rate-limited durably to **12 requests per IP/hour** and **8 per session/hour**, with at most three in-flight OpenAI calls per server instance.
- Helios calls the OpenAI Responses API from the server with `store:false` and a strict JSON schema for `ellipsoid`, `box`, `cylinder`, `cone`, `torus`, `tube`, and `wing` primitives. The schema is validated and spatial values are clamped before returning them to the browser.
- If OpenAI is disabled or errors, the browser creates a **local abstract sketch**, not a falsely labeled AI result. A generated recipe is not a GLB or detailed text-to-3D asset.

## Static previews and tests

The Netlify and GitHub Pages build scripts now include `morphlab.html`. Static GitHub Pages previews have no server endpoint and intentionally stay in local mode. The Fly Node server and Netlify API both use the existing `src/app.js` request handler.

```sh
bun test
node --test test/morphlab.test.js
node scripts/build-netlify.mjs
node scripts/build-pages.mjs
```

A live OpenAI request is **not** part of automated tests. They mock the Responses API and verify server-side key handling, geometry sanitization, origin and CSRF requirements, size validation, and rate limiting.
