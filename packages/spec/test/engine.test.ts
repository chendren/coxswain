import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent, HookPayload, SpecPhase } from "@cox/core";
import { createSpecEngine, type SpecEngineDeps } from "../src/engine.js";
import {
  designPath,
  ideaPath,
  readSpecState,
  requirementsPath,
  specDir,
  specJsonPath,
  tasksPath,
  writeSpecState,
} from "../src/state.js";
import { fakeRunner, tmpProject, VALID_TASKS_MD } from "./helpers.js";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

async function setup(overrides: Partial<SpecEngineDeps> = {}) {
  const { cwd, cleanup } = await tmpProject();
  cleanups.push(cleanup);
  const events: AgentEvent[] = [];
  const phaseChanges: HookPayload[] = [];
  const runner = fakeRunner([]);
  const deps: SpecEngineDeps = {
    cwd,
    runner,
    onEvent: (e) => events.push(e),
    onPhaseChange: async (p) => {
      phaseChanges.push(p);
    },
    now: () => FIXED_NOW,
    ...overrides,
  };
  return {
    cwd,
    events,
    phaseChanges,
    // Every caller in this file (default or overridden) passes a fakeRunner;
    // return the actually-wired one so `.calls` reflects what ran.
    runner: deps.runner as ReturnType<typeof fakeRunner>,
    engine: createSpecEngine(deps),
  };
}

/** Writes phase content + marks it "draft" directly on disk, bypassing
 * generate() (already covered by generate.test.ts). */
async function makeDraft(
  cwd: string,
  name: string,
  phase: Exclude<SpecPhase, "execution">,
  fileContent: string,
) {
  const dir = specDir(cwd, name);
  const filePath =
    phase === "requirements" ? requirementsPath(dir) : phase === "design" ? designPath(dir) : tasksPath(dir);
  await fs.writeFile(filePath, fileContent, "utf8");
  const stored = await readSpecState(dir);
  await writeSpecState(dir, { ...stored, phases: { ...stored.phases, [phase]: "draft" } });
}

describe("SpecEngine.create", () => {
  it("R1.1: creates the spec dir, spec.json (all phases missing), and idea.md", async () => {
    const { cwd, engine } = await setup();

    const state = await engine.create("safe-divide", "guard divide() against b=0");

    expect(state.name).toBe("safe-divide");
    expect(state.createdAt).toBe(FIXED_NOW);
    expect(state.phases).toEqual({ requirements: "missing", design: "missing", tasks: "missing" });
    expect(state.tasks).toEqual([]);
    expect(state.approvals).toEqual([]);

    const dir = specDir(cwd, "safe-divide");
    const onDisk = JSON.parse(await fs.readFile(specJsonPath(dir), "utf8"));
    expect(onDisk).toEqual(state);
    expect(await fs.readFile(ideaPath(dir), "utf8")).toBe("guard divide() against b=0");
  });

  it("R1.2: rejects a name that fails the pattern and touches no filesystem", async () => {
    const { cwd, engine } = await setup();

    await expect(engine.create("Not Valid!", "idea")).rejects.toThrow(/Not Valid!/);

    await expect(fs.access(specDir(cwd, "Not Valid!"))).rejects.toThrow();
    // The whole .cox dir should never have been created for a rejected name.
    await expect(fs.access(`${cwd}/.cox`)).rejects.toThrow();
  });

  it("R1.2: rejects a name containing a path separator", async () => {
    const { engine } = await setup();

    await expect(engine.create("../escape", "idea")).rejects.toThrow(/\.\.\/escape/);
    await expect(engine.create("nested/name", "idea")).rejects.toThrow(/nested\/name/);
  });

  it("R1.3: throws and leaves the existing spec unmodified when the dir already exists", async () => {
    const { cwd, engine } = await setup();
    const first = await engine.create("safe-divide", "original idea");

    await expect(engine.create("safe-divide", "a different idea")).rejects.toThrow(/safe-divide/);

    const dir = specDir(cwd, "safe-divide");
    const onDisk = JSON.parse(await fs.readFile(specJsonPath(dir), "utf8"));
    expect(onDisk).toEqual(first);
    expect(await fs.readFile(ideaPath(dir), "utf8")).toBe("original idea");
  });
});

