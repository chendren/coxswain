import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONTOLOGY,
  buildStrongGraph,
  createWeakMemory,
} from "../src/ontology";

describe("weak memory", () => {
  const fixedNow = () => "2026-05-18T12:00:00.000Z";
  const wm = createWeakMemory(fixedNow);

  it("writes weak entries with deterministic ids and timestamps", () => {
    const e1 = wm.writeWeak({
      claimedKind: "kpi",
      rawLabel: "total_contacts",
      source: "agent:session-1",
    });
    expect(e1.id).toBe("wm_1");
    expect(e1.claimedKind).toBe("kpi");
    expect(e1.rawLabel).toBe("total_contacts");
    expect(e1.hubKey).toBe("contactstotal");
    expect(e1.writtenAt).toBe("2026-05-18T12:00:00.000Z");
    expect(e1.source).toBe("agent:session-1");
    expect(e1.strength).toBe("weak");
    expect(e1.props).toEqual({});
  });

  it("allows optional props", () => {
    const e = wm.writeWeak({
      claimedKind: "kpi",
      rawLabel: "sla_compliance_rate",
      source: "artifact:kpiFrame",
      props: { unit: "percent", target: 95 },
    });
    expect(e.props).toEqual({ unit: "percent", target: 95 });
  });

  it("lists all weak entries", () => {
    const list = wm.listWeak();
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe("wm_1");
    expect(list[1]!.id).toBe("wm_2");
  });

  it("searches by rawLabel, hubKey or id", () => {
    const results = wm.searchWeak("contact");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.rawLabel === "total_contacts")).toBe(true);

    // Search by hub key
    const hubResults = wm.searchWeak("contactstotal");
    expect(hubResults.some((r) => r.id === "wm_1")).toBe(true);

    // Search by id prefix
    const idResults = wm.searchWeak("wm_1");
    expect(idResults.some((r) => r.id === "wm_1")).toBe(true);
  });

  it("respects search limit", () => {
    for (let i = 0; i < 25; i++) {
      wm.writeWeak({
        claimedKind: "kpi",
        rawLabel: `metric_${i}`,
        source: "test",
      });
    }
    const limited = wm.searchWeak("metric", 10);
    expect(limited).toHaveLength(10);
  });

  describe("tryAbsorbAll", () => {
    it("resolves real KPI labels and rejects invented ones", () => {
      const g = buildStrongGraph(DEFAULT_ONTOLOGY);
      
      // Reset for clean test
      const wm2 = createWeakMemory(fixedNow);
      
      // Real KPI that exists in DEFAULT_ONTOLOGY
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "total_contacts",
        source: "agent:test",
      });
      
      // Invented KPI that doesn't exist
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "made_up_metric_12345",
        source: "agent:test",
      });

      const provenance = wm2.tryAbsorbAll(g);

      expect(provenance).toHaveLength(2);
      
      // Check resolved entry
      const resolved = provenance.find((p) => p.outcome === "resolved");
      expect(resolved).toBeDefined();
      expect(resolved?.rawLabel).toBe("total_contacts");
      expect(resolved?.strongUid).toBe("kpi:total_contacts");

      // Check rejected entry
      const rejected = provenance.find((p) => p.outcome === "rejected");
      expect(rejected).toBeDefined();
      expect(rejected?.rawLabel).toBe("made_up_metric_12345");
      expect(rejected?.strongUid).toBeUndefined();

      // Verify entries were updated
      const list = wm2.listWeak();
      const resolvedEntry = list.find((e) => e.rawLabel === "total_contacts");
      expect(resolvedEntry?.strength).toBe("resolved");
      expect(resolvedEntry?.strongUid).toBe("kpi:total_contacts");

      const rejectedEntry = list.find((e) => e.rawLabel === "made_up_metric_12345");
      expect(rejectedEntry?.strength).toBe("rejected");
    });

    it("free_text always rejected", () => {
      const g = buildStrongGraph(DEFAULT_ONTOLOGY);
      
      const wm2 = createWeakMemory(fixedNow);
      
      wm2.writeWeak({
        claimedKind: "free_text",
        rawLabel: "some free form text from LLM",
        source: "agent:test",
      });

      const provenance = wm2.tryAbsorbAll(g);

      expect(provenance).toHaveLength(1);
      expect(provenance[0]?.outcome).toBe("rejected");
      expect(provenance[0]?.claimedKind).toBe("free_text");

      const list = wm2.listWeak();
      expect(list[0]?.strength).toBe("rejected");
    });

    it("updates hubKey to strong node's hubKey on resolve", () => {
      const g = buildStrongGraph(DEFAULT_ONTOLOGY);
      
      const wm2 = createWeakMemory(fixedNow);
      
      // Write with different casing
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "Total Contacts",
        source: "agent:test",
      });

      wm2.tryAbsorbAll(g);

      const list = wm2.listWeak();
      expect(list[0]?.strength).toBe("resolved");
      // Should use the strong node's hubKey
      expect(list[0]?.hubKey).toBe("contactstotal");
    });
  });

  describe("snapshot", () => {
    it("returns complete state with stats", () => {
      const g = buildStrongGraph(DEFAULT_ONTOLOGY);
      
      const wm2 = createWeakMemory(fixedNow);
      
      // Write entries
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "total_contacts",
        source: "agent:test",
      });
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "made_up_metric",
        source: "agent:test",
      });

      const snap1 = wm2.snapshot();
      expect(snap1.stats.weak).toBe(2);
      expect(snap1.stats.resolved).toBe(0);
      expect(snap1.stats.rejected).toBe(0);

      // Absorb
      wm2.tryAbsorbAll(g);

      const snap2 = wm2.snapshot();
      expect(snap2.stats.weak).toBe(0);
      expect(snap2.stats.resolved).toBe(1);
      expect(snap2.stats.rejected).toBe(1);

      expect(snap2.entries).toHaveLength(2);
      expect(snap2.provenance).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const wm2 = createWeakMemory(fixedNow);
      
      wm2.writeWeak({
        claimedKind: "kpi",
        rawLabel: "test",
        source: "agent:test",
      });

      expect(wm2.listWeak()).toHaveLength(1);

      wm2.clear();

      expect(wm2.listWeak()).toHaveLength(0);
      const snap = wm2.snapshot();
      expect(snap.entries).toHaveLength(0);
      expect(snap.provenance).toHaveLength(0);
    });
  });
});
