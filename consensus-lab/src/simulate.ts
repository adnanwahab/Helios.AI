import { aggregateGroups, aggregateVotes, clamp, createAgents, defaultBills, dimensionLabels, dot, groups, hashText, rounded, seededRandom, stages, validateBills, metadata } from "./model.ts";
import { DIMENSIONS, type Agent, type AgentVote, type BillDefinition, type BillResult, type BillVersion, type Contribution, type Effects, type SimulationOptions, type SimulationResult, type Snapshot, type VoteStatus } from "./types.ts";

export { defaultBills, aggregateVotes, validateBills } from "./model.ts";
export type { SimulationOptions, SimulationResult, BillDefinition } from "./types.ts";

/** Transparent authored coefficients; these have not been fitted to human behavior. */
export const MODEL = {
  utilityScale: 1.65,
  evidenceUptake: .70,
  maximumPeerInfluence: .18,
  amendmentMinimumUptake: .75,
  finalAmendmentMemory: .55,
  finalReassessmentWeight: .45,
  participationOffsets: [0, .025, .025, .005, .035],
} as const;

interface LatentState { opinion: number; confidence: number; participationRoll: number; initialJitter: number }

function effectsAt(bill: BillDefinition, version: "v1" | "v2", stageIndex: number, agent: Agent): Effects {
  const base = version === "v1" ? bill.initial.effects : bill.amendment.effects;
  return Object.fromEntries(DIMENSIONS.map(d => [d, clamp(base[d] + (stageIndex ? MODEL.evidenceUptake * agent.evidenceTrust * bill.evidence.adjustments[d] : 0))])) as Effects;
}

function participates(agent: Agent, roll: number, stageIndex: number): boolean {
  return roll < clamp(agent.participationPropensity + MODEL.participationOffsets[stageIndex], 0, .995);
}

function statusFor(agent: Agent, state: LatentState, stageIndex: number): VoteStatus {
  if (!participates(agent, state.participationRoll, stageIndex)) return "absent";
  if (state.confidence < agent.minimumConfidence || Math.abs(state.opinion) < agent.decisionThreshold) return "abstain";
  return state.opinion > 0 ? "support" : "oppose";
}

function describe(agent: Agent, state: LatentState, status: VoteStatus, contributions: Contribution[]) {
  const ranked = [...contributions].sort((a, b) => b.value - a.value);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const gain = strongest.value > 0 ? dimensionLabels[strongest.dimension].toLowerCase() : null;
  const concern = weakest.value < 0 ? dimensionLabels[weakest.dimension].toLowerCase() : null;
  const policySummary = gain && concern
    ? "Largest favorable policy effect: " + gain + "; largest unfavorable policy effect: " + concern + "."
    : gain
      ? "Largest favorable policy effect: " + gain + ". No policy dimension has a negative contribution in this scenario."
      : concern
        ? "Largest unfavorable policy effect: " + concern + ". No policy dimension has a positive contribution in this scenario."
        : "No policy dimension contributes a modeled gain or loss at this stage.";
  const fullAssessment = "This assessment also includes individual lean, seeded variation and any prior stages.";
  if (status === "absent") return {
    reason: "No response was cast in this check. Opinion and confidence fields are latent model diagnostics, not an observed position.",
    changeRequest: "Invite a response before interpreting this agent's position.",
  };
  if (status === "support") return {
    reason: "The full modeled assessment crosses this agent's support threshold. " + policySummary + " " + fullAssessment,
    changeRequest: concern
      ? "Review the assumptions about " + concern + " and ask for a fresh vote on any amended text."
      : "Inspect the policy assumptions and the full modeled assessment before the next exact-version vote.",
  };
  if (status === "oppose") return {
    reason: "The full modeled assessment crosses this agent's opposition threshold. " + policySummary + " " + fullAssessment,
    changeRequest: concern
      ? "Revisit the assumptions about " + concern + " and ask for a fresh vote on any amended text."
      : "Inspect the individual lean, uncertainty and prior-stage effects behind this assessment.",
  };
  if (state.confidence < agent.minimumConfidence) return {
    reason: "Modeled confidence is below this agent's threshold; abstention is an explicit response. " + policySummary,
    changeRequest: concern
      ? "Provide better evidence about " + concern + ", with sources and uncertainty."
      : "Provide better evidence about the policy assumptions, with sources and uncertainty.",
  };
  return {
    reason: "The full modeled assessment is inside this agent's abstention band. " + policySummary + " " + fullAssessment,
    changeRequest: gain && concern
      ? "Clarify the tradeoff between " + gain + " and " + concern + "."
      : "Clarify the policy assumptions and the full modeled assessment before a fresh vote.",
  };
}