describe("SpecEngine.load", () => {
  it("R1.5: returns null for a spec that does not exist", async () => {
    const { engine } = await setup();
    expect(await engine.load("does-not-exist")).toBeNull();
  });

  it("R1.4: merges the task SET from tasks.md with STATUS truth from spec.json, defaulting unknown ids to pending", async () => {
    const { cwd, engine } = await setup();
    await engine.create("widget", "idea");
    const dir = specDir(cwd, "widget");

    // Simulate an approved task list on disk (bypassing generate/approve,
    // not yet implemented at this point in the lane).
    await fs.writeFile(tasksPath(dir), VALID_TASKS_MD, "utf8");
    const stored = await readSpecState(dir);
    await writeSpecState(dir, {
      ...stored,
      phases: { ...stored.phases, tasks: "approved" },
      tasks: [
        { id: "1", title: "stale title — file wins", requirements: ["R1.1"], complexity: 1, status: "done" },
        { id: "99", title: "no longer in tasks.md", requirements: ["R1.1"], complexity: 1, status: "blocked" },
      ],
    });

    const loaded = await engine.load("widget");
    expect(loaded).not.toBeNull();
    expect(loaded?.tasks).toEqual([
      { id: "1", title: "Scaffold the module", requirements: ["R1.1"], complexity: 1, status: "done" },
      { id: "2", title: "Implement core logic", requirements: ["R1.2", "R2.1"], complexity: 3, status: "pending" },
      { id: "3", title: "Wire up integration", requirements: ["R2.2"], complexity: 2, status: "pending" },
    ]);
  });
});

