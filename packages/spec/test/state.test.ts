import * as fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { SpecState } from "@cox/core";
import {
  applyDemotionCascade,
  assertCanApprove,
  assertCanGenerate,
  createInitialState,
  readRuns,
  readSpecState,
  runsJsonPath,
  specDir,
  specJsonPath,
  writeRuns,
  writeSpecState,
} from "../src/state.js";
import { tmpProject } from "./helpers.js";

describe("state persistence", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  async function project() {
    const p = await tmpProject();
    cleanups.push(p.cleanup);
    return p;
  }

  it("R1.1: writeSpecState/readSpecState round-trips a SpecState", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    const state = createInitialState("widget", "2026-01-01T00:00:00.000Z");

    await writeSpecState(dir, state);
    const loaded = await readSpecState(dir);

    expect(loaded).toEqual(state);
  });

  it("R1.1: writeSpecState leaves no .tmp file behind (temp-then-rename)", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await writeSpecState(dir, createInitialState("widget", "2026-01-01T00:00:00.000Z"));

    await expect(fs.access(`${specJsonPath(dir)}.tmp`)).rejects.toThrow();
    await expect(fs.access(specJsonPath(dir))).resolves.toBeUndefined();
  });

  it("R8.3: readSpecState throws naming the file path when spec.json is corrupt", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(specJsonPath(dir), "{ not json", "utf8");

    await expect(readSpecState(dir)).rejects.toThrow(specJsonPath(dir));
  });

  it("R8.3: a corrupt spec.json is never overwritten by a failed read", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(specJsonPath(dir), "{ not json", "utf8");

    await expect(readSpecState(dir)).rejects.toThrow();

    const stillRaw = await fs.readFile(specJsonPath(dir), "utf8");
    expect(stillRaw).toBe("{ not json");
  });

  it("R8.3: readSpecState throws naming the path when spec.json is missing", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "ghost");

    await expect(readSpecState(dir)).rejects.toThrow(specJsonPath(dir));
  });

  it("runs.json: readRuns returns {} when the file does not exist", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");

    expect(await readRuns(dir)).toEqual({});
  });

  it("runs.json: write/read round-trips consecutive-failure counters", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    const runs = { "2.1": { consecutiveFailures: 1, lastStopReason: "max_tokens", lastRunAt: "2026-01-01T00:00:00.000Z" } };

    await writeRuns(dir, runs);

    expect(await readRuns(dir)).toEqual(runs);
    await expect(fs.access(`${runsJsonPath(dir)}.tmp`)).rejects.toThrow();
  });

  it("runs.json: a corrupt file resets to {} (disposable telemetry, not spec state)", async () => {
    const { cwd } = await project();
    const dir = specDir(cwd, "widget");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(runsJsonPath(dir), "not json at all", "utf8");

    expect(await readRuns(dir)).toEqual({});
  });
});

function stateWith(phases: Partial<SpecState["phases"]>): SpecState {
  return {
    ...createInitialState("widget", "2026-01-01T00:00:00.000Z"),
    phases: { requirements: "missing", design: "missing", tasks: "missing", ...phases },
  };
}

