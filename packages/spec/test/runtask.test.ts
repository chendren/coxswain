import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent, HookPayload, SpecTask } from "@cox/core";
import { createSpecEngine, type SpecEngineDeps } from "../src/engine.js";
import { parseTasks } from "../src/parser.js";
import {
  designPath,
  readRuns,
  readSpecState,
  requirementsPath,
  specDir,
  tasksPath,
  writeSpecState,
} from "../src/state.js";
import { fakeRunner, REQ_FIXTURE_MD, tmpProject, VALID_TASKS_MD, type ScriptedRun } from "./helpers.js";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";
const DESIGN_MD = "# Design — widget\n\nSome design body.\n";

type SpecEventType = Extract<AgentEvent, { type: "spec_event" }>;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

async function setup(script: ScriptedRun[] = []) {
  const { cwd, cleanup } = await tmpProject();
  cleanups.push(cleanup);
  const events: AgentEvent[] = [];
  const taskCompletes: HookPayload[] = [];
  const runner = fakeRunner(script);
  const deps: SpecEngineDeps = {
    cwd,
    runner,
    onEvent: (e) => events.push(e),
    onTaskComplete: async (p) => {
      taskCompletes.push(p);
    },
    now: () => FIXED_NOW,
  };
  return { cwd, events, taskCompletes, runner, engine: createSpecEngine(deps) };
}

function specEvents(events: AgentEvent[]): SpecEventType[] {
  return events.filter((e): e is SpecEventType => e.type === "spec_event");
}

/** Spec with tasks approved: requirements.md = REQ_FIXTURE_MD (covers
 * R1.1/R1.2/R2.1/R2.2 — exactly what VALID_TASKS_MD's 3 tasks reference),
 * design.md = DESIGN_MD, tasks.md = VALID_TASKS_MD, with the given task
 * statuses applied (default: all pending). */
async function approvedTasksSpec(
  cwd: string,
  engine: ReturnType<typeof createSpecEngine>,
  name: string,
  statuses: Record<string, SpecTask["status"]> = {},
) {
  await engine.create(name, "the idea");
  const dir = specDir(cwd, name);
  await fs.writeFile(requirementsPath(dir), REQ_FIXTURE_MD, "utf8");
  await fs.writeFile(designPath(dir), DESIGN_MD, "utf8");
  await fs.writeFile(tasksPath(dir), VALID_TASKS_MD, "utf8");

  const { tasks } = parseTasks(VALID_TASKS_MD);
  const withStatuses: SpecTask[] = tasks.map((t) => ({ ...t, status: statuses[t.id] ?? "pending" }));

  const stored = await readSpecState(dir);
  await writeSpecState(dir, {
    ...stored,
    phases: { requirements: "approved", design: "approved", tasks: "approved" },
    approvals: [
      { phase: "requirements", at: FIXED_NOW },
      { phase: "design", at: FIXED_NOW },
      { phase: "tasks", at: FIXED_NOW },
    ],
    tasks: withStatuses,
  });
}

describe("SpecEngine.runTask — gating and selection (R7.1, R7.2, R7.3)", () => {
  it('R7.1: throws when the tasks phase is not "approved"', async () => {
    const { engine } = await setup();
    await engine.create("widget", "the idea");

    await expect(engine.runTask("widget")).rejects.toThrow(/"tasks".*"missing"/s);
  });

  it("R7.2: with no taskId, selects the first pending task in document order", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done" });

    await engine.runTask("widget");

    expect(runner.calls[0]?.taskId).toBe("2");
  });

  it("R7.2: throws naming all-done when every task is done", async () => {
    const { cwd, engine } = await setup();
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done", "2": "done", "3": "done" });

    await expect(engine.runTask("widget")).rejects.toThrow(/all tasks are done/);
  });

  it("R7.2: throws naming blocked/in-progress when nothing is pending but not everything is done", async () => {
    const { cwd, engine } = await setup();
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done", "2": "blocked", "3": "in_progress" });

    await expect(engine.runTask("widget")).rejects.toThrow(/blocked or in progress/);
  });

  it("R7.3: an explicit pending task runs", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    await engine.runTask("widget", "2");

    expect(runner.calls[0]?.taskId).toBe("2");
  });

  it("R7.3: an explicit blocked task runs (recovery)", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget", { "2": "blocked" });

    await engine.runTask("widget", "2");

    expect(runner.calls[0]?.taskId).toBe("2");
  });

  it("R7.3: an explicit in_progress task runs (crash recovery)", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget", { "2": "in_progress" });

    await engine.runTask("widget", "2");

    expect(runner.calls[0]?.taskId).toBe("2");
  });

  it('R7.3: an explicit "done" task throws', async () => {
    const { cwd, engine } = await setup();
    await approvedTasksSpec(cwd, engine, "widget", { "2": "done" });

    await expect(engine.runTask("widget", "2")).rejects.toThrow(/"2".*already.*"done"/s);
  });

  it("throws naming an unknown task id", async () => {
    const { cwd, engine } = await setup();
    await approvedTasksSpec(cwd, engine, "widget");

    await expect(engine.runTask("widget", "99")).rejects.toThrow(/"99"/);
  });
});

