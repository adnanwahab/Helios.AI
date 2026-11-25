import type { SimulationResult } from "./types.ts";

/** Quote every field, and neutralize spreadsheet formula injection in supplied strings. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function summaryCSV(result: SimulationResult): string {
  const columns = ["synthetic", "date", "seed", "bill_id", "bill_title", "stage", "version_id",
    "eligible", "participated", "decisive", "support", "oppose", "abstain", "absent",
    "participation_rate", "support_all_eligible", "support_submitted_including_abstain",
    "support_decisive_only", "lowest_group_support_all_eligible", "mean_modeled_confidence"];
  const rows: unknown[][] = [columns];
  for (const bill of result.bills) for (const snap of bill.snapshots) {
    const m = snap.metrics;
    rows.push([true, result.meta.date, result.meta.seed, bill.id, bill.title, snap.stageId, snap.versionId,
      m.eligible, m.participated, m.decisive, m.support, m.oppose, m.abstain, m.absent,
      m.participation, m.supportAll, m.supportCast, m.supportDecisive, m.minimumGroupSupport, m.confidenceMean]);
  }
  return rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function votesNDJSON(result: SimulationResult): string {
  const rows: string[] = [];
  for (const bill of result.bills) for (const snapshot of bill.snapshots) for (const vote of snapshot.votes) {
    const version = Object.values(bill.versions).find(version => version.id === snapshot.versionId)!;
    rows.push(JSON.stringify({ synthetic: true, schemaVersion: result.meta.schemaVersion,
      date: result.meta.date, seed: result.meta.seed, billId: bill.id, stageId: snapshot.stageId,
      stageIndex: snapshot.stageIndex, ballotKind: snapshot.ballotKind, versionHash:version.hash, ...vote }));
  }
  return rows.join("\n") + "\n";
}
