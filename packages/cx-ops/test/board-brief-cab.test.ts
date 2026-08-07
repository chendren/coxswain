import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  applyProposal,
  appendProposalsFromTick,
  buildOpsBoard,
  createCxSpec,
  exportCabPackage,
  formatPathByPhase,
  listJourneys,
  loadAuditEvents,
  loadProposals,
  renderExecBrief,
} from "../src/index";

describe("board + brief + cab + audit + journeys", () => {
  let cxRoot: string;
  const now = () => "2026-08-07T12:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-board-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("buildOpsBoard rollups empty and with specs", async () => {
    const empty = await buildOpsBoard({ cxRoot, now });
    expect(empty.totals.specs).toBe(0);

    await createCxSpec({ cxRoot, now }, "alpha", "alpha idea");
    const board = await buildOpsBoard({ cxRoot, now });
    expect(board.totals.specs).toBe(1);
    expect(board.rows[0]!.name).toBe("alpha");
    expect(board.rows[0]!.idea).toContain("alpha");
  });

  it("renderExecBrief contains program and controls", async () => {
    const rec = await createCxSpec({ cxRoot, now }, "beta", "cut handle time");
    const md = renderExecBrief({
      name: "beta",
      record: rec,
      deployments: {},
      proposals: [],
      tasks: [],
      generatedAt: now(),
    });
    expect(md).toContain("# CXOS Executive Brief: beta");
    expect(md).toContain("cut handle time");
    expect(md).toContain("plan-only");
  });

  it("exportCabPackage writes MANIFEST and BRIEF", async () => {
    await createCxSpec({ cxRoot, now }, "gamma", "gamma idea");
    await appendProposalsFromTick({ cxRoot, now }, "gamma", [
      {
        targetId: "local",
        kind: "investigate",
        summary: "degraded local",
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
    const props = await loadProposals({ cxRoot, now }, "gamma");
    await applyProposal({ cxRoot, now }, "gamma", props[0]!);

    const outBase = await mkdtemp(join(tmpdir(), "cab-out-"));
    const result = await exportCabPackage({ cxRoot, now }, "gamma", "pkg", outBase);
    expect(result.files).toContain("BRIEF.md");
    expect(result.files).toContain("MANIFEST.md");
    expect(result.files).toContain("proposals.json");
    expect(result.files).toContain("tasks.json");
    const brief = await readFile(join(result.outDir, "BRIEF.md"), "utf8");
    expect(brief).toContain("gamma");
    await rm(outBase, { recursive: true, force: true });
  });

  it("audit append + load", async () => {
    await createCxSpec({ cxRoot, now }, "delta", "d");
    await appendAuditEvent(
      { cxRoot, now },
      { kind: "test", specName: "delta", message: "hello", ref: "x" },
    );
    const events = await loadAuditEvents({ cxRoot, now }, "delta", 10);
    expect(events).toHaveLength(1);
    expect(events[0]!.message).toBe("hello");
  });

  it("listJourneys returns closed pack inventory", () => {
    const inv = listJourneys("local");
    expect(inv.journeys.length).toBeGreaterThan(0);
    expect(inv.journeys[0]!.id).toBeTruthy();
    expect(inv.path).toContain("list_journeys");
  });

  it("formatPathByPhase groups segments", () => {
    const s = formatPathByPhase([
      "cx_run",
      "create_spec",
      "build:artifacts",
      "deploy:local",
      "status:local",
      "simulate:local",
      "report:summary",
    ]);
    expect(s).toContain("build:");
    expect(s).toContain("status:");
  });
});
