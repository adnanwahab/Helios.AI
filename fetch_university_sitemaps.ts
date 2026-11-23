#!/usr/bin/env bun
/**
 * Fetch the sitemap.xml of every university domain in the world.
 *
 * Source list: Hipo/university-domains-list (about 9,000+ universities, with
 * their domains, across ~200 countries).
 *
 * Usage:
 *   bun run fetch-university-sitemaps.ts                  # all universities
 *   bun run fetch-university-sitemaps.ts --limit 50       # first 50 domains
 *   bun run fetch-university-sitemaps.ts --concurrency 30 --out ./sitemaps
 *
 * Output:
 *   <out>/<domain>.xml   the raw sitemap XML for each domain that had one
 *   <out>/index.json     one record per domain: status, sitemap URL, size, etc.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATASET_URL =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";

type University = {
  name: string;
  country: string;
  domains: string[];
  web_pages?: string[];
};

type Result = {
  domain: string;
  university: string;
  country: string;
  sitemapUrl?: string;
  file?: string;
  bytes?: number;
  status: "found" | "not_found";
  httpStatus?: number;
};

// ---- CLI args ---------------------------------------------------------------

const args = Bun.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const LIMIT = Number(flag("--limit", "0")); // 0 = no limit
const CONCURRENCY = Math.max(1, Number(flag("--concurrency", "20")));
const OUT_DIR = flag("--out", "./sitemaps");
const TIMEOUT_MS = Number(flag("--timeout", "15000"));

// ---- HTTP helpers -----------------------------------------------------------

async function get(url: string) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; university-sitemap-collector/1.0)" },
    });
    const body = res.ok ? await res.text() : undefined;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: undefined };
  }
}

const SITEMAP_ROOT = /<(urlset|sitemapindex)[\s>]/i;

async function findSitemap(domain: string) {
  const bare = domain.replace(/^www\./i, "");
  const candidates = [`https://${bare}/sitemap.xml`, `https://www.${bare}/sitemap.xml`];

  let lastStatus: number | undefined;
  for (const url of candidates) {
    const r = await get(url);
    lastStatus = r.status;
    if (r.ok && r.body && SITEMAP_ROOT.test(r.body)) {
      return { url, body: r.body, httpStatus: r.status };
    }
  }
  return { url: undefined, body: undefined, httpStatus: lastStatus };
}

// ---- Worker pool ------------------------------------------------------------

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ---- Main -------------------------------------------------------------------

async function main() {
  console.log(`Downloading university list…`);
  const listRes = await fetch(DATASET_URL);
  if (!listRes.ok) throw new Error(`Dataset request failed: HTTP ${listRes.status}`);
  const universities = (await listRes.json()) as University[];

  // Deduplicate domains; the first university that claims a domain wins the label.
  const byDomain = new Map<string, { name: string; country: string }>();
  for (const u of universities) {
    for (const d of u.domains ?? []) {
      const key = d.trim().toLowerCase();
      if (key && !byDomain.has(key)) byDomain.set(key, { name: u.name, country: u.country });
    }
  }

  let entries = [...byDomain.entries()];
  if (LIMIT > 0) entries = entries.slice(0, LIMIT);

  console.log(
    `${universities.length} universities, ${byDomain.size} unique domains, fetching ${entries.length} ` +
      `(concurrency ${CONCURRENCY}) → ${OUT_DIR}`,
  );
  await mkdir(OUT_DIR, { recursive: true });

  const results: Result[] = [];
  let done = 0;

  await runPool(entries, CONCURRENCY, async ([domain, meta]) => {
    const found = await findSitemap(domain);
    const base: Omit<Result, "status"> = {
      domain,
      university: meta.name,
      country: meta.country,
      httpStatus: found.httpStatus,
    };

    if (found.url && found.body) {
      const file = join(OUT_DIR, `${domain.replace(/[^a-z0-9.-]/g, "_")}.xml`);
      await writeFile(file, found.body);
      results.push({
        ...base,
        status: "found",
        sitemapUrl: found.url,
        file,
        bytes: Buffer.byteLength(found.body),
      });
    } else {
      results.push({ ...base, status: "not_found" });
    }

    done++;
    if (done % 100 === 0 || done === entries.length) {
      const hits = results.filter((r) => r.status === "found").length;
      console.log(`  ${done}/${entries.length} checked, ${hits} sitemaps found`);
    }
  });

  results.sort((a, b) => a.domain.localeCompare(b.domain));
  await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(results, null, 2));

  const found = results.filter((r) => r.status === "found").length;
  console.log(`\nDone: ${found} sitemaps found, ${results.length - found} not found.`);
  console.log(`Index written to ${join(OUT_DIR, "index.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