function versionFor(bill: BillDefinition, label: "v1" | "v2"): BillVersion {
  const input = label === "v1" ? bill.initial : bill.amendment;
  const hash = hashText(input.text);
  return { id: bill.id + ":" + label + ":" + hash.slice(0, 16), label, hash, text: input.text, effects: { ...input.effects } };
}

/** Sample at most four available peers within the preset group and four outside it. */
function peerMean(agent: Agent, previous: AgentVote[], seed: string): number | null {
  const available = previous.filter(v => v.agentId !== agent.id && v.status !== "absent");
  if (!available.length) return null;
  const random = seededRandom(seed + ":peer-sample:" + agent.id);
  const selected: AgentVote[] = [];
  for (const sameGroup of [true, false]) {
    const pool = available.filter(v => (v.groupId === agent.groupId) === sameGroup);
    for (let i = 0; i < 4 && pool.length; i++) selected.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return selected.length ? selected.reduce((sum, vote) => sum + vote.opinion, 0) / selected.length : null;
}

function simulateBill(bill: BillDefinition, agents: Agent[], seed: string): BillResult {
  const versions = { v1: versionFor(bill, "v1"), v2: versionFor(bill, "v2") };
  const initialStates: LatentState[] = agents.map(agent => {
    const random = seededRandom(seed + ":bill:" + bill.id + ":agent:" + agent.id);
    const participationRoll = random();
    const initialJitter = (random() - .5) * .16;
    return {
      opinion: clamp(MODEL.utilityScale * dot(agent.weights, bill.initial.effects) + agent.baselineLean + initialJitter),
      confidence: clamp(.38 + .28 * agent.evidenceTrust + (random() - .5) * .16, 0, 1),
      participationRoll, initialJitter,
    };
  });
  let states = initialStates.map(state => ({ ...state }));
  const snapshots: Snapshot[] = [];
  for (const stage of stages) {
    const previous = snapshots.at(-1);
    if (stage.index > 0) states = agents.map((agent, index) => {
      const before = states[index];
      let opinion = before.opinion;
      let confidence = before.confidence;
      if (stage.id === "evidence") {
        // A poor briefing can still change minds; confidence reflects the declared scenario quality.
        opinion = initialStates[index].opinion + MODEL.utilityScale * MODEL.evidenceUptake * agent.evidenceTrust * dot(agent.weights, bill.evidence.adjustments);
        confidence += .20 * bill.evidence.quality * agent.evidenceTrust - .08 * (1 - bill.evidence.quality);
      } else if (stage.id === "discussion" && participates(agent, before.participationRoll, stage.index)) {
        const mean = peerMean(agent, previous!.votes, seed + ":bill:" + bill.id);
        if (mean !== null) {
          opinion += MODEL.maximumPeerInfluence * agent.openness * (mean - opinion);
          // Peer agreement is never treated as evidence of factual correctness.
          confidence -= .035 * Math.abs(mean - before.opinion);
        }
      } else if (stage.id === "amended-text") {
        const difference = Object.fromEntries(DIMENSIONS.map(d => [d, bill.amendment.effects[d] - bill.initial.effects[d]])) as Effects;
        opinion += MODEL.utilityScale * dot(agent.weights, difference) * (MODEL.amendmentMinimumUptake + .25 * agent.openness);
        confidence -= .12 + .025 * Math.abs(opinion - before.opinion);
      } else if (stage.id === "re-vote") {
        const freshUtility = MODEL.utilityScale * dot(agent.weights, bill.amendment.effects) + agent.baselineLean + before.initialJitter + MODEL.utilityScale * MODEL.evidenceUptake * agent.evidenceTrust * dot(agent.weights, bill.evidence.adjustments);
        opinion = MODEL.finalAmendmentMemory * before.opinion + MODEL.finalReassessmentWeight * freshUtility;
        confidence += .06 + .12 * bill.evidence.quality * agent.evidenceTrust;
      }
      return { ...before, opinion: clamp(opinion), confidence: clamp(confidence, 0, 1) };
    });
    const version = versions[stage.version];
    const votes: AgentVote[] = agents.map((agent, index) => {
      const state = states[index];
      const status = statusFor(agent, state, stage.index);
      const effective = effectsAt(bill, stage.version, stage.index, agent);
      const contributions = DIMENSIONS.map(dimension => ({ dimension, value: rounded(MODEL.utilityScale * agent.weights[dimension] * effective[dimension]) }));
      const previousStatus = previous?.votes[index].status ?? null;
      return {
        agentId: agent.id, groupId: agent.groupId, versionId: version.id, status,
        opinion: rounded(state.opinion), confidence: rounded(state.confidence),
        ...describe(agent, state, status, contributions), contributions,
        previousStatus, changed: previousStatus !== null && previousStatus !== status,
        participationRoll: rounded(state.participationRoll),
      };
    });
    const transitions: Snapshot["transitions"] = [];
    if (previous) {
      const counts = new Map<string, number>();
      for (let index = 0; index < votes.length; index++) {
        const key = previous.votes[index].status + ":" + votes[index].status;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of counts) {
        const [from, to] = key.split(":") as [VoteStatus, VoteStatus];
        transitions.push({ from, to, count });
      }
    }
    snapshots.push({
      stageId: stage.id, stageIndex: stage.index, label: stage.label, versionId: version.id, ballotKind: stage.ballotKind,
      votes, metrics: aggregateVotes(votes), groupMetrics: aggregateGroups(votes), transitions,
    });
  }
  return { ...bill, versions, snapshots };
}

export function simulate(options: SimulationOptions): SimulationResult {
  if (!options || typeof options !== "object") throw new Error("Simulation options are required.");
  const { date } = options;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("date must be a valid YYYY-MM-DD calendar date.");
  if ((typeof options.seed !== "string" && typeof options.seed !== "number") || String(options.seed).length === 0 || (typeof options.seed === "number" && !Number.isFinite(options.seed))) throw new Error("seed must be a non-empty string or finite number.");
  const agentCount = options.agentCount ?? 100;
  if (!Number.isInteger(agentCount) || agentCount < 1 || agentCount > 2000) throw new Error("agentCount must be an integer from 1 to 2000.");
  const seed = String(options.seed);
  const bills = validateBills(options.bills ?? defaultBills);
  const keyedSeed = seed + ":date:" + date;
  const agents = createAgents(keyedSeed, agentCount);
  return {
    meta: {
      schemaVersion: "1.0.0", modelVersion: "1.0.0", title: "Helios Consensus Lab",
      date, seed, agentCount, billCount: bills.length, synthetic: true,
      method: metadata.method, disclaimer: metadata.disclaimer,
      assumptions: [...metadata.assumptions],
      metricDefinitions: { ...metadata.metricDefinitions },
    },
    dimensions: DIMENSIONS.map(id => ({ id, label: dimensionLabels[id], positiveMeaning: dimensionLabels[id] })),
    groups: groups.map(group => ({ ...group, weights: { ...group.weights } })),
    stages: stages.map(stage => ({ ...stage })), agents,
    bills: bills.map(bill => simulateBill(bill, agents, keyedSeed)),
  };
}
