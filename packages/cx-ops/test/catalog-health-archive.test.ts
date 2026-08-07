import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendHealthSample,
  archiveCxSpec,
  createCxSpec,
  inventoryCatalog,
  listCxSpecs,
  loadHealthHistory,
  restoreCxSpec,
  snapshotCxSpec,
} from "../src/index";

describe("catalog health archive snapshot", () => {
  let cxRoot: string;
  const now = () => "2026-08-07T15:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-cat-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("inventoryCatalog has domains and nba", () => {
    const inv = inventoryCatalog("local");
    expect(inv.domains.length).toBeGreaterThan(0);
    expect(inv.nbaRules.length).toBeGreaterThan(0);
    expect(inv.channels.length).toBeGreaterThan(0);
  });

  it("health history append/load", async () => {
    await createCxSpec({ cxRoot, now }, "h1", "h");
    await appendHealthSample(
      { cxRoot, now },
      "h1",
      [
        { targetId: "local", level: "healthy" },
        { targetId: "aws", level: "degraded" },
      ],
    );
    const hist = await loadHealthHistory({ cxRoot, now }, "h1", 10);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.score).toBe(75);
  });

  it("archive and restore hide from listCxSpecs", async () => {
    await createCxSpec({ cxRoot, now }, "arc", "a");
    expect(await listCxSpecs({ cxRoot, now })).toEqual(["arc"]);
    await archiveCxSpec({ cxRoot, now }, "arc");
    expect(await listCxSpecs({ cxRoot, now })).toEqual([]);
    await restoreCxSpec({ cxRoot, now }, "arc");
    expect(await listCxSpecs({ cxRoot, now })).toEqual(["arc"]);
  });

  it("snapshot includes SNAPSHOT.md and spec.json", async () => {
    await createCxSpec({ cxRoot, now }, "snap", "s");
    const outBase = await mkdtemp(join(tmpdir(), "snap-out-"));
    const r = await snapshotCxSpec({ cxRoot, now }, "snap", "full", outBase);
    expect(r.files).toContain("SNAPSHOT.md");
    expect(r.files).toContain("spec.json");
    expect(r.files).toContain("BRIEF.md");
    await rm(outBase, { recursive: true, force: true });
  });
});
