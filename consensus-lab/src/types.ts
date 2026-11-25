export const DIMENSIONS = ["affordability", "equity", "privacy", "environment", "cost", "delivery"] as const;
export type Dimension = typeof DIMENSIONS[number];
/** Positive cost means budget discipline / affordability to the treasury, not higher spending. */
export type Effects = Record<Dimension, number>;
export type VoteStatus = "support" | "oppose" | "abstain" | "absent";

export interface BillDefinition {
  id: string;
  title: string;
  topic: string;
  summary: string;
  provenance: string;
  initial: { text: string; effects: Effects };
  amendment: { text: string; summary: string; effects: Effects };
  evidence: {
    /** This is an invented scenario assumption, not an empirical finding. */
    summary: string;
    quality: number;
    adjustments: Effects;
  };
}
export interface GroupDefinition {
  id: string;
  label: string;
  description: string;
  weights: Effects;
}
export interface Agent {
  id: string;
  label: string;
  groupId: string;
  weights: Effects;
  openness: number;
  evidenceTrust: number;
  participationPropensity: number;
  decisionThreshold: number;
  minimumConfidence: number;
  baselineLean: number;
}
export interface Stage {
  id: "first-impressions" | "evidence" | "discussion" | "amended-text" | "re-vote";
  index: number;
  label: string;
  description: string;
  version: "v1" | "v2";
  ballotKind: "preference-check" | "final-simulation-ballot";
}
export interface BillVersion {
  id: string;
  label: "v1" | "v2";
  hash: string;
  text: string;
  effects: Effects;
}
export interface Contribution {
  dimension: Dimension;
  value: number;
}
export interface AgentVote {
  agentId: string;
  groupId: string;
  versionId: string;
  status: VoteStatus;
  opinion: number;
  confidence: number;
  reason: string;
  changeRequest: string;
  contributions: Contribution[];
  previousStatus: VoteStatus | null;
  changed: boolean;
  /** These values are model inputs, never claimed to describe a real person. */
  participationRoll: number;
}
export interface VoteMetrics {
  eligible: number;
  participated: number;
  decisive: number;
  support: number;
  oppose: number;
  abstain: number;
  absent: number;
  supportAll: number;
  /** Includes explicit abstentions in denominator; null when nobody participates. */
  supportCast: number | null;
  /** Support / (support + oppose); null when neither is recorded. */
  supportDecisive: number | null;
  participation: number;
  opinionMean: number | null;
  /** Population standard deviation of modeled opinions among participants; not a polarization score. */
  opinionSpread: number | null;
  confidenceMean: number | null;
  /** Minimum support / eligible across synthetic groups with at least one eligible member. */
  minimumGroupSupport: number | null;
  unanimousEligibleSupport: boolean;
}
export interface GroupMetrics extends VoteMetrics { groupId: string; label: string }
export interface VoteTransition { from: VoteStatus; to: VoteStatus; count: number }
export interface Snapshot {
  stageId: Stage["id"];
  stageIndex: number;
  label: string;
  versionId: string;
  ballotKind: Stage["ballotKind"];
  votes: AgentVote[];
  metrics: VoteMetrics;
  groupMetrics: GroupMetrics[];
  transitions: VoteTransition[];
}
export interface BillResult extends BillDefinition {
  versions: { v1: BillVersion; v2: BillVersion };
  snapshots: Snapshot[];
}
export interface SimulationOptions {
  seed: string | number;
  date: string;
  agentCount?: number;
  bills?: BillDefinition[];
}
export interface SimulationResult {
  meta: {
    schemaVersion: "1.0.0";
    modelVersion: "1.0.0";
    title: string;
    date: string;
    seed: string;
    agentCount: number;
    billCount: number;
    synthetic: true;
    method: string;
    disclaimer: string;
    assumptions: string[];
    metricDefinitions: Record<string, string>;
  };
  dimensions: { id: Dimension; label: string; positiveMeaning: string }[];
  groups: GroupDefinition[];
  stages: Stage[];
  agents: Agent[];
  bills: BillResult[];
}
