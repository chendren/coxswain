import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProposals, loadCxTasks, resolveCxRoot, type CxProposal } from "@cox/cx-ops";
import { apiProposalAction } from "../src/api";
import { renderQueuePage } from "../src/pages/queue";
import type { WorkQueue } from "@cox/cx-ops";

async function withWorkspace(
  fn: (deps: { cxRoot: string; now: () => string }) => Promise<void>,
): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "cx-console-op-"));
  const cxRoot = resolveCxRoot(cwd);
  await mkdir(join(cxRoot, "demo"), { recursive: true });
  const now = "2026-08-12T12:00:00.000Z";
  const open: CxProposal = {
    id: "prop_test_open",
    specName: "demo",
    targetId: "local",
    kind: "investigate",
    summary: "Test open proposal for claim/dismiss",
    nbaAction: "investigate_queue",
    status: "open",
    createdAt: now,
    updatedAt: now,
    path: ["test", "seed"],
  };
  await writeFile(
    join(cxRoot, "demo", "proposals.json"),
    JSON.stringify({ proposals: [open], updatedAt: now }, null, 2),
    "utf8",
  );
  // minimal workspace marker if needed
  await writeFile(
    join(cxRoot, "demo", "spec.json"),
    JSON.stringify({ name: "demo" }),
    "utf8",
  );
  try {
    await fn({ cxRoot, now: () => now });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe("apiProposalAction human gate", () => {
  it("claim applies proposal → task + claimed", async () => {
    await withWorkspace(async (deps) => {
      const r = await apiProposalAction(deps, {
        specName: "demo",
        id: "prop_test_open",
        action: "claim",
        actor: "tester",
      });
      expect(r.ok).toBe(true);
      expect(r.path).toContain("claim");
      expect(r.data?.status).toBe("claimed");
      expect(r.data?.taskId).toBeTruthy();

      const props = await loadProposals(deps, "demo");
      expect(props.find((p) => p.id === "prop_test_open")?.status).toBe("claimed");
      const tasks = await loadCxTasks(deps, "demo");
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks[0]?.sourceProposalId).toBe("prop_test_open");
    });
  });

  it("dismiss closes open proposal without invent", async () => {
    await withWorkspace(async (deps) => {
      const r = await apiProposalAction(deps, {
        specName: "demo",
        id: "prop_test_open",
        action: "dismiss",
        actor: "tester",
      });
      expect(r.ok).toBe(true);
      expect(r.data?.status).toBe("dismissed");
      const props = await loadProposals(deps, "demo");
      expect(props.find((p) => p.id === "prop_test_open")?.status).toBe("dismissed");
    });
  });

  it("missing proposal fails closed", async () => {
    await withWorkspace(async (deps) => {
      const r = await apiProposalAction(deps, {
        specName: "demo",
        id: "prop_missing",
        action: "claim",
      });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not found/i);
    });
  });
});

describe("renderQueuePage operate UI", () => {
  it("renders Claim/Dismiss forms and flash", () => {
    const queue: WorkQueue = {
      proposals: [
        {
          specName: "demo",
          id: "prop_1",
          status: "open",
          kind: "investigate",
          targetId: "local",
          summary: "hello evidence summary",
          ageHours: 1,
          ageDisplay: "1h",
          next: "apply",
          urgencyScore: 50,
          urgency: "med",
          path: ["seed", "route", "emit"],
          pathDisplay: "seed → route → emit",
          nbaAction: "investigate_queue",
        },
      ],
      tasks: [],
      totals: { proposals: 1, tasks: 0, specsWithWork: 1 },
      path: ["build_queue", "emit"],
      pathDisplay: "build_queue → emit",
    };
    const html = renderQueuePage(queue, "local", "claimed prop_1");
    expect(html).toContain('name="action" value="claim"');
    expect(html).toContain('name="action" value="dismiss"');
    expect(html).toContain("claimed prop_1");
    expect(html).toContain('class="path-audit"');
    expect(html).toContain("cox cx claim demo prop_1");
    expect(html).toContain('class="evidence"');
    expect(html).toContain("seed → route → emit");
    expect(html).toContain("NBA action: investigate_queue");
  });
});
