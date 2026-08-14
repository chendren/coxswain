import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCxRoot } from "@cox/cx-ops";
import { harvestPhrases } from "../src/phrases";
import { tellWorld } from "../src/tell";
import { loadWorld } from "../src/persist";

async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), "cx-world-"));
  const deps = { cxRoot: resolveCxRoot(cwd), now: () => "2026-08-14T12:00:00.000Z" };
  return { cwd, deps };
}

describe("harvestPhrases", () => {
  it("keeps domain words, drops stopwords", () => {
    const p = harvestPhrases("Customer experience for a national retail brand: returns and loyalty");
    expect(p).toContain("retail");
    expect(p).toContain("returns");
    expect(p).toContain("loyalty");
    expect(p.some((x) => x === "the" || x === "for")).toBe(false);
  });
});

describe("tellWorld offline", () => {
  it("retail idea maps pack + closed journeys, writes wordmap", async () => {
    const { cwd, deps } = await workspace();
    try {
      const r = await tellWorld(
        deps,
        "northwind",
        "Customer experience for a national retail brand: returns and refunds, loyalty, store pickup, order support, retention",
      );
      expect(r.wordmap.packId).toBe("retail");
      expect(r.created).toBe(true);
      expect(r.wordmap.entries.length).toBeGreaterThan(0);
      expect(r.wordmap.entries.some((e) => e.uid === "journey:returns_refunds")).toBe(true);
      expect(r.wordmap.entries.some((e) => e.display === "returns" || e.name.toLowerCase().includes("return"))).toBe(
        true,
      );
      expect(r.wordmap.candidates.some((c) => c.display === "returns")).toBe(false);
      expect(r.path).toContain("resolve_identity");
      const tell = await readFile(join(r.dir, "TELL.md"), "utf8");
      expect(tell).toContain("returns");
      const loaded = await loadWorld(deps, "northwind");
      expect(loaded?.wordmap.brand.length).toBeGreaterThan(3);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not invent ids for unknown hyphenated labels", async () => {
    const { cwd, deps } = await workspace();
    try {
      const r = await tellWorld(deps, "odd", "We care about foo-bar-xyz and nothing else really");
      expect(r.wordmap.entries.every((e) => !e.uid.includes("foo-bar-xyz"))).toBe(true);
      expect(r.wordmap.candidates.some((c) => c.display.includes("foo-bar-xyz"))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("healthcare wording selects healthcare pack", async () => {
    const { cwd, deps } = await workspace();
    try {
      const r = await tellWorld(
        deps,
        "clinic",
        "Regional hospital: appointment no-shows, prior auth delays, claims, patient benefits. No PHI.",
      );
      expect(r.wordmap.packId).toBe("healthcare");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
