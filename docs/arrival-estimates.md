# Arrival estimates for the shared goals

Every goal in the `/laws` library (the 100 editorial goals HGA-001 to HGA-100, plus
community proposals) shows an **estimated arrival date**: when it could finish human
review and a one-week public advisory vote at an assumed pace. Cards show the
expected date; the goal drawer shows the range, its place in the review queue, the
date for each remaining stage and the assumptions. The collection summary shows the
first and last expected arrival.

An arrival estimate is a planning aid. It is **not** a schedule, a commitment, a
prediction of enactment, or official status, and the page says so next to every
full estimate. Moonshots get no estimate.

## How the date is computed

`public/eta.js` is a classic script (no build step) that exposes
`globalThis.HeliosETA`. It is a pure function of the goals and an `asOf` date; the
page uses today's date and recomputes on every render, so new community proposals
get an estimate immediately.

1. **Cycle start.** Work starts on the Monday on or after `asOf` (UTC).
2. **Queue.** In each category, goals still waiting for review queue with editorial
   goals first (ID order) and community proposals after them (oldest first). Each
   week reviewers start the next goal in every category.
3. **Remaining stages**, from each goal's `reviewStatus` and `publicVoteStatus`:

   | Stage | Expected | Range |
   | --- | --- | --- |
   | Reviewer assigned | 7 days | 3–14 |
   | Legal, evidence and cost review (in parallel) | 21 days | 14–42 |
   | Approved for a public advisory vote | 7 days | 3–14 |
   | One-week advisory vote closes | 7 days | 7 |
   | Queue cadence between starts in a category | 7 days | 3.5–14 |

   `reviewStatus` `approved` or `reviewed` skips the first two stages,
   `publicVoteStatus` `open` leaves only the vote, and `closed` marks the goal as
   arrived. Any other value fails closed and counts every stage.
4. **Range.** The earliest date uses every low value, the latest every high value.

The model matches Civic Synthesis (`src/shared/bill-eta.ts` in
`adnanwahab/dear_congress`), so while both are unreviewed, HGA-n and its source
HFL-n show the same date. With work starting Monday 2026-11-23, expected arrivals
run from **Jan 4, 2027** to **Mar 8, 2027**; the full range is Dec 20, 2026 to
Jun 14, 2027.

To change the pace, edit `MODEL` in `public/eta.js`. The drawer reads its stated
assumptions from the same object.

## What did not change

`data/catalog.json` and the embedded dataset are untouched, so the stored catalog
hash still matches and no migration is needed. No votes, notes, versions or
amendments are read differently or written.

## Validation

- `bun test test/eta.test.js`: pinned-date estimates, per-category queues, community
  proposals, status handling, fail-closed values, purity and formatting.
- `test/browser/library.e2e.js`: every goal card shows an estimate, the drawer shows
  the stage list and disclaimer, and moonshots show none.
