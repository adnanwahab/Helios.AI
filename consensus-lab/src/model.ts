import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DIMENSIONS, type Agent, type AgentVote, type BillDefinition, type Effects, type GroupDefinition, type GroupMetrics, type Stage, type VoteMetrics } from "./types.ts";

export const metadata = JSON.parse(readFileSync(new URL("../data/model-metadata.json", import.meta.url), "utf8"));
export const dimensionLabels = Object.fromEntries(metadata.dimensions.map((d: {id: string; label: string}) => [d.id, d.label])) as Record<typeof DIMENSIONS[number], string>;
export const groups: GroupDefinition[] = metadata.groups;
export const stages: Stage[] = metadata.stages;
export const defaultBills: BillDefinition[] = JSON.parse(readFileSync(new URL("../data/bills.example.json", import.meta.url), "utf8"));

export const clamp = (value: number, low = -1, high = 1): number => Math.max(low, Math.min(high, value));
export const rounded = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
export const hashText = (value: string): string => createHash("sha256").update(value).digest("hex");

/** A seed-local PRNG means adding one bill does not perturb the other bills. */
export function seededRandom(seed: string): () => number {
  let state = parseInt(hashText(seed).slice(0, 8), 16) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function dot(weights: Effects, effects: Effects): number {
  return DIMENSIONS.reduce((total, dimension) => total + weights[dimension] * effects[dimension], 0);
}

export function createAgents(seed: string, count: number): Agent[] {
  return Array.from({ length: count }, (_, index) => {
    const id = "agent-" + String(index + 1).padStart(3, "0");
    const random = seededRandom(seed + ":agent:" + id);
    const group = groups[index % groups.length];
    const raw = Object.fromEntries(DIMENSIONS.map(d => [d, group.weights[d] * (.62 + .76 * random())])) as Effects;
    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const weights = Object.fromEntries(DIMENSIONS.map(d => [d, raw[d] / total])) as Effects;
    return {
      id, label: "Agent " + String(index + 1).padStart(3, "0"), groupId: group.id, weights,
      openness: rounded(.22 + .73 * random()), evidenceTrust: rounded(.30 + .65 * random()),
      participationPropensity: rounded(.70 + .27 * random()), decisionThreshold: rounded(.13 + .17 * random()),
      minimumConfidence: rounded(.34 + .24 * random()), baselineLean: rounded((random() - .5) * .48),
    };
  });
}

export function aggregateVotes(votes: AgentVote[]): VoteMetrics {
  const eligible = votes.length;
  const support = votes.filter(v => v.status === "support").length;
  const oppose = votes.filter(v => v.status === "oppose").length;
  const abstain = votes.filter(v => v.status === "abstain").length;
  const absent = votes.filter(v => v.status === "absent").length;
  const participated = eligible - absent;
  const decisive = support + oppose;
  const present = votes.filter(v => v.status !== "absent");
  const opinionMean = participated ? present.reduce((n, v) => n + v.opinion, 0) / participated : null;
  const spread = opinionMean === null ? null : Math.sqrt(present.reduce((n, v) => n + (v.opinion - opinionMean) ** 2, 0) / participated);
  const byGroup = [...new Set(votes.map(v => v.groupId))].map(id => votes.filter(v => v.groupId === id));
  return {
    eligible, participated, decisive, support, oppose, abstain, absent,
    supportAll: eligible ? support / eligible : 0,
    supportCast: participated ? support / participated : null,
    supportDecisive: decisive ? support / decisive : null,
    participation: eligible ? participated / eligible : 0,
    opinionMean: opinionMean === null ? null : rounded(opinionMean),
    opinionSpread: spread === null ? null : rounded(spread),
    confidenceMean: participated ? rounded(present.reduce((n, v) => n + v.confidence, 0) / participated) : null,
    minimumGroupSupport: byGroup.length ? Math.min(...byGroup.map(g => g.filter(v => v.status === "support").length / g.length)) : null,
    unanimousEligibleSupport: eligible > 0 && support === eligible,
  };
}

export function aggregateGroups(votes: AgentVote[]): GroupMetrics[] {
  return groups.map(group => ({ groupId: group.id, label: group.label, ...aggregateVotes(votes.filter(v => v.groupId === group.id)) }));
}

export function validateBills(value: unknown): BillDefinition[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error("Bills must be a non-empty JSON array with at most 50 entries.");
  const ids = new Set<string>();
  function object(input: unknown, path: string): Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(path + " must be an object.");
    return input as Record<string, unknown>;
  }
  function string(input: unknown, path: string, max = 20000): string {
    if (typeof input !== "string" || !input.trim() || input.length > max) throw new Error(path + " must be a non-empty string of at most " + max + " characters.");
    return input;
  }
  function effects(input: unknown, path: string): Effects {
    const result = object(input, path);
    for (const dimension of DIMENSIONS) {
      if (typeof result[dimension] !== "number" || !Number.isFinite(result[dimension]) || Math.abs(result[dimension] as number) > 1) throw new Error(path + "." + dimension + " must be a finite number from -1 to 1.");
    }
    return Object.fromEntries(DIMENSIONS.map(d => [d, result[d]])) as Effects;
  }
  return value.map((item, index) => {
    const path = "bills[" + index + "]";
    const bill = object(item, path);
    const id = string(bill.id, path + ".id", 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new Error(path + ".id must use letters, digits, dots, hyphens or underscores.");
    if (ids.has(id)) throw new Error("Duplicate bill id: " + id);
    ids.add(id);
    const initial = object(bill.initial, path + ".initial");
    const amendment = object(bill.amendment, path + ".amendment");
    const evidence = object(bill.evidence, path + ".evidence");
    if (typeof evidence.quality !== "number" || !Number.isFinite(evidence.quality) || evidence.quality < 0 || evidence.quality > 1) throw new Error(path + ".evidence.quality must be a number from 0 to 1.");
    return {
      id, title: string(bill.title, path + ".title", 200), topic: string(bill.topic, path + ".topic", 200),
      summary: string(bill.summary, path + ".summary"), provenance: string(bill.provenance, path + ".provenance"),
      initial: { text: string(initial.text, path + ".initial.text"), effects: effects(initial.effects, path + ".initial.effects") },
      amendment: { text: string(amendment.text, path + ".amendment.text"), summary: string(amendment.summary, path + ".amendment.summary"), effects: effects(amendment.effects, path + ".amendment.effects") },
      evidence: { summary: string(evidence.summary, path + ".evidence.summary"), quality: evidence.quality, adjustments: effects(evidence.adjustments, path + ".evidence.adjustments") },
    };
  });
}
