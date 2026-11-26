// Helios lines: how a blog post votes. One line anywhere in a post, such as
//   Helios: support FREE-WEED HGA-031; oppose HGA-012
// The /blogs page (builder and checker) and the server's blog reader share
// this module, so a line reads the same way in the browser and on the server.
// Helios counts only what a line says. It never infers a position from prose.
import {cannabisDraft} from './cannabis-budget.js';

export const FREE_WEED = cannabisDraft.id;
export const FREE_WEED_CODE = 'FREE-WEED';
export const POSITIONS = Object.freeze(['support', 'oppose', 'unsure']);
export const LAW_IDS = Object.freeze([FREE_WEED, ...Array.from({length: 100}, (_, i) => 'HGA-' + String(i + 1).padStart(3, '0'))]);
const KNOWN = new Set(LAW_IDS);

const STANCES = new Map([
  ...['support', 'supports', 'yes', 'for', 'aye', 'pro', '+', '👍'].map(word => [word, 'support']),
  ...['oppose', 'opposes', 'no', 'against', 'nay', 'con', '-', '👎'].map(word => [word, 'oppose']),
  ...['unsure', 'abstain', 'undecided', 'maybe', '?'].map(word => [word, 'unsure']),
  ...['withdraw', 'withdraws', 'clear', 'retract'].map(word => [word, 'withdraw']),
]);
const ALIASES = new Set(['free-weed', 'freeweed', 'free-joints', 'freejoints', 'draft-cannabis', 'free-weed-for-everyone']);
// Ordinary words around IDs are skipped quietly; anything else is reported.
const FILLER = new Set(['i', 'we', 'my', 'our', 'and', '&', 'but', 'also', 'the', 'a', 'to', 'of', 'on', 'in', 'vote', 'votes', 'law', 'laws', 'please']);
// "Helios:" or "Helios votes:" not inside a longer word (Heliosphere, Helios.AI).
const LINE = /(?:^|[^\p{L}\p{N}_])helios(?:\s+votes?)?\s*:\s*(.*)$/iu;
export const MAX_ENTRIES = LAW_IDS.length + 1;

// HGA-031, hga31, HFL-031 (the original proposal number) and FREE-WEED aliases.
export function lawId(token) {
  const text = String(token ?? '').toLowerCase();
  if (ALIASES.has(text)) return FREE_WEED;
  const match = text.match(/^(?:hga|hfl)-?0*(\d{1,3})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 100 ? 'HGA-' + String(n).padStart(3, '0') : null;
}

export const lawCode = id => (id === FREE_WEED ? FREE_WEED_CODE : id);

// Returns the post's entries in order. A later mention of the same law wins,
// and "withdraw all" (law "*") clears everything before it.
export function parseHeliosLines(text) {
  const entries = [], lines = [], ignored = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const match = raw.match(LINE);
    if (!match) continue;
    let stance = null, found = 0;
    for (const piece of match[1].split(/[\s,;]+/)) {
      if (!piece) continue;
      let token = piece.toLowerCase();
      if (STANCES.has(token)) { stance = STANCES.get(token); continue; }
      token = piece.replace(/^[("'“‘[]+|[)"'”’\].!:?]+$/gu, '');
      if (!token) continue;
      const lower = token.toLowerCase();
      if (STANCES.has(lower)) { stance = STANCES.get(lower); continue; }
      const prefix = token.length > 1 && STANCES.has(token[0]) && /^[+\-?]/.test(token) ? STANCES.get(token[0]) : null;
      const body = prefix ? token.slice(1) : token;
      if (body.toLowerCase() === 'all' && (prefix ?? stance) === 'withdraw') { entries.push({law: '*', position: 'withdraw'}); found++; continue; }
      const law = lawId(body);
      if (!law) { if (!FILLER.has(lower) && ignored.length < 20) ignored.push(token); continue; }
      const position = prefix ?? stance;
      if (!position) { if (ignored.length < 20) ignored.push(token); continue; }
      entries.push({law, position});
      found++;
    }
    if (found && lines.length < 10) lines.push(raw.trim().slice(0, 300));
  }
  // Keep only what follows the last "withdraw all", then the last mention of each law.
  const start = entries.map(e => e.law).lastIndexOf('*');
  const tail = start >= 0 ? entries.slice(start) : entries;
  const last = new Map();
  tail.forEach((entry, index) => last.set(entry.law, index));
  const result = tail.filter((entry, index) => last.get(entry.law) === index).slice(0, MAX_ENTRIES);
  return {entries: result, lines, ignored};
}

// Posts in the order they were written: [{entries, ...post}]. Returns
// Map(law -> {position, post}) with the newest position for each law.
export function foldVotes(posts) {
  const current = new Map();
  for (const post of posts) {
    for (const {law, position} of post.entries || []) {
      if (law === '*') current.clear();
      else if (!KNOWN.has(law)) continue;
      else if (position === 'withdraw') current.delete(law);
      else if (POSITIONS.includes(position)) current.set(law, {position, post});
    }
  }
  return current;
}

const order = law => (law === FREE_WEED ? 0 : Number(law.slice(4)));
// [[lawId, position], ...] -> "Helios: support FREE-WEED HGA-031; oppose HGA-012"
export function formatHeliosLine(choices) {
  const groups = {support: [], oppose: [], unsure: [], withdraw: []};
  for (const [law, position] of choices) if (KNOWN.has(law) && groups[position]) groups[position].push(law);
  const parts = Object.entries(groups).filter(([, ids]) => ids.length)
    .map(([position, ids]) => position + ' ' + ids.sort((a, b) => order(a) - order(b)).map(lawCode).join(' '));
  return parts.length ? 'Helios: ' + parts.join('; ') : '';
}