describe("SpecEngine.runTask — AgentTask shape (R7.4)", () => {
  it("R7.4: builds AgentTask with kind spec-task-exec, complexityHint, taskId, specName, sessionId", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    await engine.runTask("widget", "2");

    const call = runner.calls[0];
    expect(call?.kind).toBe("spec-task-exec");
    expect(call?.complexityHint).toBe(3);
    expect(call?.taskId).toBe("2");
    expect(call?.specName).toBe("widget");
    expect(call?.sessionId).toBe("spec:widget");
    expect(call?.cwd).toBe(cwd);
  });

  it("R7.4: the prompt contains the task title, its requirement excerpts, and the full design body", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    await engine.runTask("widget", "2");

    const prompt = runner.calls[0]?.prompt ?? "";
    expect(prompt).toContain("Implement core logic"); // task 2's title
    expect(prompt).toContain("R1.2: IF the fixture is malformed"); // requirement excerpt
    expect(prompt).toContain("R2.1: WHEN something happens"); // second requirement excerpt
    expect(prompt).toContain("Some design body."); // full design.md
  });

  it("R7.4: emits task:in_progress (with taskId) before the run, persisted to spec.json", async () => {
    const { cwd, engine, events } = await setup([{ finalText: "ok", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    await engine.runTask("widget", "2");

    const inProgress = specEvents(events).filter((e) => e.status === "task:in_progress");
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]).toMatchObject({ phase: "execution", taskId: "2" });

    const stored = await readSpecState(specDir(cwd, "widget"));
    // by the time the run resolves the task has already moved past in_progress
    expect(stored.tasks.find((t) => t.id === "2")?.status).not.toBe("pending");
  });
});

describe("SpecEngine.runTask — success (R7.5)", () => {
  it("R7.5: end_turn marks the task done, flips only its checkbox, resets the failure count, and awaits onTaskComplete", async () => {
    const { cwd, engine, events, taskCompletes } = await setup([{ finalText: "done", stopReason: "end_turn" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    const result = await engine.runTask("widget", "2");

    expect(result.tasks.find((t) => t.id === "2")?.status).toBe("done");

    const dir = specDir(cwd, "widget");
    const md = await fs.readFile(tasksPath(dir), "utf8");
    expect(md).toContain("- [x] 2. Implement core logic");
    expect(md).toContain("- [ ] 1. Scaffold the module");
    expect(md).toContain("- [ ] 3. Wire up integration");

    const runs = await readRuns(dir);
    expect(runs["2"]?.consecutiveFailures).toBe(0);

    expect(specEvents(events).filter((e) => e.status === "task:done")).toHaveLength(1);

    expect(taskCompletes).toHaveLength(1);
    expect(taskCompletes[0]).toMatchObject({
      event: "TaskComplete",
      sessionId: "spec:widget",
      cwd,
      data: { specName: "widget", taskId: "2", title: "Implement core logic" },
    });
  });
});

describe("SpecEngine.runTask — failure ladder (R7.6, R7.7)", () => {
  it("R7.6: a non-end_turn stopReason sets the task back to pending and increments the failure count", async () => {
    const { cwd, engine, events } = await setup([{ finalText: "", stopReason: "max_tokens" }]);
    await approvedTasksSpec(cwd, engine, "widget");

    const result = await engine.runTask("widget", "2");

    expect(result.tasks.find((t) => t.id === "2")?.status).toBe("pending");
    const runs = await readRuns(specDir(cwd, "widget"));
    expect(runs["2"]?.consecutiveFailures).toBe(1);
    expect(runs["2"]?.lastStopReason).toBe("max_tokens");
    expect(specEvents(events).filter((e) => e.status === "task:failed")).toHaveLength(1);
  });

  it("R7.7: a second consecutive auto-selected failure blocks the task", async () => {
    const { cwd, engine, events } = await setup([
      { finalText: "", stopReason: "max_tokens" },
      { finalText: "", stopReason: "max_tokens" },
    ]);
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done" }); // "2" is first pending

    await engine.runTask("widget"); // count 0 -> 1, stays pending
    const result = await engine.runTask("widget"); // count 1 -> 2, blocks

    expect(result.tasks.find((t) => t.id === "2")?.status).toBe("blocked");
    expect(specEvents(events).filter((e) => e.status === "task:blocked")).toHaveLength(1);
    const runs = await readRuns(specDir(cwd, "widget"));
    expect(runs["2"]?.consecutiveFailures).toBe(2);
  });

  it("R7.7: an explicit re-run of a blocked task resets the failure count to 0 before running", async () => {
    const { cwd, engine } = await setup([
      { finalText: "", stopReason: "max_tokens" },
      { finalText: "", stopReason: "max_tokens" },
      { finalText: "", stopReason: "max_tokens" }, // 3rd failure, but post-reset
    ]);
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done" });

    await engine.runTask("widget"); // count 0 -> 1
    await engine.runTask("widget"); // count 1 -> 2, blocked
    const result = await engine.runTask("widget", "2"); // explicit: reset to 0, then fail -> 1

    // If the reset hadn't happened this would still read "blocked" (count 2->3).
    expect(result.tasks.find((t) => t.id === "2")?.status).toBe("pending");
    const runs = await readRuns(specDir(cwd, "widget"));
    expect(runs["2"]?.consecutiveFailures).toBe(1);
  });

  it("R7.7: a subsequent successful explicit run after blocking still resets the count and completes", async () => {
    const { cwd, engine } = await setup([
      { finalText: "", stopReason: "max_tokens" },
      { finalText: "", stopReason: "max_tokens" },
      { finalText: "recovered", stopReason: "end_turn" },
    ]);
    await approvedTasksSpec(cwd, engine, "widget", { "1": "done" });

    await engine.runTask("widget");
    await engine.runTask("widget"); // now blocked
    const result = await engine.runTask("widget", "2"); // explicit recovery run

    expect(result.tasks.find((t) => t.id === "2")?.status).toBe("done");
    const runs = await readRuns(specDir(cwd, "widget"));
    expect(runs["2"]?.consecutiveFailures).toBe(0);
  });
});
