import { describe, expect, it } from "vitest";
import { routeRetrieval, inferSignals, RetrievalMode } from "../src/ontology";

describe("inferSignals", () => {
  it("detects empty query", () => {
    const signals = inferSignals("");
    expect(signals.empty).toBe(true);
  });

  it("detects whitespace-only as empty", () => {
    const signals = inferSignals("   ");
    expect(signals.empty).toBe(true);
  });

  it("detects strong anchor in query", () => {
    const signals = inferSignals("lookup domain:billing");
    expect(signals.hasStrongAnchor).toBe(true);
  });

  it("detects multi-hop language", () => {
    const signals = inferSignals("path between billing and payment");
    expect(signals.multiHopLanguage).toBe(true);
  });

  it("detects invent request", () => {
    const signals = inferSignals("invent a new intent id");
    expect(signals.inventRequest).toBe(true);
  });

  it("respects extra signals override", () => {
    const signals = inferSignals("hello", { hasStrongAnchor: true });
    expect(signals.hasStrongAnchor).toBe(true);
  });

  it("closedWorldAvailable defaults to true when not specified", () => {
    const signals = inferSignals("hello");
    expect(signals.closedWorldAvailable).toBe(true);
  });

  it("closedWorldAvailable can be explicitly disabled", () => {
    const signals = inferSignals("hello", { closedWorldAvailable: false });
    expect(signals.closedWorldAvailable).toBe(false);
  });
});

describe("routeRetrieval", () => {
  describe("empty query", () => {
    it("returns refuse mode for empty string", () => {
      const route = routeRetrieval("");
      expect(route.mode).toBe("refuse");
      expect(route.reason).toBe("empty query");
      expect(route.tools).toEqual([]);
      expect(route.risk).toBe(0);
    });

    it("returns refuse mode for whitespace-only", () => {
      const route = routeRetrieval("   ");
      expect(route.mode).toBe("refuse");
    });
  });

  describe("invent request with closed world", () => {
    it("returns refuse with high risk when inventing ids in closed world", () => {
      const route = routeRetrieval("invent a new intent id");
      expect(route.mode).toBe("refuse");
      expect(route.reason).toContain("closed world forbids inventing catalog ids");
      expect(route.risk).toBe(95);
      expect(route.tools).toEqual(["list_strong_kinds", "lookup_strong_node"]);
    });

    it("allows soft narrative when closed world is disabled and invent requested", () => {
      const route = routeRetrieval("invent a new intent id", { closedWorldAvailable: false });
      expect(route.mode).toBe("soft_narrative");
      expect(route.risk).toBe(70);
    });
  });

  describe("multi-hop language detection", () => {
    it("routes path-between queries to graph_multihop", () => {
      const route = routeRetrieval("path between domain:billing and intent");
      expect(route.mode).toBe("graph_multihop");
      expect(route.reason).toContain("multi-hop / relation language detected");
      expect(route.tools).toEqual(["shortest_path", "k_hop_neighborhood", "lookup_strong_node"]);
      expect(route.risk).toBe(25);
    });

    it("routes related queries to graph_multihop", () => {
      const route = routeRetrieval("what is related to billing?");
      expect(route.mode).toBe("graph_multihop");
    });

    it("routes multi-hop queries to graph_multihop", () => {
      const route = routeRetrieval("show me the multi hop path");
      expect(route.mode).toBe("graph_multihop");
    });

    it("routes connected queries to graph_multihop", () => {
      const route = routeRetrieval("connected domains");
      expect(route.mode).toBe("graph_multihop");
    });

    it("routes who owns queries to graph_multihop", () => {
      const route = routeRetrieval("who owns the billing domain?");
      expect(route.mode).toBe("graph_multihop");
    });
  });

  describe("strong anchor detection (closed_set_lookup)", () => {
    it("routes kpi:total_contacts to closed_set_lookup", () => {
      const route = routeRetrieval("kpi:total_contacts");
      expect(route.mode).toBe("closed_set_lookup");
      expect(route.reason).toContain("strong anchor or closed-set lookup");
      expect(route.tools).toEqual(["lookup_strong_node", "resolve_label"]);
      expect(route.risk).toBe(15);
    });

    it("routes domain:billing to closed_set_lookup", () => {
      const route = routeRetrieval("domain:billing");
      expect(route.mode).toBe("closed_set_lookup");
    });

    it("routes intent:payment_issue to closed_set_lookup", () => {
      const route = routeRetrieval("intent:payment_issue");
      expect(route.mode).toBe("closed_set_lookup");
    });

    it("routes journey:churn_prevention to closed_set_lookup", () => {
      const route = routeRetrieval("journey:churn_prevention");
      expect(route.mode).toBe("closed_set_lookup");
    });

    it("routes nba_rule:CHURN_RISK_HIGH to closed_set_lookup", () => {
      const route = routeRetrieval("nba_rule:CHURN_RISK_HIGH");
      expect(route.mode).toBe("closed_set_lookup");
    });
  });

  describe("default closed-world behavior", () => {
    it("routes plain text queries to closed_set_lookup by default", () => {
      const route = routeRetrieval("billing payment");
      expect(route.mode).toBe("closed_set_lookup");
      expect(route.reason).toContain("default closed-world search before soft narrative");
      expect(route.tools).toEqual(["lookup_strong_node", "graph_stats"]);
      expect(route.risk).toBe(35);
    });

    it("routes domain:billing with multi-hop language to graph_multihop (priority)", () => {
      const route = routeRetrieval("domain:billing path related");
      expect(route.mode).toBe("graph_multihop");
    });
  });

  describe("soft narrative fallback", () => {
    it("routes to soft_narrative when closed world unavailable and no anchors", () => {
      const route = routeRetrieval("tell me about billing", { closedWorldAvailable: false });
      expect(route.mode).toBe("soft_narrative");
      expect(route.reason).toContain("no closed world available; soft only");
      expect(route.tools).toEqual(["generate_soft"]);
      expect(route.risk).toBe(70);
    });
  });

  describe("path and risk fields", () => {
    it("includes correct path array for audit", () => {
      const route = routeRetrieval("hello");
      expect(route.path).toEqual(["classify_query", "score_risk", "select_mode", "emit"]);
    });

    it("risk increases with hallucination potential", () => {
      const refuseRoute = routeRetrieval("invent a new intent id");
      const softRoute = routeRetrieval("tell me about billing", { closedWorldAvailable: false });
      const graphRoute = routeRetrieval("path between domains");
      const lookupRoute = routeRetrieval("kpi:total_contacts");

      expect(refuseRoute.risk).toBe(95);
      expect(softRoute.risk).toBe(70);
      expect(graphRoute.risk).toBe(25);
      expect(lookupRoute.risk).toBe(15);
    });
  });
});