describe("assertCanGenerate", () => {
  it("R2.1: requirements has no precondition on other phases", () => {
    expect(() => assertCanGenerate(stateWith({}), "requirements")).not.toThrow();
    expect(() =>
      assertCanGenerate(stateWith({ requirements: "approved", design: "approved" }), "requirements"),
    ).not.toThrow();
  });

  it("R2.2: design throws naming the blocking phase when requirements is not approved", () => {
    expect(() => assertCanGenerate(stateWith({ requirements: "missing" }), "design")).toThrow(
      /"requirements".*"missing"/s,
    );
    expect(() => assertCanGenerate(stateWith({ requirements: "draft" }), "design")).toThrow(
      /"requirements".*"draft"/s,
    );
  });

  it("R2.2: design proceeds once requirements is approved", () => {
    expect(() => assertCanGenerate(stateWith({ requirements: "approved" }), "design")).not.toThrow();
  });

  it("R2.3: tasks throws naming the blocking phase when design is not approved", () => {
    expect(() =>
      assertCanGenerate(stateWith({ requirements: "approved", design: "draft" }), "tasks"),
    ).toThrow(/"design".*"draft"/s);
  });

  it("R2.3: tasks proceeds once design is approved", () => {
    expect(() =>
      assertCanGenerate(stateWith({ requirements: "approved", design: "approved" }), "tasks"),
    ).not.toThrow();
  });

  it('R2.4: throws for phase "execution"', () => {
    expect(() => assertCanGenerate(stateWith({}), "execution")).toThrow(/execution/);
  });

  it("R2.4: throws for an unknown phase string", () => {
    expect(() => assertCanGenerate(stateWith({}), "bogus" as never)).toThrow(/bogus/);
  });
});

describe("assertCanApprove", () => {
  it('R3.2: throws when the phase is "missing"', () => {
    expect(() => assertCanApprove(stateWith({ requirements: "missing" }), "requirements")).toThrow(
      /"requirements".*"missing"/s,
    );
  });

  it('R3.2: throws when the phase is already "approved"', () => {
    expect(() => assertCanApprove(stateWith({ requirements: "approved" }), "requirements")).toThrow(
      /"requirements".*already.*"approved"/s,
    );
  });

  it('R3.1: proceeds when the phase is "draft"', () => {
    expect(() => assertCanApprove(stateWith({ requirements: "draft" }), "requirements")).not.toThrow();
  });

  it('R2.4: throws for phase "execution"', () => {
    expect(() => assertCanApprove(stateWith({}), "execution")).toThrow(/execution/);
  });
});

describe("applyDemotionCascade", () => {
  it("R4.1: demotes the regenerated phase itself from approved to draft", () => {
    const { state } = applyDemotionCascade(stateWith({ requirements: "approved" }), "requirements");
    expect(state.phases.requirements).toBe("draft");
  });

  it("R4.1: a phase generated for the first time (missing) also lands on draft", () => {
    const { state, demoted } = applyDemotionCascade(stateWith({ requirements: "missing" }), "requirements");
    expect(state.phases.requirements).toBe("draft");
    expect(demoted).toEqual([]);
  });

  it("R4.2: demotes approved downstream phases (requirements -> design, tasks)", () => {
    const s = stateWith({ requirements: "approved", design: "approved", tasks: "approved" });
    const { state, demoted } = applyDemotionCascade(s, "requirements");

    expect(state.phases).toEqual({ requirements: "draft", design: "draft", tasks: "draft" });
    expect(demoted.sort()).toEqual(["design", "tasks"]);
  });

  it("R4.2: demotes only tasks when design is regenerated (requirements untouched)", () => {
    const s = stateWith({ requirements: "approved", design: "approved", tasks: "approved" });
    const { state, demoted } = applyDemotionCascade(s, "design");

    expect(state.phases.requirements).toBe("approved");
    expect(state.phases.design).toBe("draft");
    expect(state.phases.tasks).toBe("draft");
    expect(demoted).toEqual(["tasks"]);
  });

  it('R4.2: leaves "draft"/"missing" downstream phases unchanged (only "approved" is demoted)', () => {
    const s = stateWith({ requirements: "approved", design: "draft", tasks: "missing" });
    const { state, demoted } = applyDemotionCascade(s, "requirements");

    expect(state.phases.design).toBe("draft");
    expect(state.phases.tasks).toBe("missing");
    expect(demoted).toEqual([]);
  });

  it("R4.2: tasks has no downstream, so regenerating it never demotes anything else", () => {
    const s = stateWith({ requirements: "approved", design: "approved", tasks: "approved" });
    const { state, demoted } = applyDemotionCascade(s, "tasks");

    expect(state.phases.requirements).toBe("approved");
    expect(state.phases.design).toBe("approved");
    expect(demoted).toEqual([]);
  });
});
