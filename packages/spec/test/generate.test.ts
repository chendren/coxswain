import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent, HookPayload, SpecState } from "@cox/core";
import { createSpecEngine, type SpecEngineDeps } from "../src/engine.js";
import { SPEC_SYSTEM } from "../src/prompts.js";
import {
  designPath,
  readSpecState,
  requirementsPath,
  specDir,
  tasksPath,
  tasksRejectedPath,
  writeSpecState,
} from "../src/state.js";
import { fakeRunner, tmpProject, VALID_TASKS_MD, type ScriptedRun } from "./helpers.js";

type SpecEventType = Extract<AgentEvent, { type: "spec_event" }>;

const FIXED_NOW = "2026-01-01T00:00:00.000Z";

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
  const phaseChanges: HookPayload[] = [];
  const runner = fakeRunner(script);
  const deps: SpecEngineDeps = {
    cwd,
    runner,
    onEvent: (e) => events.push(e),
    onPhaseChange: async (p) => {
      phaseChanges.push(p);
    },
    now: () => FIXED_NOW,
  };
  return { cwd, events, phaseChanges, runner, engine: createSpecEngine(deps) };
}

function specEvents(events: AgentEvent[]): SpecEventType[] {
  return events.filter((e): e is SpecEventType => e.type === "spec_event");
}

function errorEvents(events: AgentEvent[]): Extract<AgentEvent, { type: "error" }>[] {
  return events.filter((e): e is Extract<AgentEvent, { type: "error" }> => e.type === "error");
}

/** Marks `requirements` approved directly on disk, bypassing approve()
 * (not implemented until task 11). */
async function approveRequirements(cwd: string, name: string, content = "# Requirements — x\n- R1.1: ...\n") {
  const dir = specDir(cwd, name);
  await fs.writeFile(requirementsPath(dir), content, "utf8");
  const stored = await readSpecState(dir);
  await writeSpecState(dir, {
    ...stored,
    phases: { ...stored.phases, requirements: "approved" },
    approvals: [...stored.approvals, { phase: "requirements", at: FIXED_NOW }],
  });
}

async function approveDesign(cwd: string, name: string, content = "# Design — x\n...\n") {
  const dir = specDir(cwd, name);
  await fs.writeFile(designPath(dir), content, "utf8");
  const stored = await readSpecState(dir);
  await writeSpecState(dir, {
    ...stored,
    phases: { ...stored.phases, design: "approved" },
    approvals: [...stored.approvals, { phase: "design", at: FIXED_NOW }],
  });
}

async function approveTasksPhaseOnly(cwd: string, name: string) {
  const dir = specDir(cwd, name);
  const stored = await readSpecState(dir);
  await writeSpecState(dir, {
    ...stored,
    phases: { ...stored.phases, tasks: "approved" },
    approvals: [...stored.approvals, { phase: "tasks", at: FIXED_NOW }],
  });
}

