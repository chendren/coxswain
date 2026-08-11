import { describe, expect, it } from "vitest";
import type { OpsBoard } from "../src/board";
import { renderOpsDashboardHtml } from "../src/dashboard-html";
import type { WorkQueue } from "../src/fleet-queue";

function emptyBoard(over: Partial<OpsBoard> = {}): OpsBoard {
  return {
    rows: [],
    totals: {
      specs: 0,
      proposalsOpen: 0,
      tasksOpen: 0,
      daemonsRunning: 0,
      deployedSpecs: 0,
    },
    path: ["list_specs", "load_each", "rollup", "emit"],
    ...over,
  };
}

const sampleBoard: OpsBoard = {
  rows: [
    {
      name: "alpha",
      idea: "alpha idea <script>",
      phases: {
        requirements: "complete",
        design: "in_progress",
        tasks: "not_started",
      },
      deployments: ["local", "aws-dev"],
      proposalsOpen: 2,
      proposalsClaimed: 1,
      tasksOpen: 3,
      tasksDone: 0,
      daemonRunning: true,
      daemonLastTickAt: "2026-08-07T17:00:00Z",
      updatedAt: "2026-08-07T16:00:00Z",
    },
    {
      name: "beta",
      idea: "beta only",
      phases: {
        requirements: "complete",
        design: "complete",
        tasks: "complete",
      },
      deployments: [],
      proposalsOpen: 0,
      proposalsClaimed: 0,
      tasksOpen: 0,
      tasksDone: 5,
      daemonRunning: false,
      updatedAt: "2026-08-07T15:00:00Z",
    },
  ],
  totals: {
    specs: 2,
    proposalsOpen: 3,
    tasksOpen: 3,
    daemonsRunning: 1,
    deployedSpecs: 1,
  },
  path: ["list_specs", "load_each", "rollup", "emit"],
};

const sampleQueue: WorkQueue = {
  proposals: [
    {
      specName: "alpha",
      id: "p-1",
      status: "open",
      kind: "remediate",
      targetId: "local",
      summary: "fix billing path",
      ageHours: 12,
      ageDisplay: "12h",
      next: "claim",
      urgencyScore: 82,
      urgency: "high",
    },
  ],
  tasks: [
    {
      specName: "alpha",
      id: "t-1",
      status: "pending",
      title: "Investigate degrade",
      ageHours: 4,
      ageDisplay: "4h",
    },
  ],
  totals: { proposals: 1, tasks: 1, specsWithWork: 1 },
  path: ["list_specs", "load_proposals_tasks", "sort", "emit"],
  pathDisplay: "list_specs → load_proposals_tasks → sort → emit",
};

describe("renderOpsDashboardHtml", () => {
  it("returns self-contained HTML with doctype and inline styles", () => {
    const html = renderOpsDashboardHtml(emptyBoard(), undefined, "2026-08-07T18:00:00Z");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("CXOS Ops Dashboard");
    expect(html).toContain("Generated 2026-08-07T18:00:00Z");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/cdn\./i);
    expect(html).not.toContain("—");
  });

  it("renders board totals as cards and fleet rows", () => {
    const html = renderOpsDashboardHtml(sampleBoard, undefined, "2026-08-07T18:00:00Z");
    expect(html).toContain("<b>2</b><span>Specs</span>");
    expect(html).toContain("<b>1</b><span>Deployed</span>");
    expect(html).toContain("<b>3</b><span>Proposals open</span>");
    expect(html).toContain("<b>3</b><span>Tasks open</span>");
    expect(html).toContain("<b>1</b><span>Daemons</span>");
    expect(html).toContain("<strong>alpha</strong>");
    expect(html).toContain("<strong>beta</strong>");
    expect(html).toContain("local, aws-dev");
    expect(html).toContain("2+1c");
    expect(html).toContain("up");
    expect(html).toContain("off");
  });

  it("escapes HTML in idea and omits queue sections when queue absent", () => {
    const html = renderOpsDashboardHtml(sampleBoard, undefined, "2026-08-07T18:00:00Z");
    expect(html).toContain("alpha idea &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Open proposals");
    expect(html).not.toContain("Open tasks");
  });

  it("renders queue proposals and tasks when provided", () => {
    const html = renderOpsDashboardHtml(sampleBoard, sampleQueue, "2026-08-07T18:00:00Z");
    expect(html).toContain("Open proposals (1)");
    expect(html).toContain("Open tasks (1)");
    expect(html).toContain("p-1");
    expect(html).toContain("fix billing path");
    expect(html).toContain("t-1");
    expect(html).toContain("Investigate degrade");
    expect(html).toContain("urg-high");
    expect(html).toContain("12h");
    expect(html).toContain("4h");
  });

  it("shows empty-fleet placeholder when no rows", () => {
    const html = renderOpsDashboardHtml(emptyBoard(), undefined, "2026-08-07T18:00:00Z");
    expect(html).toContain("no specs");
    expect(html).toContain("<b>0</b><span>Specs</span>");
  });

  it("shows empty queue tables when queue has zero items", () => {
    const emptyQ: WorkQueue = {
      proposals: [],
      tasks: [],
      totals: { proposals: 0, tasks: 0, specsWithWork: 0 },
      path: [],
      pathDisplay: "",
    };
    const html = renderOpsDashboardHtml(emptyBoard(), emptyQ, "2026-08-07T18:00:00Z");
    expect(html).toContain("Open proposals (0)");
    expect(html).toContain("Open tasks (0)");
    expect(html).toContain("(none)");
  });
});
