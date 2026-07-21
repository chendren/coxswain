import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent, SpecTask } from "@cox/core";
import { createSpecEngine, type SpecEngineDeps } from "../src/engine.js";
import { parseTasks } from "../src/parser.js";
import { designPath, readSpecState, requirementsPath, specDir, tasksPath, writeSpecState } from "../src/state.js";
import { fakeRunner, tmpProject, type ScriptedRun } from "./helpers.js";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";
const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url));

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
  const runner = fakeRunner(script);
  const deps: SpecEngineDeps = {
    cwd,
    runner,
    onEvent: (e) => events.push(e),
    now: () => FIXED_NOW,
  };
  return { cwd, events, runner, engine: createSpecEngine(deps) };
}

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listTsFiles(full)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Line-by-line diff, returning the indices where `before` and `after`
 * differ (after must have the same number of lines as before). */
function diffLines(before: string[], after: string[]): number[] {
  expect(after).toHaveLength(before.length);
  const changed: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changed.push(i);
    }
  }
  return changed;
}

describe("R8.1: hand edits survive status updates byte-for-byte outside the touched line", () => {
  const HAND_EDITED_TASKS_MD = `# Tasks — widget

Some human-inserted prose explaining the plan up front.

- [ ] 1. REWORDED: give the module a proper scaffold
  requirements: R1.1
  complexity: 1

More human commentary sitting between two tasks, explaining a tradeoff.

- [ ] 2. Implement core logic
  requirements: R1.2, R2.1
  complexity: 3

- [ ] 3. Wire up integration
  requirements: R2.2
  complexity: 2

Trailing human notes at the end of the file.
`;

  async function specWithHandEditedTasks(cwd: string, engine: ReturnType<typeof createSpecEngine>, name: string) {
    await engine.create(name, "the idea");
    const dir = specDir(cwd, name);
    await fs.writeFile(requirementsPath(dir), "# Requirements — x\n- R1.1: ...\n- R1.2: ...\n- R2.1: ...\n- R2.2: ...\n", "utf8");
    await fs.writeFile(designPath(dir), "# Design — x\n...\n", "utf8");
    await fs.writeFile(tasksPath(dir), HAND_EDITED_TASKS_MD, "utf8");

    const { tasks, errors } = parseTasks(HAND_EDITED_TASKS_MD);
    expect(errors).toEqual([]);
    const pending: SpecTask[] = tasks.map((t) => ({ ...t, status: "pending" as const }));

    const stored = await readSpecState(dir);
    await writeSpecState(dir, {
      ...stored,
      phases: { requirements: "approved", design: "approved", tasks: "approved" },
      approvals: [
        { phase: "requirements", at: FIXED_NOW },
        { phase: "design", at: FIXED_NOW },
        { phase: "tasks", at: FIXED_NOW },
      ],
      tasks: pending,
    });
  }

  it("R8.1: completing a task only flips its checkbox — reworded title and inserted prose are untouched", async () => {
    const { cwd, engine } = await setup([{ finalText: "done", stopReason: "end_turn" }]);
    await specWithHandEditedTasks(cwd, engine, "widget");
    const dir = specDir(cwd, "widget");

    await engine.runTask("widget", "1");

    const after = await fs.readFile(tasksPath(dir), "utf8");
    const before = HAND_EDITED_TASKS_MD;
    const changed = diffLines(before.split("\n"), after.split("\n"));

    expect(changed).toHaveLength(1);
    const [line] = changed;
    if (line === undefined) throw new Error("unreachable — length checked above");
    expect(before.split("\n")[line]).toBe("- [ ] 1. REWORDED: give the module a proper scaffold");
    expect(after.split("\n")[line]).toBe("- [x] 1. REWORDED: give the module a proper scaffold");
  });

  it("R8.1: a failed run leaves tasks.md completely untouched (no checkbox flip on failure)", async () => {
    const { cwd, engine } = await setup([{ finalText: "", stopReason: "max_tokens" }]);
    await specWithHandEditedTasks(cwd, engine, "widget");
    const dir = specDir(cwd, "widget");

    await engine.runTask("widget", "1");

    expect(await fs.readFile(tasksPath(dir), "utf8")).toBe(HAND_EDITED_TASKS_MD);
  });

  it("R8.1: approve(\"tasks\") never rewrites tasks.md at all — only spec.json's statuses change", async () => {
    const { cwd, engine } = await setup();
    await engine.create("widget", "the idea");
    const dir = specDir(cwd, "widget");
    await fs.writeFile(tasksPath(dir), HAND_EDITED_TASKS_MD, "utf8");
    const stored = await readSpecState(dir);
    await writeSpecState(dir, { ...stored, phases: { ...stored.phases, tasks: "draft" } });

    await engine.approve("widget", "tasks");

    expect(await fs.readFile(tasksPath(dir), "utf8")).toBe(HAND_EDITED_TASKS_MD);
  });
});

describe("R8.2: cwd handling and no network access in src/", () => {
  it("R8.2: no source file in src/ calls process.cwd() — cwd always comes from injected deps.cwd", async () => {
    const files = await listTsFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      expect(content, `${path.basename(file)} must not call process.cwd()`).not.toMatch(/process\.cwd\(/);
    }
  });

  it("R8.2: no source file in src/ performs network access (fetch(...) or an http(s) import)", async () => {
    const files = await listTsFiles(SRC_DIR);
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      expect(content, `${path.basename(file)} must not call fetch(`).not.toMatch(/\bfetch\(/);
      expect(content, `${path.basename(file)} must not import http/https`).not.toMatch(
        /(?:from\s+["']|require\(["'])(?:node:)?https?["']/,
      );
    }
  });

  it("R8.2: engine.ts takes cwd from the injected deps and threads it into every path resolution", async () => {
    const engineSrc = await fs.readFile(path.join(SRC_DIR, "engine.ts"), "utf8");
    expect(engineSrc).toMatch(/const\s*\{\s*cwd\b/); // cwd is destructured from deps, not read globally
    expect(engineSrc).toMatch(/specDir\(cwd,/); // and it's what every spec dir is resolved from
  });
});
