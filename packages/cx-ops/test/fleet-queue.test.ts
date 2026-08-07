import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _urgencyFromKind,
  appendProposalsFromTick,
  applyProposal,
  buildWorkQueue,
  createCxSpec,
  loadProposals,
  transitionProposal,
  transitionTask,
} from "../src/index";
import type { CxProposal } from "../src/proposals";
import type { CxTask } from "../src/tasks";

async function seedProposal(
  cxRoot: string,
  now: () => string,
  specName: string,
  proposal: CxProposal,
): Promise<void> {
  const dir = join(cxRoot, specName);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "proposals.json");
  let existing: CxProposal[] = [];
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    existing = (JSON.parse(raw) as { proposals?: CxProposal[] }).proposals ?? [];
  } catch {
    /* empty */
  }
  await writeFile(
    path,
    JSON.stringify({ proposals: [...existing, proposal], updatedAt: now() }, null, 2),
    "utf8",
  );
}

async function seedTask(
  cxRoot: string,
  now: () => string,
  specName: string,
  task: CxTask,
): Promise<void> {
  const dir = join(cxRoot, specName);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "tasks.json");
  let existing: CxTask[] = [];
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    existing = (JSON.parse(raw) as { tasks?: CxTask[] }).tasks ?? [];
  } catch {
    /* empty */
  }
  await writeFile(
    path,
    JSON.stringify({ tasks: [...existing, task], updatedAt: now() }, null, 2),
    "utf8",
  );
}

function tick(kind: "investigate" | "remediate", summary: string, ruleId: string) {
  return {
    targetId: "local" as const,
    kind,
    summary,
    nba: {
      rules: [],
      primary: {
        id: ruleId,
        name: ruleId,
        priority: 1,
        conditions: [],
        logic: "AND" as const,
        action: kind === "remediate" ? "fix" : "noop",
        actionType: "other" as const,
        urgency: "low" as const,
      },
    },
    path: ["test"],
  };
}

