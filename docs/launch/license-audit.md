# Initial dependency and asset rights audit

**Status: incomplete; project-wide license not applied.** Reviewed November 25, 2026 against launch-branch baseline `5ca54f8cd03c20b6e11a885d4d5375108d216f82`. Tracking issue: [#99](https://github.com/adnanwahab/HeliosHTML/issues/99).

## Proposed choice

MIT is the candidate for original Helios code and its accompanying original documentation. It supports broad reuse with retained copyright and license notices, which fits a contributor-focused project. This proposal does not grant rights that the project does not hold, change upstream licenses, or clear the assets listed below. GitHub's [licensing guide](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) and [MIT summary and text](https://choosealicense.com/licenses/mit/) explain the expected license file and notice requirements.

No `LICENSE`, `COPYING`, or `NOTICE` file was tracked in the baseline. The initial scan found **206 image/icon assets, including 196 files in `public/flags/`, and 4,589 files under `sitemaps/`**. File counts describe the baseline and do not include later dashboard screenshots. The lack of a notice alongside a file is an unresolved provenance question, not proof of infringement or proof of permission.

## Dependency inventory

`package.json` and `bun.lock` identify the three direct packages. Matching installed package metadata reports the following; metadata is an initial lead, not a complete redistribution review of every bundled component.

| Dependency | Locked version | License metadata observed | Required follow-up |
| --- | --- | --- | --- |
| `pg` | 8.23.1 | MIT | Preserve upstream notices and review the resolved transitive packages. |
| `@electric-sql/pglite` | 0.5.17 | Apache-2.0 | Review its license/notice bundle and embedded PostgreSQL/WebAssembly components. |
| `@playwright/test` | 1.63.0 | Apache-2.0 | Review notices for Playwright and any browser binaries distributed with a release. Test tooling is not copied by the static build. |

Primary upstream projects: [node-postgres](https://github.com/brianc/node-postgres), [PGlite](https://github.com/electric-sql/pglite), and [Playwright](https://github.com/microsoft/playwright). The package lock includes additional transitive dependencies; their exact version-specific terms must be retained rather than replaced with a root MIT notice.

## Tracked assets and external resources

| Area | Evidence in the repository | Gap to resolve |
| --- | --- | --- |
| Main illustrations | `bridge.png`, `image_1.png` | Record author/source, acquisition or generation history, permission to redistribute, and any notice requirement. |
| Site identity images | `public/og.png`, `public/favicon.svg`, `public/favicon.ico`, five PNG icon files | Establish source and derivation chain, including whether each raster file derives from an original project image. |
| Flags | 196 images under `public/flags/`; used by `support_every_country.html` | Record the actual source collection and terms for these files; do not infer them from a country name or flag design. |
| Geographic shapes | `public/eight-billion-five-laws/data/land.js`; embedded geography in `vote_radar.html` and `helios_braindance.html` | Some comments reference Natural Earth/world-atlas/us-atlas; match each distributed dataset to an exact upstream revision and retain applicable notices. The raw land file has no source header. |
| University data and downloaded documents | `fetch_university_sitemaps.ts` names `Hipo/university-domains-list`; `sitemaps/` contains downloaded responses | Review source-list terms separately from each downloaded site's XML/HTML terms. These files are not copied by `build-netlify.mjs`, but are still distributed by cloning the repository. |
| Browser libraries loaded externally | Three.js 0.128.0, 0.170.0, and 0.186.1; deck.gl 9.4.1; D3 7.8.5/7.9.0; React/ReactDOM 18.3.1 | Inventory the exact URLs and license/notice obligations for each shipped page. These are not all represented in `bun.lock`. |
| Browser model runtime and weights | `public/local-llama-guard.js` loads `@huggingface/transformers@4.3.2` and `onnx-community/Llama-Guard-3-1B` | Review the runtime and model/conversion licenses separately, including usage conditions and notices. A JavaScript package license does not determine the model-weight terms. No weights are tracked in this baseline. |
| Hosted fonts | Google Fonts CSS imports across HTML pages | Inventory each family, its upstream version, and terms before self-hosting or redistributing. Record the external-service behavior independently from source licensing. |
| Draft catalog and narrative material | `data/catalog.json`, historical HTML experiences, narrative pages | Confirm authorship, copied quotations, dataset origins, and any third-party names/characters or referenced assets requiring separate treatment. |
| New screenshot/video evidence | Launch assets added after the baseline | Use fictitious participant text; record source commit and capture context, and exclude personal information and external copyrighted screenshots. |

The static build's allowlist and `public/` copy in [`scripts/build-netlify.mjs`](../../scripts/build-netlify.mjs) determine the public site bundle. A website deployment and a source-code release have different file sets, so checking one does not clear the other.

## How to close the license task

1. Add an attribution record for each asset group with source URL, exact version/hash, rights holder, license, required notices, modifications, and the file paths covered.
2. Resolve missing provenance: obtain the actual permission evidence, replace the material with an original or clearly licensed alternative, or explicitly exclude it from the intended release. Record which choice was made.
3. Review the locked direct and transitive dependency licenses and retain all applicable notices. Include externally loaded libraries, fonts, model assets, and datasets in the inventory.
4. Confirm who holds rights to the original project code and identify any contributions governed by different terms. The public repository owner's name alone is not evidence for every file's authorship.
5. Publish the approved `LICENSE` with accurate holders and scope plus any `THIRD_PARTY_NOTICES` or per-asset license files. Keep third-party terms intact. Review the resulting source-release and website bundles.
6. Link the completed review and license commit in the launch dashboard, then mark the license item complete. Until then, it remains a launch blocker.

This document records what was actually inspected and the unresolved work. It is not a full legal clearance or an assertion that all dependencies are compatible with a blanket MIT license.
