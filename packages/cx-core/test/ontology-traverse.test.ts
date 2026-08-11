import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONTOLOGY,
  buildStrongGraph,
  shortestPath,
  kHopNeighborhood,
  findPaths,
  nodesAtDistance,
  formatGraphPath,
} from "../src/ontology";

describe("traverse — multi-hop strong-graph operators", () => {
  const g = buildStrongGraph(DEFAULT_ONTOLOGY);

  it("shortestPath finds domain → intent within maxHops 2", () => {
    const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 });
    expect(path).toBeDefined();
    expect(path!.nodes).toEqual(["domain:billing", "intent:billing.payment_issue"]);
    expect(path!.edges).toEqual(["HAS_INTENT"]);
    expect(path!.hops).toBe(1);
  });

  it("kHopNeighborhood(domain:billing, 1) includes that intent", () => {
    const dist = kHopNeighborhood(g, "domain:billing", 1);
    expect(dist.has("intent:billing.payment_issue")).toBe(true);
    expect(dist.get("intent:billing.payment_issue")).toBe(1);
  });

  it("formatGraphPath includes HAS_INTENT", () => {
    const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 })!;
    expect(formatGraphPath(path)).toContain("HAS_INTENT");
    expect(formatGraphPath(path)).toBe(
      "domain:billing → HAS_INTENT → intent:billing.payment_issue",
    );
  });

  it("missing uid returns empty/undefined", () => {
    const path = shortestPath(g, "domain:unknown", "intent:billing.payment_issue");
    expect(path).toBeUndefined();

    const dist = kHopNeighborhood(g, "domain:unknown", 1);
    expect(dist.size).toBe(0);

    const paths = findPaths(g, "domain:unknown", "intent:billing.payment_issue");
    expect(paths.length).toBe(0);

    const nodes = nodesAtDistance(g, "domain:unknown", 1);
    expect(nodes.length).toBe(0);
  });

  it("findPaths from domain to intent returns ≥1 path", () => {
    const paths = findPaths(g, "domain:billing", "intent:billing.payment_issue", { maxHops: 2 });
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0]!.nodes).toEqual(["domain:billing", "intent:billing.payment_issue"]);
    expect(paths[0]!.edges).toEqual(["HAS_INTENT"]);
  });

  it("nodesAtDistance returns StrongNode[] at exact distance", () => {
    const nodes = nodesAtDistance(g, "domain:billing", 1);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.kind === "intent")).toBe(true);
    expect(nodes.some((n) => n.id === "billing.payment_issue")).toBe(true);
  });

  it("undirected traversal finds paths both ways", () => {
    const path = shortestPath(g, "intent:billing.payment_issue", "domain:billing", {
      maxHops: 2,
      directed: false,
    });
    expect(path).toBeDefined();
    expect(path!.nodes).toEqual(["intent:billing.payment_issue", "domain:billing"]);
  });

  it("edgeKinds filter restricts traversal to specific edge types", () => {
    const path = shortestPath(g, "domain:billing", "intent:billing.payment_issue", {
      maxHops: 2,
      edgeKinds: ["HAS_INTENT"],
    });
    expect(path).toBeDefined();

    // Filtering out HAS_INTENT should prevent reaching the intent
    const blocked = shortestPath(g, "domain:billing", "intent:billing.payment_issue", {
      maxHops: 2,
      edgeKinds: ["TRIGGERS"],
    });
    expect(blocked).toBeUndefined();
  });

  it("findPaths respects limit option", () => {
    // Use a more connected node to generate multiple paths
    const paths = findPaths(g, "domain:billing", "intent:billing.payment_issue", {
      maxHops: 3,
      limit: 2,
    });
    expect(paths.length).toBeLessThanOrEqual(2);
  });

  it("single-node path returns just the uid", () => {
    const path = shortestPath(g, "domain:billing", "domain:billing");
    expect(path).toBeDefined();
    expect(formatGraphPath(path!)).toBe("domain:billing");
  });
});