describe("buildWorkQueue", () => {
  let cxRoot: string;
  const now = () => "2026-08-07T18:00:00Z";
  const nowMs = Date.parse(now());

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-fq-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("returns empty queue when no specs", async () => {
    const q = await buildWorkQueue({ cxRoot, now }, nowMs);
    expect(q.proposals).toEqual([]);
    expect(q.tasks).toEqual([]);
    expect(q.totals).toEqual({ proposals: 0, tasks: 0, specsWithWork: 0 });
    expect(q.path).toEqual(["list_specs", "load_proposals_tasks", "sort", "emit"]);
  });

  it("aggregates open proposals and open tasks across listCxSpecs", async () => {
    await createCxSpec({ cxRoot, now }, "alpha", "alpha idea");
    await createCxSpec({ cxRoot, now }, "beta", "beta idea");

    await appendProposalsFromTick({ cxRoot, now }, "alpha", [
      tick("investigate", "alpha degraded", "R_A"),
    ]);
    await appendProposalsFromTick({ cxRoot, now }, "beta", [
      tick("remediate", "beta down", "R_B"),
    ]);

    const betaProps = await loadProposals({ cxRoot, now }, "beta");
    await applyProposal({ cxRoot, now }, "beta", betaProps[0]!);

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);

    expect(q.totals.proposals).toBe(2);
    expect(q.totals.tasks).toBe(1);
    expect(q.totals.specsWithWork).toBe(2);

    const alphaProp = q.proposals.find((p) => p.specName === "alpha");
    expect(alphaProp).toMatchObject({
      status: "open",
      kind: "investigate",
      next: "apply",
      urgency: "med",
      ageHours: 0,
    });

    const betaProp = q.proposals.find((p) => p.specName === "beta");
    expect(betaProp).toMatchObject({
      status: "claimed",
      kind: "remediate",
      next: "resolve",
      urgency: "high",
      ageHours: 0,
    });

    expect(q.tasks).toHaveLength(1);
    expect(q.tasks[0]).toMatchObject({
      specName: "beta",
      status: "pending",
      ageHours: 0,
      sourceProposalId: betaProps[0]!.id,
    });
  });

  it("excludes resolved/dismissed proposals and done/cancelled tasks", async () => {
    await createCxSpec({ cxRoot, now }, "gamma", "g");
    await appendProposalsFromTick({ cxRoot, now }, "gamma", [
      tick("investigate", "keep open", "R_OPEN"),
      tick("remediate", "will dismiss", "R_DISMISS"),
    ]);
    const props = await loadProposals({ cxRoot, now }, "gamma");
    const open = props.find((p) => p.nbaRuleId === "R_OPEN")!;
    const dismiss = props.find((p) => p.nbaRuleId === "R_DISMISS")!;
    await transitionProposal({ cxRoot, now }, "gamma", dismiss.id, "dismissed");

    await seedProposal(cxRoot, now, "gamma", {
      id: "prop_resolved",
      specName: "gamma",
      targetId: "local",
      kind: "investigate",
      summary: "already done",
      status: "resolved",
      createdAt: "2026-08-06T18:00:00Z",
      updatedAt: now(),
      path: ["t"],
    });

    const { task } = await applyProposal({ cxRoot, now }, "gamma", open);
    await seedTask(cxRoot, now, "gamma", {
      id: "task_done",
      specName: "gamma",
      title: "done work",
      detail: "",
      status: "done",
      createdAt: "2026-08-06T12:00:00Z",
      updatedAt: now(),
      path: [],
    });
    await seedTask(cxRoot, now, "gamma", {
      id: "task_cancel",
      specName: "gamma",
      title: "cancelled work",
      detail: "",
      status: "cancelled",
      createdAt: "2026-08-06T12:00:00Z",
      updatedAt: now(),
      path: [],
    });
    await seedTask(cxRoot, now, "gamma", {
      id: "task_wip",
      specName: "gamma",
      title: "in progress work",
      detail: "",
      status: "in_progress",
      createdAt: "2026-08-07T12:00:00Z",
      updatedAt: now(),
      path: [],
    });

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);

    expect(q.proposals.map((p) => p.id)).toEqual(
      expect.arrayContaining([open.id]),
    );
    expect(q.proposals.every((p) => p.status === "open" || p.status === "claimed")).toBe(
      true,
    );
    expect(q.proposals.some((p) => p.id === dismiss.id || p.id === "prop_resolved")).toBe(
      false,
    );

    const taskIds = q.tasks.map((t) => t.id);
    expect(taskIds).toEqual(expect.arrayContaining([task.id, "task_wip"]));
    expect(taskIds).not.toContain("task_done");
    expect(taskIds).not.toContain("task_cancel");
    expect(q.totals.tasks).toBe(2);
  });

  it("computes ageHours from createdAt and nowMs", async () => {
    await createCxSpec({ cxRoot, now }, "age", "age idea");
    await seedProposal(cxRoot, now, "age", {
      id: "prop_old",
      specName: "age",
      targetId: "local",
      kind: "investigate",
      summary: "stale",
      status: "open",
      createdAt: "2026-08-07T12:00:00Z", // 6h before now
      updatedAt: "2026-08-07T12:00:00Z",
      path: ["t"],
    });
    await seedTask(cxRoot, now, "age", {
      id: "task_old",
      specName: "age",
      title: "old task",
      detail: "",
      status: "pending",
      createdAt: "2026-08-07T08:00:00Z", // 10h before now
      updatedAt: "2026-08-07T08:00:00Z",
      path: [],
    });

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);
    expect(q.proposals[0]!.ageHours).toBe(6);
    expect(q.tasks[0]!.ageHours).toBe(10);
  });

  it("sets suggested next from proposal status", async () => {
    await createCxSpec({ cxRoot, now }, "next", "n");
    await seedProposal(cxRoot, now, "next", {
      id: "p_open",
      specName: "next",
      targetId: "local",
      kind: "investigate",
      summary: "open",
      status: "open",
      createdAt: now(),
      updatedAt: now(),
      path: [],
    });
    await seedProposal(cxRoot, now, "next", {
      id: "p_claimed",
      specName: "next",
      targetId: "local",
      kind: "remediate",
      summary: "claimed",
      status: "claimed",
      createdAt: now(),
      updatedAt: now(),
      path: [],
    });

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);
    expect(q.proposals.find((p) => p.id === "p_open")!.next).toBe("apply");
    expect(q.proposals.find((p) => p.id === "p_claimed")!.next).toBe("resolve");
  });

  it("sorts proposals by urgency then age, tasks by age", async () => {
    await createCxSpec({ cxRoot, now }, "sort", "s");
    await seedProposal(cxRoot, now, "sort", {
      id: "p_inv_old",
      specName: "sort",
      targetId: "local",
      kind: "investigate",
      summary: "old inv",
      status: "open",
      createdAt: "2026-08-07T10:00:00Z", // 8h
      updatedAt: now(),
      path: [],
    });
    await seedProposal(cxRoot, now, "sort", {
      id: "p_rem_new",
      specName: "sort",
      targetId: "local",
      kind: "remediate",
      summary: "new rem",
      status: "open",
      createdAt: "2026-08-07T17:00:00Z", // 1h
      updatedAt: now(),
      path: [],
    });
    await seedProposal(cxRoot, now, "sort", {
      id: "p_inv_new",
      specName: "sort",
      targetId: "local",
      kind: "investigate",
      summary: "new inv",
      status: "open",
      createdAt: "2026-08-07T16:00:00Z", // 2h
      updatedAt: now(),
      path: [],
    });
    await seedTask(cxRoot, now, "sort", {
      id: "t_new",
      specName: "sort",
      title: "new",
      detail: "",
      status: "pending",
      createdAt: "2026-08-07T16:00:00Z",
      updatedAt: now(),
      path: [],
    });
    await seedTask(cxRoot, now, "sort", {
      id: "t_old",
      specName: "sort",
      title: "old",
      detail: "",
      status: "in_progress",
      createdAt: "2026-08-07T06:00:00Z",
      updatedAt: now(),
      path: [],
    });

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);
    expect(q.proposals.map((p) => p.id)).toEqual([
      "p_rem_new", // high urgency first
      "p_inv_old", // med, older
      "p_inv_new", // med, newer
    ]);
    expect(q.tasks.map((t) => t.id)).toEqual(["t_old", "t_new"]);
  });

  it("ignores specs with only closed work for specsWithWork", async () => {
    await createCxSpec({ cxRoot, now }, "idle", "idle");
    await createCxSpec({ cxRoot, now }, "busy", "busy");
    await seedProposal(cxRoot, now, "idle", {
      id: "p_done",
      specName: "idle",
      targetId: "local",
      kind: "investigate",
      summary: "done",
      status: "resolved",
      createdAt: now(),
      updatedAt: now(),
      path: [],
    });
    await seedProposal(cxRoot, now, "busy", {
      id: "p_open",
      specName: "busy",
      targetId: "local",
      kind: "investigate",
      summary: "open",
      status: "open",
      createdAt: now(),
      updatedAt: now(),
      path: [],
    });

    const q = await buildWorkQueue({ cxRoot, now }, nowMs);
    expect(q.totals.specsWithWork).toBe(1);
    expect(q.totals.proposals).toBe(1);
  });
});