describe("SpecEngine.list", () => {
  it("returns one SpecState per spec dir", async () => {
    const { engine } = await setup();
    await engine.create("alpha", "idea a");
    await engine.create("beta", "idea b");

    const specs = await engine.list();
    expect(specs.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("returns an empty list when no specs exist yet", async () => {
    const { engine } = await setup();
    expect(await engine.list()).toEqual([]);
  });

  it("R1.6: skips a corrupt spec.json, emits an error event naming it, and continues", async () => {
    const { cwd, engine, events } = await setup();
    await engine.create("good", "idea");
    await engine.create("bad", "idea");
    await fs.writeFile(specJsonPath(specDir(cwd, "bad")), "{ not json", "utf8");

    const specs = await engine.list();

    expect(specs.map((s) => s.name)).toEqual(["good"]);
    const errorEvents = events.filter((e): e is Extract<AgentEvent, { type: "error" }> => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.message).toContain("bad");
    expect(errorEvents[0]?.message).toContain(specJsonPath(specDir(cwd, "bad")));
  });
});

describe("SpecEngine.approve", () => {
  it("R3.1: draft -> approved appends approvals, persists, emits spec_event, and awaits onPhaseChange", async () => {
    const { cwd, engine, events, phaseChanges } = await setup();
    await engine.create("widget", "the idea");
    await makeDraft(cwd, "widget", "requirements", "# Requirements — widget\n- R1.1: ...\n");

    const result = await engine.approve("widget", "requirements");

    expect(result.phases.requirements).toBe("approved");
    expect(result.approvals).toEqual([{ phase: "requirements", at: FIXED_NOW }]);

    const stored = await readSpecState(specDir(cwd, "widget"));
    expect(stored.phases.requirements).toBe("approved");
    expect(stored.approvals).toEqual([{ phase: "requirements", at: FIXED_NOW }]);

    const approvedEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: "spec_event" }> => e.type === "spec_event" && e.status === "approved",
    );
    expect(approvedEvents).toHaveLength(1);
    expect(approvedEvents[0]).toMatchObject({ specName: "widget", phase: "requirements", status: "approved" });

    expect(phaseChanges).toHaveLength(1);
    expect(phaseChanges[0]).toMatchObject({
      event: "SpecPhaseChange",
      sessionId: "spec:widget",
      cwd,
      data: { specName: "widget", phase: "requirements", from: "draft", to: "approved" },
    });
  });

  it("R3.2: throws and changes nothing when the phase is still \"missing\"", async () => {
    const { cwd, engine, events, phaseChanges } = await setup();
    await engine.create("widget", "the idea");

    await expect(engine.approve("widget", "requirements")).rejects.toThrow(/"missing"/);

    const stored = await readSpecState(specDir(cwd, "widget"));
    expect(stored.phases.requirements).toBe("missing");
    expect(stored.approvals).toEqual([]);
    expect(events).toEqual([]);
    expect(phaseChanges).toEqual([]);
  });

  it('R3.2: throws and changes nothing when the phase is already "approved"', async () => {
    const { cwd, engine, events } = await setup();
    await engine.create("widget", "the idea");
    await makeDraft(cwd, "widget", "requirements", "# Requirements — widget\n...\n");
    await engine.approve("widget", "requirements");
    events.length = 0;

    await expect(engine.approve("widget", "requirements")).rejects.toThrow(/already.*"approved"/s);

    const stored = await readSpecState(specDir(cwd, "widget"));
    expect(stored.approvals).toHaveLength(1); // unchanged — still just the first approval
    expect(events).toEqual([]);
  });

  it("R3.3: approve(\"tasks\") re-parses tasks.md, picking up hand edits, and resets statuses to pending", async () => {
    const { cwd, engine } = await setup();
    await engine.create("widget", "the idea");
    await makeDraft(cwd, "widget", "tasks", VALID_TASKS_MD);
    // Simulate spec.json holding stale task data/statuses from a prior
    // generation — approve must prefer the re-parsed file, not this.
    const dir = specDir(cwd, "widget");
    const stale = await readSpecState(dir);
    await writeSpecState(dir, {
      ...stale,
      tasks: [{ id: "1", title: "STALE — should be replaced", requirements: ["R9.9"], complexity: 5, status: "done" }],
    });

    const result = await engine.approve("widget", "tasks");

    expect(result.phases.tasks).toBe("approved");
    expect(result.tasks).toEqual([
      { id: "1", title: "Scaffold the module", requirements: ["R1.1"], complexity: 1, status: "pending" },
      { id: "2", title: "Implement core logic", requirements: ["R1.2", "R2.1"], complexity: 3, status: "pending" },
      { id: "3", title: "Wire up integration", requirements: ["R2.2"], complexity: 2, status: "pending" },
    ]);
  });

  it("R3.3: a tasks.md that no longer parses fails actionably and leaves the phase draft", async () => {
    const { cwd, engine } = await setup();
    await engine.create("widget", "the idea");
    await makeDraft(cwd, "widget", "tasks", "- [ ] 1. No metadata at all\n");

    await expect(engine.approve("widget", "tasks")).rejects.toThrow(/missing "requirements:"/);

    const stored = await readSpecState(specDir(cwd, "widget"));
    expect(stored.phases.tasks).toBe("draft");
  });
});

describe("e2e: safe-divide happy path (create -> generate/approve x3 -> runTask x3)", () => {
  const DEMO_PROJECT_DIR = fileURLToPath(new URL("../../../examples/demo-project", import.meta.url));

  const REQUIREMENTS_MD = `# Requirements — safe-divide

Guard divide() so dividing by zero fails loudly instead of returning Infinity/NaN.

## Story 1: Safe division
As a developer, I want divide() to reject b=0, so that callers get an explicit
error instead of a silent Infinity/NaN.

Acceptance criteria:
- R1.1: WHEN divide(a, b) is called with b !== 0, THE SYSTEM SHALL return a / b.
- R1.2: IF divide(a, b) is called with b === 0, THEN THE SYSTEM SHALL throw a
  descriptive Error instead of returning Infinity or NaN.
`;

  const DESIGN_MD = `# Design — safe-divide

## Overview
Add a b === 0 guard at the top of divide() in src/math.js; throw a plain Error
with a clear message. Rejected alternative: returning NaN silently, which just
moves the bug downstream.

## Files
- src/math.js — add the b === 0 guard to divide() (R1.2).

## Interfaces
\`\`\`js
function divide(a, b) // throws Error when b === 0 — R1.2; else returns a / b — R1.1
\`\`\`

## Sequence
\`\`\`mermaid
sequenceDiagram
  participant C as caller
  participant D as divide()
  C->>D: divide(a, b)
  alt b === 0
    D-->>C: throw Error
  else
    D-->>C: a / b
  end
\`\`\`

## Risks
- Existing callers relying on Infinity/NaN break loudly instead of silently —
  that is the intended fix (R1.2).
`;

  const TASKS_MD = `# Tasks — safe-divide

- [ ] 1. Add the b=0 guard to divide()
  requirements: R1.2
  complexity: 2

- [ ] 2. Update existing callers/tests for the new throw behavior
  requirements: R1.1
  complexity: 2

- [ ] 3. Verify the guard end-to-end
  requirements: R1.1, R1.2
  complexity: 1
`;

  it("walks requirements -> design -> tasks -> 3 executed tasks, all approved and done", async () => {
    const script = [
      { finalText: `\`\`\`markdown\n${REQUIREMENTS_MD}\`\`\``, stopReason: "end_turn" as const }, // exercises R5.3 fence-strip
      { finalText: DESIGN_MD, stopReason: "end_turn" as const },
      { finalText: TASKS_MD, stopReason: "end_turn" as const },
      { finalText: "guarded b=0, added a test", stopReason: "end_turn" as const },
      { finalText: "updated callers", stopReason: "end_turn" as const },
      { finalText: "verified end-to-end", stopReason: "end_turn" as const },
    ];
    const taskCompletes: HookPayload[] = [];
    const { cwd, engine, events, phaseChanges, runner } = await setup({
      runner: fakeRunner(script),
      onTaskComplete: async (p) => {
        taskCompletes.push(p);
      },
    });
    await fs.cp(DEMO_PROJECT_DIR, cwd, { recursive: true });

    const created = await engine.create("safe-divide", "guard divide() against b=0"); // R1.1
    expect(created.phases).toEqual({ requirements: "missing", design: "missing", tasks: "missing" });

    await engine.generate("safe-divide", "requirements"); // R2.1: no precondition
    await engine.approve("safe-divide", "requirements"); // R3.1
    await engine.generate("safe-divide", "design");
    await engine.approve("safe-divide", "design");
    await engine.generate("safe-divide", "tasks");
    await engine.approve("safe-divide", "tasks");

    await engine.runTask("safe-divide"); // auto-selects 1
    await engine.runTask("safe-divide"); // auto-selects 2
    const final = await engine.runTask("safe-divide"); // auto-selects 3, R7.5

    // --- final state ---
    expect(final.phases).toEqual({ requirements: "approved", design: "approved", tasks: "approved" });
    expect(final.approvals.map((a) => a.phase)).toEqual(["requirements", "design", "tasks"]);
    expect(final.tasks.map((t) => t.status)).toEqual(["done", "done", "done"]);

    // --- file contents on disk ---
    const dir = specDir(cwd, "safe-divide");
    // Scripted as a fenced ```markdown block (exercises R5.3's fence-strip);
    // the closing fence's own newline is consumed as the fence delimiter,
    // so the written content is REQUIREMENTS_MD minus its own trailing \n.
    expect(await fs.readFile(requirementsPath(dir), "utf8")).toBe(REQUIREMENTS_MD.trimEnd());
    expect(await fs.readFile(designPath(dir), "utf8")).toBe(DESIGN_MD.trim());
    const tasksOnDisk = await fs.readFile(tasksPath(dir), "utf8");
    expect(tasksOnDisk.match(/- \[x\]/g)).toHaveLength(3); // R6.5 — all checkboxes flipped
    expect(tasksOnDisk.match(/- \[ \]/g)).toBeNull();
    expect(await fs.readFile(ideaPath(dir), "utf8")).toBe("guard divide() against b=0");

    // --- ordered spec_event sequence ---
    const specEventShapes = events
      .filter((e): e is Extract<AgentEvent, { type: "spec_event" }> => e.type === "spec_event")
      .map((e) => ({ phase: e.phase, status: e.status, taskId: e.taskId }));
    expect(specEventShapes).toEqual([
      { phase: "requirements", status: "draft", taskId: undefined },
      { phase: "requirements", status: "approved", taskId: undefined },
      { phase: "design", status: "draft", taskId: undefined },
      { phase: "design", status: "approved", taskId: undefined },
      { phase: "tasks", status: "draft", taskId: undefined },
      { phase: "tasks", status: "approved", taskId: undefined },
      { phase: "execution", status: "task:in_progress", taskId: "1" },
      { phase: "execution", status: "task:done", taskId: "1" },
      { phase: "execution", status: "task:in_progress", taskId: "2" },
      { phase: "execution", status: "task:done", taskId: "2" },
      { phase: "execution", status: "task:in_progress", taskId: "3" },
      { phase: "execution", status: "task:done", taskId: "3" },
    ]);
    expect(events.some((e) => e.type === "error")).toBe(false);

    // --- callback payloads ---
    expect(phaseChanges).toHaveLength(3); // one per approve(), R3.1
    expect(phaseChanges.map((p) => [p.data.phase, p.data.from, p.data.to])).toEqual([
      ["requirements", "draft", "approved"],
      ["design", "draft", "approved"],
      ["tasks", "draft", "approved"],
    ]);
    expect(taskCompletes).toHaveLength(3); // R7.5
    expect(taskCompletes.map((p) => p.data.taskId)).toEqual(["1", "2", "3"]);

    // --- ledger-relevant AgentTask fields ---
    expect(runner.calls.map((c) => c.kind)).toEqual([
      "spec-requirements",
      "spec-design",
      "spec-tasks",
      "spec-task-exec",
      "spec-task-exec",
      "spec-task-exec",
    ]);
    expect(runner.calls.every((c) => c.sessionId === "spec:safe-divide")).toBe(true);
    expect(runner.calls.every((c) => c.specName === "safe-divide")).toBe(true);
    expect(runner.calls[0]?.maxTurns).toBe(1); // requirements
    expect(runner.calls[1]?.maxTurns).toBeUndefined(); // design
    expect(runner.calls[2]?.maxTurns).toBe(1); // tasks
    expect(runner.calls.slice(3).map((c) => c.complexityHint)).toEqual([2, 2, 1]); // per TASKS_MD
    expect(runner.calls.slice(3).map((c) => c.taskId)).toEqual(["1", "2", "3"]);
  });
});
