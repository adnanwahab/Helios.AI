# Neighborhood Consensus

`neighborhood_consensus.html` shows how support for a local proposal spreads
across a neighborhood, week by week. Open it from the **Neighborhood Consensus**
tab on the home page, at `/consensus`, or embedded at `/embed/consensus`.

The page uses **sample ballots for a made-up neighborhood**. They are not real
votes, polling data or a forecast, and the page says so in its header and next
to the table. It reads and writes no Helios data: no goals, amendments, notes,
sessions or email. Nothing is fetched or saved; ballots you paste stay in the
browser tab.

## Reading the surface

- **Left to right:** distance from the proposal's site, from block 1 (next door)
  to block 40 (the far side of the city).
- **Front to back:** weeks of voting, the first week at the front and the latest
  week at the back.
- **Height and colour:** the share voting yes. Cream is near-unanimous, magenta
  is close and blue is losing. The colour bar on the right shows the scale.
- **White lines** on the surface and the floor: the majority line (50%), plus a
  fainter two-thirds line. The floor also shows contours every 5 points.
- **Dashed line:** your block across all weeks. Click the surface to move it, or
  click a table row to pin a week.

**COOPERATION** switches the measure to the share of residents who pitched in that
week by voting, volunteering or coming to a meeting; its lines mark one quarter and
one half. **REPLAY** sweeps through the weeks with a pin per block, sized by how many took part.
**SIMULATE** drops made-up ballots into the latest week, which ripple the surface
(sample proposals only). Drag to orbit, ctrl + scroll (or a trackpad pinch) to
zoom, and double-click to reset. With the 3D view focused, the arrow keys orbit, + and −
zoom, and R replays.

## Five linked views

Under the surface (**MORE VIEWS ↓**), each view follows the selected proposal,
measure, week and block, and picking in any of them updates the others:

1. **Neighborhood map:** a top-down grid of city blocks coloured by their ring's
   share, with the 50% line and your ring. **PLAY WEEKS** animates the weeks.
2. **Share by week:** everyone, blocks 1–10 and blocks 31–40, with ballots per week.
3. **Who took part:** residents, who pitched in, who voted and who voted yes.
4. **Share across blocks:** the smoothed share for the first week, the pinned week
   and now, over the raw tallies for the pinned week.
5. **All proposals:** first week to now for each proposal, against the majority
   and two-thirds lines. Click a row to open that proposal.

## How the surface is computed

Ballots are counted per cell (40 blocks × 30 weeks). Each cell's share is a
local-linear kernel fit over nearby cells: Gaussian weights with σ = 2.3 blocks ×
1.7 weeks for votes and 2.0 × 1.5 for cooperation, within 6 cells. A cell's
weight saturates with its size (n / (n + 12) for votes, n / (n + 40) for
cooperation), so big outer rings don't drown out small inner ones. The fit is
blended 80/20 with the local weighted mean to keep it steady at the edges. Cells
with no ballots nearby borrow from a wider kernel, then from the nearest week with
data, then from the overall mean. The mesh is the grid upsampled four times with
bicubic interpolation.

The four sample proposals are generated from fixed seeds, so every visitor sees
the same data.

## Use your own ballots

Open **Use your own ballots** in the left panel, paste JSON and press **Render**.
**Fill with sample** shows the full format using the garden data.

```json
{
  "title": "Dog park",
  "site": "Oak Hollow",
  "start": "2026-05-03",
  "residents": [60, 90, 120],
  "ballots": [
    {"block": 1, "week": 1, "yes": 9, "no": 3},
    {"block": 12, "week": 2, "vote": "yes"}
  ]
}
```

- `ballots` (required): counts per block and week, or one ballot per row with
  `vote` set to yes or no. Blocks run 1–40 from the site and weeks 1–30; higher
  values fold into the last block or week.
- `residents` (optional): residents per block, starting at block 1. It turns on
  the cooperation view, where pitching in means voting, since pasted data has
  only ballots.
- `start` (optional): the date of week 1, so weeks show as dates.

Pasted proposals appear as **YOURS** and never leave the tab. **SIMULATE** is off
for them.

## Tests

- `bun test test/consensus.test.js`: tab, routes, both builds and sitemap; the
  page has no root-relative URLs, loads nothing but Google Fonts, carries its
  sample-data labels, and its script parses.
- `test/browser/consensus.e2e.js`: the page, table and five views render with or
  without WebGL2; table, measure and proposal changes stay linked; pasted
  ballots render; the home tab embeds it; and a 390px phone doesn't scroll
  sideways.
