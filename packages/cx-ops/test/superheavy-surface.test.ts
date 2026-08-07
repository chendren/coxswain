import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendProposalsFromTick,
  applyProposal,
  buildOpsBoard,
  buildWorkQueue,
  createCxSpec,
  loadProposals,
  lookupStrongNode,
  proposalUrgencyScore,
  renderOpsDashboardHtml,
} from "../src/index";

describe("superheavy surfaces", () => {
  let cxRoot: string;
  const now = () => "2026-08-07T18:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-sh-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("proposalUrgencyScore ranks remediate higher", () => {
    expect(proposalUrgencyScore("remediate", 0)).toBeGreaterThan(
      proposalUrgencyScore("investigate", 0),
    );
    expect(proposalUrgencyScore("investigate", 10)).toBeGreaterThan(
      proposalUrgencyScore("investigate", 0),
    );
    expect(proposalUrgencyScore("other", 100)).toBe(55);
  });

  it("lookupStrongNode finds billing journey", () => {
    const r = lookupStrongNode("local", "billing");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.uid.includes("billing") || h.name.toLowerCase().includes("billing"))).toBe(
      true,
    );
  });

  it("buildWorkQueue aggregates open work", async () => {
    await createCxSpec({ cxRoot, now }, "a", "alpha");
    await appendProposalsFromTick({ cxRoot, now }, "a", [
      {
        targetId: "local",
        kind: "investigate",
        summary: "degraded",
        nba: {
          rules: [],
          primary: {
            id: "R1",
            name: "r",
            priority: 1,
            conditions: [],
            logic: "AND",
            action: "noop",
            actionType: "other",
            urgency: "low",
          },
        },
        path: ["t"],
      },
    ]);
    const props = await loadProposals({ cxRoot, now }, "a");
    await applyProposal({ cxRoot, now }, "a", props[0]!);
    const q = await buildWorkQueue({ cxRoot, now }, Date.parse(now()));
    expect(q.totals.tasks).toBeGreaterThanOrEqual(1);
    expect(q.totals.specsWithWork).toBeGreaterThanOrEqual(1);
  });

  it("renderOpsDashboardHtml includes board totals", async () => {
    await createCxSpec({ cxRoot, now }, "dash", "dash idea");
    const board = await buildOpsBoard({ cxRoot, now });
    const html = renderOpsDashboardHtml(board, undefined, now());
    expect(html).toContain("CXOS Ops Dashboard");
    expect(html).toContain("dash");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
