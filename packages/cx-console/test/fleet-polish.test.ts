import { describe, expect, it } from "vitest";
import { fleetHealthScore, renderFleetPage } from "../src/pages/fleet";
import type { OpsBoard } from "@cox/cx-ops";
import { renderQueuePage } from "../src/pages/queue";
import type { WorkQueue } from "@cox/cx-ops";

describe("fleetHealthScore / day band", () => {
  it("empty fleet is mid (yellow band via healthBand)", () => {
    expect(fleetHealthScore({
      specs: 0,
      proposalsOpen: 0,
      tasksOpen: 0,
      daemonsRunning: 0,
      deployedSpecs: 0,
    })).toBe(55);
  });

  it("quiet deployed fleet scores high", () => {
    const s = fleetHealthScore({
      specs: 3,
      proposalsOpen: 0,
      tasksOpen: 0,
      daemonsRunning: 1,
      deployedSpecs: 2,
    });
    expect(s).toBeGreaterThanOrEqual(80);
  });

  it("heavy open work lowers score", () => {
    const s = fleetHealthScore({
      specs: 2,
      proposalsOpen: 12,
      tasksOpen: 8,
      daemonsRunning: 0,
      deployedSpecs: 0,
    });
    expect(s).toBeLessThan(50);
  });
});

describe("renderFleetPage polish", () => {
  it("empty state matches UX copy and shows day band", () => {
    const board: OpsBoard = {
      rows: [],
      totals: {
        specs: 0,
        proposalsOpen: 0,
        tasksOpen: 0,
        daemonsRunning: 0,
        deployedSpecs: 0,
      },
      path: ["list_specs", "emit"],
    };
    const html = renderFleetPage(board, "local");
    expect(html).toContain("Fleet is empty");
    expect(html).toContain("cox cx init");
    expect(html).toContain("quickstart");
    expect(html).toContain("day band");
    expect(html).toMatch(/band-yellow|YELLOW/);
    expect(html).toContain('class="path-audit"');
  });
});

describe("renderQueuePage empty polish", () => {
  it("empty queue points at seed-operate and Autopilot", () => {
    const queue: WorkQueue = {
      proposals: [],
      tasks: [],
      totals: { proposals: 0, tasks: 0, specsWithWork: 0 },
      path: ["build_queue", "emit"],
      pathDisplay: "build_queue → emit",
    };
    const html = renderQueuePage(queue, "default");
    expect(html).toContain("No open work");
    expect(html).toContain("seed-operate");
    expect(html).toContain("/console/autopilot");
  });
});