describe("_urgencyFromKind", () => {
  it("maps kinds to urgency bands", () => {
    expect(_urgencyFromKind("remediate")).toBe("high");
    expect(_urgencyFromKind("investigate")).toBe("med");
    expect(_urgencyFromKind("other")).toBe("low");
  });
});

describe("buildWorkQueue closed-task side effects", () => {
  let cxRoot: string;
  const now = () => "2026-08-07T18:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-fq2-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("drops task after transitionTask done", async () => {
    await createCxSpec({ cxRoot, now }, "close", "c");
    await appendProposalsFromTick({ cxRoot, now }, "close", [
      tick("investigate", "to close", "R_CLOSE"),
    ]);
    const props = await loadProposals({ cxRoot, now }, "close");
    const { task } = await applyProposal({ cxRoot, now }, "close", props[0]!);

    let q = await buildWorkQueue({ cxRoot, now }, Date.parse(now()));
    expect(q.totals.tasks).toBe(1);
    expect(q.totals.proposals).toBe(1); // claimed still open work

    await transitionTask({ cxRoot, now }, "close", task.id, "done");
    q = await buildWorkQueue({ cxRoot, now }, Date.parse(now()));
    expect(q.totals.tasks).toBe(0);
    expect(q.totals.proposals).toBe(0); // proposal auto-resolved
  });
});
