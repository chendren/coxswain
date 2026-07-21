import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "@cox/core";
import { createSpecEngine, type SpecEngineDeps } from "../src/engine.js";
import { ideaPath, specDir, specJsonPath } from "../src/state.js";
import { fakeRunner, tmpProject } from "./helpers.js";

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
  const runner = fakeRunner([]);
  const deps: SpecEngineDeps = {
    cwd,
    runner,
    onEvent: (e) => events.push(e),
    now: () => FIXED_NOW,
    ...overrides,
  };
  return { cwd, events, runner, engine: createSpecEngine(deps) };
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
