import { describe, expect, it } from "vitest";
import { lookupStrongNode } from "../src/graph-query";

describe("lookupStrongNode", () => {
  it("finds nodes by id substring (case-insensitive)", () => {
    const r = lookupStrongNode("default", "BILLING");
    expect(r.pack).toBe("default");
    expect(r.query).toBe("BILLING");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.length).toBeLessThanOrEqual(20);
    expect(
      r.hits.every(
        (h) =>
          h.id.toLowerCase().includes("billing") ||
          h.name.toLowerCase().includes("billing"),
      ),
    ).toBe(true);
    for (const h of r.hits) {
      expect(h).toMatchObject({
        id: expect.any(String),
        kind: expect.any(String),
        name: expect.any(String),
      });
      expect(h.id.length).toBeGreaterThan(0);
      expect(h.kind.length).toBeGreaterThan(0);
    }
  });

  it("finds nodes by name substring", () => {
    const r = lookupStrongNode("local", "dispute");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(
      r.hits.some(
        (h) =>
          h.name.toLowerCase().includes("dispute") ||
          h.id.toLowerCase().includes("dispute"),
      ),
    ).toBe(true);
  });

  it("returns empty hits for empty or whitespace query", () => {
    expect(lookupStrongNode("default", "").hits).toEqual([]);
    expect(lookupStrongNode("default", "   ").hits).toEqual([]);
  });

  it("returns empty hits when nothing matches", () => {
    const r = lookupStrongNode("default", "zzznomatchxyz");
    expect(r.hits).toEqual([]);
    expect(r.path).toEqual(["load_strong", "materialize_graph", "search", "emit"]);
  });

  it("caps results at top 20 by default", () => {
    // Broad fragment that should match many nodes across the catalog
    const r = lookupStrongNode("default", "a");
    expect(r.hits.length).toBeLessThanOrEqual(20);
    expect(r.hits.length).toBe(20);
  });

  it("respects explicit limit", () => {
    const r = lookupStrongNode("default", "a", 5);
    expect(r.hits.length).toBe(5);
  });

  it("local pack surfaces treasury nodes", () => {
    const r = lookupStrongNode("local", "treasury");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(
      r.hits.some(
        (h) =>
          h.id.toLowerCase().includes("treasury") ||
          h.name.toLowerCase().includes("treasury"),
      ),
    ).toBe(true);
  });
});
