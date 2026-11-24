# Three-editor merge: S3 layout for 8 billion journals

`three_editor_merge.html` (served at `/merge` and as the home-page tab `/embed/merge`)
shows two journals on the sides and, in the middle, the constitution merged from them
with duplicates removed. It scrolls through 4,000,000,000 pairs: pair r holds journals
2r and 2r+1.

This document is the storage layout that would serve that scroll from S3. The page
itself sends no requests. It generates each sample journal in the browser from its
number and lists the requests it would make under **S3 layout → Requests from this
tab**. The page shows the same rules in its **S3 layout** panel; keep the two in step.

The bucket name `helios-journals` is a placeholder, set by `BUCKET` in the page.

## Keys

```
s3://helios-journals/
  CURRENT.json                                    layout version readers use: {"layout":"v1"}
  v1/
    l00/heads/41234.json                          current generation of each of chapter 41234's 1,000 pages
    l00/pages/41234/567.g0004.ndjson.gz           journals 4,123,456,700 to 4,123,456,799
    l01/heads/20617.json
    l01/pages/20617/283.g0003.ndjson.gz           level-1 constitutions 2,061,728,300 to 2,061,728,399
    l02/ … l32/
    l33/pages/00000/000.g0003.ndjson.gz           level 33: one constitution for everyone
    ids/8f3/c2a.json                              journal id → journal number
    delta/l00/41234/20261123T151004Z-7f2c.ndjson  an edit waiting for compaction
```

## Rules

1. **The number is the path.** Write a journal's number as 10 digits: the first 5 name
   the chapter folder, the next 3 the page file, the last 2 the line in that page,
   counting from 0. Journal 4,123,456,789 is line 89 of `l00/pages/41234/567`.
   Constitutions follow the same rule with their node number under `l01/` to `l33/`.
2. **Scrolling is arithmetic, never LIST.** Pair r is on page floor(r ÷ 50) of `l00/`,
   in chapter floor(r ÷ 50,000). A reader fetches `CURRENT.json` once, a chapter head
   once per 100,000 journals, then one page per 50 pairs, and requests the next page
   before the reader reaches it. LIST returns at most 1,000 keys per call, so it stays
   out of the browse path.
3. **Pages never change; heads do.** Rewriting a page writes its next generation
   (`g0003`, then `g0004`) under a new key, so pages can be served with
   `Cache-Control: public, max-age=31536000, immutable`. A chapter head is
   `{"level":0,"chapter":41234,"gen":[4,1,3,…]}` with one generation per page (1,000
   entries), served with `max-age=60`.
4. **Edits land in `delta/`, then compact.** An edit is a small PUT of one NDJSON line,
   `{"n":4123456789,"text":"…","at":"2026-11-23T15:10:04Z"}`. A compactor reads a
   chapter's head and keeps its ETag, folds the deltas into new page generations
   written with `If-None-Match: *`, then writes the head with `If-Match: <ETag>`. If
   another compactor got there first, S3 refuses the write with 412 Precondition
   Failed; the compactor reads the head again and retries. Applied deltas are then
   deleted.
5. **Constitutions form a binary tree.** Node i at level k merges nodes 2i and 2i+1 of
   level k−1; 2^33 is more than 8 billion, so level 33 has one node. Editing journal n
   makes one node per level stale, node floor(n ÷ 2^k), 33 in all, and a merge job
   recomputes them level by level. The page merges level 1 live; model-written
   constitutions would be read from `l01/` and up exactly as journals are.
6. **Number journals by place.** If numbers follow a Hilbert or S2 cell order of where
   writers live, every subtree is a place: level 10 is about 1,000 neighbors, level 20
   about a million people.
7. **Spread writes across chapters.** S3 supports at least 3,500 writes or 5,500 reads
   per second per partitioned prefix, with no limit on the number of prefixes. Backfill
   with one writer per range of chapter folders; readers come through a CDN.
8. **Jump by id.** `ids/` maps a journal id to its number. The first 6 hex characters of
   the id pick one of 16,777,216 files, about 480 entries each:
   `{"8f3c2a91…":4123456789,…}`.

## Page format

One JSON object per line, 100 lines, gzipped and served with `Content-Encoding: gzip`
so browsers unpack it:

```
{"n":4123456789,"id":"8f3c2a91…","updated":"2026-11-21","text":"Need: …"}
```

## Scale and cost

| | |
| --- | --- |
| Journals | 8,000,000,000 |
| Journal pages, 100 each | 80,000,000 |
| Chapter folders, 1,000 pages each | 80,000 |
| Constitutions, levels 1 to 33 | about 8,000,000,000 |
| Journals, gzipped | about 11 TB |
| With constitutions | about 21 TB, roughly $500 a month |
| First upload as pages | 160,000,000 PUTs, about $800 |
| First upload, one object per journal and node | 16,000,000,000 PUTs, about $80,000 |
| Scrolling 1,000 pairs | 20 page GETs, 1 or 2 heads |

Sizes assume about 4 KB of text per journal (and per constitution) and 3× gzip. Prices
are S3 Standard in us-east-1, checked November 2026: $0.023 per GB-month for the first
50 TB and $0.005 per 1,000 PUT requests.

## References

- [Amazon S3 performance guidelines](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html): request rates per partitioned prefix
- [Conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html): `If-None-Match` and `If-Match` on PutObject
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