describe("SpecEngine.generate — AgentTask shape (R5.1, R5.2)", () => {
  it("R5.1: builds the AgentTask for requirements — kind, sessionId, system, specName, cwd", async () => {
    const { cwd, engine, runner } = await setup([
      { finalText: "# Requirements — widget\n...", stopReason: "end_turn" },
    ]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    expect(runner.calls).toHaveLength(1);
    const call = runner.calls[0];
    expect(call?.kind).toBe("spec-requirements");
    expect(call?.sessionId).toBe("spec:widget");
    expect(call?.system).toBe(SPEC_SYSTEM);
    expect(call?.specName).toBe("widget");
    expect(call?.cwd).toBe(cwd);
    expect(call?.prompt).toContain("the idea");
  });

  it("R5.2: requirements sets maxTurns: 1", async () => {
    const { engine, runner } = await setup([{ finalText: "# Requirements — widget\n...", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    expect(runner.calls[0]?.maxTurns).toBe(1);
  });

  it("R5.1/R5.2: design carries kind spec-design, sessionId, and maxTurns unset (may use tools)", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: "# Design — widget\n...", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveRequirements(cwd, "widget");

    await engine.generate("widget", "design");

    const call = runner.calls[0];
    expect(call?.kind).toBe("spec-design");
    expect(call?.sessionId).toBe("spec:widget");
    expect(call?.specName).toBe("widget");
    expect(call?.maxTurns).toBeUndefined();
    expect(call?.prompt).toContain("- R1.1: ...");
  });
});

describe("SpecEngine.generate — success path (R5.3)", () => {
  it("R5.3: strips a wrapping ```markdown fence, writes the file, sets draft, emits spec_event", async () => {
    const { cwd, engine, events } = await setup([
      { finalText: "```markdown\n# Requirements — widget\nBody text.\n```", stopReason: "end_turn" },
    ]);
    await engine.create("widget", "the idea");

    const result = await engine.generate("widget", "requirements");

    expect(result.phases.requirements).toBe("draft");
    const onDisk = await fs.readFile(requirementsPath(specDir(cwd, "widget")), "utf8");
    expect(onDisk).toBe("# Requirements — widget\nBody text.");

    const draftEvents = specEvents(events).filter((e) => e.status === "draft");
    expect(draftEvents).toHaveLength(1);
    expect(draftEvents[0]).toMatchObject({ specName: "widget", phase: "requirements", status: "draft" });
  });

  it("R5.3: strips a plain ``` fence (no language tag) too", async () => {
    const { cwd, engine } = await setup([{ finalText: "```\n# Requirements — widget\nBody.\n```", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    const onDisk = await fs.readFile(requirementsPath(specDir(cwd, "widget")), "utf8");
    expect(onDisk).toBe("# Requirements — widget\nBody.");
  });

  it("R5.3: writes content as-is when there is no wrapping fence", async () => {
    const { cwd, engine } = await setup([{ finalText: "# Requirements — widget\nNo fence here.", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    const onDisk = await fs.readFile(requirementsPath(specDir(cwd, "widget")), "utf8");
    expect(onDisk).toBe("# Requirements — widget\nNo fence here.");
  });

  it("R5.3: persists spec.json with the phase set to draft", async () => {
    const { cwd, engine } = await setup([{ finalText: "# Requirements — widget\n...", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    const stored = await readSpecState(specDir(cwd, "widget"));
    expect(stored.phases.requirements).toBe("draft");
  });
});

describe("SpecEngine.generate — failure path (R5.4)", () => {
  it("R5.4: a non-end_turn stopReason writes nothing and emits an error event", async () => {
    const { cwd, engine, events } = await setup([{ finalText: "partial output", stopReason: "max_tokens" }]);
    await engine.create("widget", "the idea");

    const result = await engine.generate("widget", "requirements");

    expect(result.phases.requirements).toBe("missing");
    await expect(fs.access(requirementsPath(specDir(cwd, "widget")))).rejects.toThrow();
    const errs = errorEvents(events);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("requirements");
    expect(errs[0]?.message).toContain("max_tokens");
  });

  it("R5.4: blank finalText with end_turn also counts as failure", async () => {
    const { cwd, engine, events } = await setup([{ finalText: "   \n  ", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");

    const result = await engine.generate("widget", "requirements");

    expect(result.phases.requirements).toBe("missing");
    await expect(fs.access(requirementsPath(specDir(cwd, "widget")))).rejects.toThrow();
    expect(errorEvents(events)).toHaveLength(1);
  });

  it("R5.4: a rejected run leaves an already-draft phase's content untouched", async () => {
    const { cwd, engine } = await setup([{ finalText: "", stopReason: "refusal" }]);
    await engine.create("widget", "the idea");
    await fs.writeFile(requirementsPath(specDir(cwd, "widget")), "original draft content", "utf8");

    await engine.generate("widget", "requirements");

    const onDisk = await fs.readFile(requirementsPath(specDir(cwd, "widget")), "utf8");
    expect(onDisk).toBe("original draft content");
  });
});

describe("SpecEngine.generate — regeneration demotion cascade (R4.3)", () => {
  it("R4.3: regenerating approved requirements demotes approved design+tasks, emits demoted events, and awaits onPhaseChange with from/to", async () => {
    const { cwd, engine, events, phaseChanges } = await setup([
      { finalText: "# Requirements — widget\nregenerated", stopReason: "end_turn" },
    ]);
    await engine.create("widget", "the idea");
    await approveRequirements(cwd, "widget");
    await approveDesign(cwd, "widget");
    await approveTasksPhaseOnly(cwd, "widget");

    const result = await engine.generate("widget", "requirements");

    expect(result.phases).toEqual({ requirements: "draft", design: "draft", tasks: "draft" });

    const demotedEvents = specEvents(events).filter((e) => e.status === "demoted");
    expect(demotedEvents.map((e) => e.phase).sort()).toEqual(["design", "tasks"]);

    expect(phaseChanges).toHaveLength(2);
    for (const payload of phaseChanges) {
      expect(payload.event).toBe("SpecPhaseChange");
      expect(payload.sessionId).toBe("spec:widget");
      expect(payload.cwd).toBe(cwd);
      expect(payload.data.specName).toBe("widget");
      expect(payload.data.from).toBe("approved");
      expect(payload.data.to).toBe("draft");
    }
    expect(phaseChanges.map((p) => p.data.phase).sort()).toEqual(["design", "tasks"]);
  });

  it("R4.3: no cascade (and no onPhaseChange calls) when nothing downstream is approved", async () => {
    const { engine, events, phaseChanges } = await setup([
      { finalText: "# Requirements — widget\n...", stopReason: "end_turn" },
    ]);
    await engine.create("widget", "the idea");

    await engine.generate("widget", "requirements");

    expect(specEvents(events).filter((e) => e.status === "demoted")).toHaveLength(0);
    expect(phaseChanges).toHaveLength(0);
  });

  it("R4.1: regenerating an approved phase itself demotes it to draft (reported via the draft spec_event, not demoted)", async () => {
    const { cwd, engine, events } = await setup([{ finalText: "# Requirements — widget\nregen", stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveRequirements(cwd, "widget");

    const result = await engine.generate("widget", "requirements");

    expect(result.phases.requirements).toBe("draft");
    const requirementsSpecEvents = specEvents(events).filter((e) => e.phase === "requirements");
    expect(requirementsSpecEvents).toEqual([
      { type: "spec_event", specName: "widget", phase: "requirements", status: "draft" },
    ]);
  });
});

describe("SpecEngine.generate — tasks validation and rejects (R5.5)", () => {
  it("R5.5: valid output writes tasks.md, resets statuses to pending, and populates spec.json", async () => {
    const { cwd, engine } = await setup([{ finalText: VALID_TASKS_MD, stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveDesign(cwd, "widget");

    const result = await engine.generate("widget", "tasks");

    expect(result.phases.tasks).toBe("draft");
    expect(result.tasks).toEqual([
      { id: "1", title: "Scaffold the module", requirements: ["R1.1"], complexity: 1, status: "pending" },
      { id: "2", title: "Implement core logic", requirements: ["R1.2", "R2.1"], complexity: 3, status: "pending" },
      { id: "3", title: "Wire up integration", requirements: ["R2.2"], complexity: 2, status: "pending" },
    ]);

    const dir = specDir(cwd, "widget");
    const onDisk = await fs.readFile(tasksPath(dir), "utf8");
    expect(onDisk).toContain("# Tasks — widget");
    expect(onDisk).toContain("- [ ] 1. Scaffold the module");

    const stored = await readSpecState(dir);
    expect(stored.tasks).toEqual(result.tasks);
    expect(stored.phases.tasks).toBe("draft");
  });

  it("R5.5: invalid output writes tasks.rejected.md, leaves tasks.md/statuses untouched, emits the first parse error", async () => {
    const malformed = "- [ ] 1. Missing every metadata line\n";
    const { cwd, engine, events } = await setup([{ finalText: malformed, stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveDesign(cwd, "widget");
    const dir = specDir(cwd, "widget");
    await fs.writeFile(tasksPath(dir), "PRE-EXISTING TASKS CONTENT", "utf8");

    const result = await engine.generate("widget", "tasks");

    expect(result.phases.tasks).toBe("missing"); // untouched — approveDesign never touches the tasks phase
    const rejected = await fs.readFile(tasksRejectedPath(dir), "utf8");
    expect(rejected).toBe(malformed.trim()); // stripFence trims the whole document
    const untouched = await fs.readFile(tasksPath(dir), "utf8");
    expect(untouched).toBe("PRE-EXISTING TASKS CONTENT");

    const errs = errorEvents(events);
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain('missing "requirements:"');
  });

  it("R5.5: tasks AgentTask uses kind spec-tasks and maxTurns 1", async () => {
    const { cwd, engine, runner } = await setup([{ finalText: VALID_TASKS_MD, stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveDesign(cwd, "widget");

    await engine.generate("widget", "tasks");

    expect(runner.calls[0]?.kind).toBe("spec-tasks");
    expect(runner.calls[0]?.maxTurns).toBe(1);
    expect(runner.calls[0]?.sessionId).toBe("spec:widget");
  });
});

describe("SpecEngine.generate — tasks-reset event (R4.4)", () => {
  async function withADoneTask(cwd: string, name: string): Promise<SpecState> {
    const dir = specDir(cwd, name);
    await fs.writeFile(tasksPath(dir), VALID_TASKS_MD, "utf8");
    const stored = await readSpecState(dir);
    const tasksWithOneDone: SpecState["tasks"] = [
      { id: "1", title: "Scaffold the module", requirements: ["R1.1"], complexity: 1, status: "done" },
      { id: "2", title: "Implement core logic", requirements: ["R1.2", "R2.1"], complexity: 3, status: "pending" },
      { id: "3", title: "Wire up integration", requirements: ["R2.2"], complexity: 2, status: "pending" },
    ];
    const next: SpecState = { ...stored, phases: { ...stored.phases, design: "approved" }, tasks: tasksWithOneDone };
    await writeSpecState(dir, next);
    return next;
  }

  it('R4.4: emits "tasks-reset" when a previously-done task is discarded by a fresh generation', async () => {
    const { cwd, engine, events } = await setup([{ finalText: VALID_TASKS_MD, stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await withADoneTask(cwd, "widget");

    const result = await engine.generate("widget", "tasks");

    expect(result.tasks.every((t) => t.status === "pending")).toBe(true);
    const resetEvents = specEvents(events).filter((e) => e.status === "tasks-reset");
    expect(resetEvents).toHaveLength(1);
    expect(resetEvents[0]).toMatchObject({ specName: "widget", phase: "tasks", status: "tasks-reset" });
  });

  it('R4.4: does NOT emit "tasks-reset" when no prior task was done', async () => {
    const { cwd, engine, events } = await setup([{ finalText: VALID_TASKS_MD, stopReason: "end_turn" }]);
    await engine.create("widget", "the idea");
    await approveDesign(cwd, "widget");

    await engine.generate("widget", "tasks");

    expect(specEvents(events).filter((e) => e.status === "tasks-reset")).toHaveLength(0);
  });
});
