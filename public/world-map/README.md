# Helios world suitability map

This browser-only experiment compares **1,526 land-centered H3 resolution-2 cells** with five adjustable preference weights. Its selected-cell paragraph, criterion breakdown, and fixed color scale update together. No login, server writes, private data, or AI credentials are required.

## Routes and embedding

- Canonical route: `/world-map` (rewritten to this directory's `index.html`).
- Direct source page: `/public/world-map/index.html`.
- GitHub Pages: `<repository-prefix>/public/world-map/index.html`. A small entry-page base resolver keeps styles, scripts, favicon, and navigation relative to that repository; module imports and data resolve against the module URL.
- Embedded route: `/world-map?embed=1`.
- Rainbow view: `/world-map?kaleidoscope=1`. Omit the flag for the default suitability colors; only the exact value `1` enables it.
- Query parameters: `climate`, `cost`, `city`, `nature`, `coast` accept integers 0–100. `cell` accepts an ID present in the bundled data. Invalid values fall back to defaults; unrelated parameters cannot alter the model.
- Slider changes and cell selection replace the URL, preserving a shareable state without adding hundreds of browser-history entries.
- Embedded mode sends `{type: 'helios:world-map:size', height}` to the **same origin** after layout changes. Height measures the content root so the iframe can shrink when details close. The parent must validate both `event.origin` and `event.source` before applying the height.

The host page loads the iframe on demand. The iframe then loads only local, versioned assets; there are no map-tile or third-party data requests. The data fetch has a timeout and a visible retry state.

## Kaleidoscope colors

The **Kaleidoscope** toggle switches the hexagon fills to a decorative rainbow palette. Its sixfold spatial pattern is computed once per cell. One slow CSS hue rotation animates the complete fill layer; geographic outlines, grid borders, selection, and text stay outside that layer. The toggle restores the current suitability colors when switched off, including the neutral all-zero state. Scores, ordering, selection, and the explanatory paragraph always use the same preference model.

**Pause colors** freezes the current colors and **Resume colors** continues them. Animation pauses while the document is hidden or the map is offscreen. With reduced motion enabled, the map uses still rainbow colors and hides the pause control. The suitability color legend is replaced with an explicit rainbow-mode label while the effect is active. The URL preserves the selected color mode alongside preferences and the selected cell; the temporary pause state is local to the page.

UI selectors: `#kaleidoscope-toggle` has a stable accessible name and `aria-pressed`; `#kaleidoscope-pause` supplies the pause/resume action. The root exposes `data-color-mode="fit|kaleidoscope"` and `data-color-motion="off|running|paused|reduced|suspended"`. The animated element is `.hex-layer`. `readUrlState()` returns a `kaleidoscope` boolean, and `stateSearch(weights, selectedId, embed = false, kaleidoscope = false)` preserves existing callers.

## Model

Each criterion returns a fixed 0–100 score. Combined suitability is the sum of weighted scores divided by the sum of weights. Zero excludes a criterion; all-zero weights produce an unranked map.

| Criterion | Definition | Interpretation |
| --- | --- | --- |
| Mild climate | `100 × exp(-((abs(latitude) - 32) / 24)²)` | A latitude-only demonstration, not climate observations. |
| Lower living costs | Smooth deterministic field on spherical coordinates | Synthetic. It does not describe prices, incomes, or affordability. |
| Near cities | `100 × exp(-cityKm / 240)` | Straight-line proximity to the included city points, not travel access. |
| Nature access | Independent smooth deterministic spherical field | Synthetic. It does not describe vegetation or protected areas. |
| Near the coast | `100 × exp(-coastKm / 280)` | Approximate distance to a generalized land/ocean coastline. |

`model.js` contains the complete formulas, URL validation, ranking, and explanation logic. Synthetic patterns use spherical coordinates so the international date line has no artificial seam. Weights describe importance, not measured happiness or quality of life. Strengths can compensate for weaknesses in this weighted-average model.

The explanation describes the highest weighted contribution and shortfall. Country membership comes from the center point; a regional cell can cross borders and coastlines. H3 cells vary in area and the global grid contains twelve pentagons per resolution. The cells displayed here are hexagons. Some small islands have no cell centers at this resolution. Antarctica is retained as an outline without scores.

## Data and licenses

`world-data.json` is a static generated snapshot; its `meta` object records the original sources, construction details, and timestamp. It contains country geometry, H3 cell boundaries, and precomputed approximate distances. Country boundaries are cartographic context, not an endorsement of territorial claims.

- Country geometry: Natural Earth 1:110m via [`@d3-maps/atlas` 1.0.0](https://esm.sh/@d3-maps/atlas@1.0.0/world/countries/countries-110m).
- City points: [Natural Earth 1:50m populated places](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-populated-places/). The distance calculation uses 987 mapped places with `POP_MAX >= 100000` or national-capital status. This is a cartographic selection, not a current census.
- Coastlines: [Natural Earth 1:110m physical vectors](https://www.naturalearthdata.com/downloads/110m-physical-vectors/), using 4,994 generalized line segments. Distances use spherical segment calculations, not country boundaries.
- Grid: [H3](https://h3geo.org/docs/core-library/overview/), generated at resolution 2. H3's library is not needed at runtime.
- Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- The bundled [D3 7.9.0](https://d3js.org/) runtime carries Mike Bostock's copyright and ISC license in `vendor/LICENSE-d3.txt`. Its distribution notice is also retained in the JavaScript file.

## Checks

Run `bun test test/world-map.test.js` for weighted-score invariants, all-zero behavior, URL validation, international-date-line continuity, distance direction, and bundled-data consistency. Browser coverage should additionally check direct/embedded routes, slider interaction, selection/reload, keyboard controls, error recovery, and desktop/mobile layout.
