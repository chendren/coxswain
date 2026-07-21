import * as fs from "node:fs/promises";
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
  return { cwd, events, phaseChanges, runner, engine: createSpecEngine(deps) };
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
