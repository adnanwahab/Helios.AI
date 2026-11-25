import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { simulate, defaultBills, aggregateVotes, validateBills } from "../src/simulate.ts";
import { renderReport } from "../src/report.ts";
import { summaryCSV, votesNDJSON } from "../src/export.ts";
import { chicagoDay, main } from "../src/cli.ts";

const options = { seed: "42", date: "2026-11-25", agentCount: 100 };
describe("synthetic voting model", () => {
  test("same full input is reproducible and seed/date changes matter", () => {
    const first = JSON.stringify(simulate(options));
    expect(JSON.stringify(simulate(options))).toBe(first);
    expect(JSON.stringify(simulate({...options, seed:"other"}))).not.toBe(first);
    expect(JSON.stringify(simulate({...options, date:"2026-11-26"}))).not.toBe(first);
  });
  test("every stage accounts for 100 agents and preserves honest denominators", () => {
    const data = simulate(options);
    expect(data.bills).toHaveLength(6);
    expect(data.stages).toHaveLength(5);
    for (const bill of data.bills) for (const snap of bill.snapshots) {
      const m = snap.metrics;
      expect(snap.votes).toHaveLength(100);
      expect(new Set(snap.votes.map(v => v.agentId)).size).toBe(100);
      expect(m.support + m.oppose + m.abstain + m.absent).toBe(100);
      expect(m.participated).toBe(m.support + m.oppose + m.abstain);
      expect(m.decisive).toBe(m.support + m.oppose);
      expect(m.supportAll).toBe(m.support / 100);
      expect(m.supportCast).toBe(m.participated ? m.support / m.participated : null);
      expect(m.supportDecisive).toBe(m.decisive ? m.support / m.decisive : null);
      expect(m.minimumGroupSupport).toBe(Math.min(...snap.groupMetrics.filter(g=>g.eligible>0).map(g=>g.support/g.eligible)));
      for (const v of snap.votes) {
        expect(v.opinion).toBeGreaterThanOrEqual(-1);
        expect(v.opinion).toBeLessThanOrEqual(1);
        expect(v.confidence).toBeGreaterThanOrEqual(0);
        expect(v.confidence).toBeLessThanOrEqual(1);
        expect(v.versionId).toBe(snap.versionId);
      }
      if (snap.stageIndex) expect(snap.transitions.reduce((n,t)=>n+t.count,0)).toBe(100);
    }
    const thirdPlaces = data.bills.find(b=>b.id==="HBL-002")!.snapshots.at(-1)!.metrics;
    expect([thirdPlaces.support,thirdPlaces.oppose,thirdPlaces.abstain,thirdPlaces.absent]).toEqual([75,0,19,6]);
  });
  test("final ballots reference exact v2 text; earlier checks stay attached to v1", () => {
    for (const bill of simulate(options).bills) {
      const {v1,v2} = bill.versions;
      expect(v1.hash).toBe(createHash("sha256").update(bill.initial.text).digest("hex"));
      expect(v2.hash).toBe(createHash("sha256").update(bill.amendment.text).digest("hex"));
      expect(v1.hash).not.toBe(v2.hash);
      expect(bill.snapshots.slice(0,3).every(s=>s.versionId===v1.id && s.ballotKind==="preference-check")).toBe(true);
      expect(bill.snapshots[3].versionId).toBe(v2.id);
      expect(bill.snapshots[4].ballotKind).toBe("final-simulation-ballot");
      expect(bill.snapshots[4].votes.every(v=>v.versionId===v2.id)).toBe(true);
    }
  });
  test("missing and abstaining agents do not imply support", () => {
    const vote = simulate({...options,agentCount:4}).bills[0].snapshots[0].votes[0];
    const absent = {...vote,status:"absent" as const}, abstain = {...vote,status:"abstain" as const};
    expect(aggregateVotes([absent]).supportCast).toBeNull();
    expect(aggregateVotes([absent]).supportDecisive).toBeNull();
    expect(aggregateVotes([abstain]).supportCast).toBe(0);
    expect(aggregateVotes([abstain]).supportDecisive).toBeNull();
    expect(aggregateVotes([abstain]).participation).toBe(1);
    expect(aggregateVotes([absent]).participation).toBe(0);
    expect(aggregateVotes([]).unanimousEligibleSupport).toBe(false);
    expect(aggregateVotes([{...vote,status:"support"},absent]).unanimousEligibleSupport).toBe(false);
  });
  test("adding bills preserves existing traces", () => {
    const subset = simulate({...options,bills:[defaultBills[0]]}), full = simulate(options);
    expect(subset.agents).toEqual(full.agents);
    expect(subset.bills[0]).toEqual(full.bills[0]);
  });
  test("amendments can lose support and do not force consensus", () => {
    const data=simulate(options);
    expect(data.bills.some(b=>b.snapshots.slice(1).some((s,i)=>s.metrics.support<b.snapshots[i].metrics.support))).toBe(true);
    expect(data.bills.every(b=>!b.snapshots.at(-1)!.metrics.unanimousEligibleSupport)).toBe(true);
    expect(data.bills.some(b=>b.snapshots.at(-1)!.metrics.oppose>0)).toBe(true);
  });
  test("reasons distinguish full assessment and policy contributions", () => {
    const votes=simulate(options).bills.flatMap(b=>b.snapshots.flatMap(s=>s.votes));
    const contrary=votes.filter(v=>{const sum=v.contributions.reduce((n,c)=>n+c.value,0);return (v.status==="support"&&sum<0)||(v.status==="oppose"&&sum>0)});
    expect(contrary.length).toBeGreaterThan(0);
    for(const v of contrary){expect(v.reason).toContain("full modeled assessment");expect(v.reason).toContain("individual lean");expect(v.reason).not.toContain("outweigh")}
    const bill=structuredClone(defaultBills[0]);
    for(const effects of [bill.initial.effects,bill.amendment.effects,bill.evidence.adjustments])for(const k of Object.keys(effects) as (keyof typeof effects)[])effects[k]=0;
    const zero=simulate({...options,bills:[bill]}).bills[0].snapshots.flatMap(s=>s.votes).filter(v=>v.status!=="absent");
    expect(zero.length).toBeGreaterThan(0);
    for(const v of zero){expect(v.reason).toContain("No policy dimension contributes a modeled gain or loss");expect(v.reason).not.toContain("Largest favorable");expect(v.reason).not.toContain("Largest unfavorable")}
  });
  test("invalid inputs fail", () => {
    expect(()=>validateBills([])).toThrow("non-empty JSON array");
    expect(()=>validateBills([defaultBills[0],defaultBills[0]])).toThrow("Duplicate bill id");
    const bad=structuredClone(defaultBills);bad[0].initial.effects.privacy=NaN;
    expect(()=>validateBills(bad)).toThrow("finite number");
    expect(()=>simulate({...options,agentCount:0})).toThrow("agentCount");
    expect(()=>simulate({...options,date:"2026-02-31"})).toThrow("calendar date");
    expect(()=>simulate({...options,seed:Infinity})).toThrow("seed");
  });
});
describe("portable report and exports", () => {
  test("CLI emits data, report, 3000 rows and verified checksums", async () => {
    const dir=await mkdtemp(join(tmpdir(),"helios-consensus-"));
    try {
      await main(["--date",options.date,"--seed",options.seed,"--agents","100","--out",dir,"--quiet"]);
      const data=JSON.parse(await readFile(join(dir,"results.json"),"utf8"));
      const html=await readFile(join(dir,"index.html"),"utf8");
      const embedded=html.match(/<script type="application\/json" id="simulation-data">([\s\S]*?)<\/script>/)![1];
      expect(JSON.parse(embedded)).toEqual(data);
      const rows=(await readFile(join(dir,"votes.ndjson"),"utf8")).trim().split("\n").map(JSON.parse);
      expect(rows).toHaveLength(3000);
      for(const row of rows){
        const bill=data.bills.find((b:any)=>b.id===row.billId);
        const version=Object.values(bill.versions).find((v:any)=>v.id===row.versionId) as any;
        expect(row.versionHash).toBe(version.hash);expect(row.synthetic).toBe(true);
      }
      expect((await readFile(join(dir,"summary.csv"),"utf8")).trim().split("\r\n")).toHaveLength(31);
      const manifest=JSON.parse(await readFile(join(dir,"manifest.json"),"utf8"));
      for(const entry of manifest.files){const bytes=await readFile(join(dir,entry.name));expect(bytes.length).toBe(entry.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256)}
    }finally{await rm(dir,{recursive:true,force:true})}
  });
  test("supplied proposal text stays inert in HTML and CSV", () => {
    const bills=structuredClone(defaultBills.slice(0,1));
    bills[0].title='=HYPERLINK("https://example.invalid")';
    bills[0].initial.text='</script><script>window.injected=true</script> & <img src=x onerror=alert(1)>';
    const data=simulate({...options,agentCount:4,bills}),html=renderReport(data);
    expect(html.includes(bills[0].initial.text)).toBe(false);
    expect(html.includes('\\u003c/script>')).toBe(true);
    expect(JSON.parse(html.match(/<script type="application\/json" id="simulation-data">([\s\S]*?)<\/script>/)![1]).bills[0].initial.text).toBe(bills[0].initial.text);
    expect(summaryCSV(data)).toContain('"\'=HYPERLINK(');
    expect(votesNDJSON(data).trim().split("\n")).toHaveLength(20);
  });
  test("daily default is the Chicago calendar day", () => {
    expect(chicagoDay(new Date("2026-11-25T02:30:00Z"))).toBe("2026-11-24");
    expect(chicagoDay(new Date("2026-11-25T15:00:00Z"))).toBe("2026-11-25");
  });
});
