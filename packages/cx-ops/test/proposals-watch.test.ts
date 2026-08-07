import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockTargetAdapter, type CxDeployment, type CxHealth } from "@cox/cx-core";
import {
  appendProposalsFromTick,
  extractJsonText,
  isLegalProposalTransition,
  listOpenProposals,
  loadProposals,
  parseJsonLoose,
  runWatchLoop,
  suggestedProposalNext,
  transitionProposal,
} from "../src/index";

const dep = (id: "local" | "artifacts"): CxDeployment => ({
  targetId: id,
  specName: "demo",
  deployedAt: "2026-08-03T00:00:00Z",
  resources: [],
});

describe("extractJsonText", () => {
  it("strips fences and extracts object", () => {
    const raw = "Here you go:\n```json\n{\"a\":1}\n```\n";
    expect(extractJsonText(raw)).toBe('{"a":1}');
    expect(parseJsonLoose<{ a: number }>(raw).a).toBe(1);
  });
});

describe("proposals + watch", () => {
  let cxRoot: string;
  const now = () => "2026-08-04T00:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-prop-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("persists, dedupes, transitions proposals", async () => {
    const degraded: CxHealth = {
      targetId: "local",
      level: "degraded",
      metrics: [],
      checkedAt: now(),
    };
    const tickProposals = [
      {
        targetId: "local" as const,
        kind: "investigate" as const,
        summary: "local degraded",
        nba: {
          rules: [],
          primary: {
            id: "CHURN_RISK_HIGH",
            name: "x",
            priority: 100,
            conditions: [],
            logic: "AND" as const,
            action: "retention_offer",
            actionType: "retention",
            urgency: "critical" as const,
          },
        },
        path: ["test"],
      },
    ];

    const first = await appendProposalsFromTick({ cxRoot, now }, "demo", tickProposals);
    expect(first.added).toHaveLength(1);
    const second = await appendProposalsFromTick({ cxRoot, now }, "demo", tickProposals);
    expect(second.added).toHaveLength(0);
    expect(second.skipped).toBe(1);

    const open = await listOpenProposals({ cxRoot, now }, "demo");
    expect(open).toHaveLength(1);
    const id = open[0]!.id;
    // open → resolved is legal (operator shortcut)
    const resolved = await transitionProposal({ cxRoot, now }, "demo", id, "resolved");
    expect(resolved?.status).toBe("resolved");
    expect(await listOpenProposals({ cxRoot, now }, "demo")).toHaveLength(0);
    expect((await loadProposals({ cxRoot, now }, "demo"))[0]?.status).toBe("resolved");
    // resolved is terminal
    await expect(
      transitionProposal({ cxRoot, now }, "demo", id, "open"),
    ).rejects.toThrow(/illegal proposal transition/);
  });

  it("proposal transition graph and next hints", () => {
    expect(isLegalProposalTransition("open", "claimed")).toBe(true);
    expect(isLegalProposalTransition("claimed", "resolved")).toBe(true);
    expect(isLegalProposalTransition("resolved", "claimed")).toBe(false);
    expect(isLegalProposalTransition("dismissed", "open")).toBe(true);
    expect(suggestedProposalNext("open")).toBe("apply");
    expect(suggestedProposalNext("claimed")).toBe("resolve");
    expect(suggestedProposalNext("resolved")).toBe("none");
  });

  it("watch loop runs ticks and can add proposals on degraded", async () => {
    const degraded: CxHealth = {
      targetId: "local",
      level: "degraded",
      metrics: [],
      checkedAt: now(),
    };
    const adapter = createMockTargetAdapter("local", {
      status: degraded,
      capabilities: ["status"],
    });

    const result = await runWatchLoop(
      "demo",
      [
        {
          targetId: "local",
          adapter,
          dep: dep("local"),
          nbaContext: {
            journey: "churn_prevention",
            stage: "cancel_requested",
            confidence: 0.9,
          },
        },
      ],
      {
        cxRoot,
        now,
        maxTicks: 2,
        intervalMs: 10,
      },
    );
    expect(result.ticks).toBe(2);
    // first tick adds, second dedupes
    expect(result.totalAdded).toBe(1);
    expect(result.path).toContain("watch_start");
    expect(result.path).toContain("watch_stop");
  });
});
