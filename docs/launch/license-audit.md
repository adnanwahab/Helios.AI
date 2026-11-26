# Initial dependency and asset rights audit

**Status: project licenses applied November 26, 2026; asset provenance still open.** First reviewed November 25, 2026 against launch-branch baseline `5ca54f8cd03c20b6e11a885d4d5375108d216f82`. Tracking issue: [#99](https://github.com/adnanwahab/HeliosHTML/issues/99).

## Decision

Applied November 26, 2026, replacing the earlier MIT proposal:

- **Original code, tests, scripts and documentation: [AGPL-3.0-or-later](../../LICENSE).** Helios is a hosted civic service, so the network clause matters: anyone who runs a modified version for other people must offer them its source, which keeps changes to vote counting and plan synthesis inspectable. The civic participation platforms Decidim, CONSUL Democracy and Polis also use AGPL-3.0.
- **Policy text: [CC0 1.0](../../LICENSE-CC0).** This covers the goals, bills, acts and moonshots (`HGA-`, `HFL-`, `HEL-` and `HBL-` IDs) wherever their text appears, including `data/catalog.json`, `data/contributions/` and `consensus-lab/data/bills.example.json`. Helios merges many people's wording into one plan that is meant to be adopted into legislation, so the text carries no attribution or share-alike conditions.
- **Rights holder.** All 126 commits on `main` through `2e3652c` were authored by the repository owner, so no outside contribution needed relicensing.
- **Scope limits.** Neither license covers third-party material, which keeps its own terms, or the files below whose source is not yet recorded. Those stay excluded until their source is recorded or they are replaced. `sitemaps/` was removed from the tree rather than licensed.

These licenses do not grant rights that the project does not hold, change upstream licenses, or clear the assets listed below.

No `LICENSE`, `COPYING`, or `NOTICE` file was tracked in the baseline. The initial scan found **206 image/icon assets, including 196 files in `public/flags/`, and 4,589 files under `sitemaps/`**. File counts describe the baseline and do not include later dashboard screenshots. The lack of a notice alongside a file is an unresolved provenance question, not proof of infringement or proof of permission.

## Dependency inventory

`package.json` and `bun.lock` identify the three direct packages. Matching installed package metadata reports the following; metadata is an initial lead, not a complete redistribution review of every bundled component.

| Dependency | Locked version | License metadata observed | Required follow-up |
| --- | --- | --- | --- |
| `pg` | 8.23.1 | MIT | Preserve upstream notices and review the resolved transitive packages. |
| `@electric-sql/pglite` | 0.5.17 | Apache-2.0 | Review its license/notice bundle and embedded PostgreSQL/WebAssembly components. |
| `@playwright/test` | 1.63.0 | Apache-2.0 | Review notices for Playwright and any browser binaries distributed with a release. Test tooling is not copied by the static build. |

Primary upstream projects: [node-postgres](https://github.com/brianc/node-postgres), [PGlite](https://github.com/electric-sql/pglite), and [Playwright](https://github.com/microsoft/playwright). The package lock includes additional transitive dependencies; their exact version-specific terms must be retained rather than replaced with a root license notice.

## Tracked assets and external resources

| Area | Evidence in the repository | Gap to resolve |
| --- | --- | --- |
| Main illustrations | `bridge.png`, `image_1.png` | Record author/source, acquisition or generation history, permission to redistribute, and any notice requirement. |
| Site identity images | `public/og.png`, `public/favicon.svg`, `public/favicon.ico`, five PNG icon files | Establish source and derivation chain, including whether each raster file derives from an original project image. |
| Flags | 196 images under `public/flags/`; used by `support_every_country.html` | Record the actual source collection and terms for these files; do not infer them from a country name or flag design. |
| Geographic shapes | `public/eight-billion-five-laws/data/land.js`; embedded geography in `vote_radar.html` and `helios_braindance.html` | Some comments reference Natural Earth/world-atlas/us-atlas; match each distributed dataset to an exact upstream revision and retain applicable notices. The raw land file has no source header. |
| Population grid | `public/eight-billion-five-laws/data/population.json` | Record the source dataset, version and license. The file has no source header. |
| Embedded images | Reference illustration in `communal_science_lab_webgpu (1).html`; lab preview image in `helios-unified.html` | Record the source or generation history of each image. |
| University data and downloaded documents | `fetch_university_sitemaps.ts` names `Hipo/university-domains-list`; `sitemaps/` contained downloaded responses | Removed from the tree on November 26, 2026 instead of being licensed; the site never used them, and `.gitignore` now keeps future downloads out. Earlier commits still contain the files. |
| Browser libraries loaded externally | Three.js 0.128.0, 0.170.0, and 0.186.1; deck.gl 9.4.1; D3 7.8.5/7.9.0; React/ReactDOM 18.3.1 | Inventory the exact URLs and license/notice obligations for each shipped page. These are not all represented in `bun.lock`. |
| Browser model runtime and weights | `public/local-llama-guard.js` loads `@huggingface/transformers@4.3.2` and `onnx-community/Llama-Guard-3-1B` | Review the runtime and model/conversion licenses separately, including usage conditions and notices. A JavaScript package license does not determine the model-weight terms. No weights are tracked in this baseline. |
| Hosted fonts | Google Fonts CSS imports across HTML pages; Bricolage Grotesque, JetBrains Mono and Public Sans embedded in `helios_ai_landing_page.html` | Inventory each family, its upstream version, and terms before self-hosting or redistributing. The embedded fonts carry their SIL OFL 1.1 notices in that file. Record the external-service behavior independently from source licensing. |
| Draft catalog and narrative material | `data/catalog.json`, historical HTML experiences, narrative pages | The policy text is dedicated under CC0 1.0. Still confirm copied quotations, dataset origins, and any third-party names/characters or referenced assets requiring separate treatment. |
| New screenshot/video evidence | Launch assets added after the baseline | Use fictitious participant text; record source commit and capture context, and exclude personal information and external copyrighted screenshots. |
| Concept media | `public/media/helios-concept-preview.mp4` and `.jpg`, `public/media/helios-rainbow-town-hall.jpg`, and `HELIOS - Concept Preview.mp4` in the repository root, added in `36326df` | Record who made each file and how, including the generator's terms if a tool produced it. |

The static build's allowlist and `public/` copy in [`scripts/build-netlify.mjs`](../../scripts/build-netlify.mjs) determine the public site bundle. A website deployment and a source-code release have different file sets, so checking one does not clear the other.

## How to close the license task

Done on November 26, 2026: the rights holder for the original code was confirmed from the commit history, and `LICENSE` (AGPL-3.0-or-later) and `LICENSE-CC0` (CC0 1.0) were published with the scope described in the [README](../../README.md#licensing). Remaining:

1. For each asset group above without a recorded source, add an attribution record (source URL, exact version/hash, rights holder, license, required notices, modifications, and file paths) or replace the material with an original or clearly licensed alternative. Record which choice was made.
2. Review the locked direct and transitive dependency licenses and retain all applicable notices. Include externally loaded libraries, fonts, model assets, and datasets in the inventory, and add a `THIRD_PARTY_NOTICES` file if a release bundles them.
3. Review the resulting source-release and website bundles.
4. Link the completed review in the launch dashboard, mark L02 complete, and close #99. Until then, the unrecorded assets remain a launch gate.

This document records what was actually inspected and the unresolved work. It is not a full legal clearance.

## Dependency delta after the research/account merge

On November 25, 2026, main commit `f8199008b15821f48ca93df3ad138cd1e05408ba` added two direct packages. Their exact versions were checked in `package.json`, `bun.lock`, and the installed package metadata after a successful frozen-lockfile install:

| Dependency | Locked version | License metadata and notice file observed |
| --- | --- | --- |
| `@supabase/supabase-js` (runtime) | 2.119.2 | MIT; `LICENSE` present |
| `esbuild` (development/build) | 0.28.2 | MIT; `LICENSE.md` present |

The lock also adds Supabase's `auth-js`, `functions-js`, `postgrest-js`, `realtime-js`, and `storage-js` packages at 2.119.2. Include their notices and the generated browser account bundle in the release inventory. This metadata check expands the initial inventory; it does not resolve the missing asset/data provenance or close the project-wide licensing task.
