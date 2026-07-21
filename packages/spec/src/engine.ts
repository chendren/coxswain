/**
 * createSpecEngine — orchestration, phase gating, event emission. Delegates
 * storage/transitions to state.ts and tasks.md grammar to parser.ts. All
 * model work goes through the injected AgentRunner (R8.2 — no network here).
 */
import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import type {
  AgentEvent,
  AgentRunner,
  HookPayload,
  SpecEngine,
  SpecPhase,
  SpecState,
  SpecTask,
} from "@cox/core";
import { parseTasks } from "./parser.js";
import {
  createInitialState,
  ideaPath,
  readSpecState,
  specDir,
  specJsonPath,
  specsRoot,
  tasksPath,
  writeSpecState,
} from "./state.js";

export interface SpecEngineDeps {
  cwd: string;
  runner: AgentRunner;
  onEvent: (e: AgentEvent) => void;
  onPhaseChange?: (p: HookPayload) => Promise<void>;
  onTaskComplete?: (p: HookPayload) => Promise<void>;
  /** ISO 8601 clock, injected for deterministic tests. */
  now: () => string;
}

/** R1.1 — spec dir names: lowercase alnum, hyphens, must start alnum. This
 * charset can never contain "/" or "\", so it also covers R1.2's path-
 * separator clause. */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readFileOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

/** R1.4 merge rule: task SET (id/title/requirements/complexity) comes from
 * tasks.md; task STATUS comes from spec.json by id, unknown ids -> pending. */
function mergeTasks(fromFile: SpecTask[], fromState: SpecTask[]): SpecTask[] {
  const statusById = new Map(fromState.map((t) => [t.id, t.status]));
  return fromFile.map((t) => ({ ...t, status: statusById.get(t.id) ?? "pending" }));
}

export function createSpecEngine(deps: SpecEngineDeps): SpecEngine {
  const { cwd, onEvent, now } = deps;

  async function create(name: string, idea: string): Promise<SpecState> {
    // R1.2: validate before any filesystem access.
    if (!NAME_RE.test(name)) {
      throw new Error(
        `create: invalid spec name "${name}" — must match ${NAME_RE.source} (no path separators, spaces, or uppercase)`,
      );
    }
    const dir = specDir(cwd, name);
    // R1.3: existing spec dir throws and is left untouched.
    if (await pathExists(specJsonPath(dir))) {
      throw new Error(`create: spec "${name}" already exists at ${dir}`);
    }
    const state = createInitialState(name, now());
    await fs.mkdir(dir, { recursive: true });
    await writeSpecState(dir, state);
    await fs.writeFile(ideaPath(dir), idea, "utf8");
    return state;
  }

  async function load(name: string): Promise<SpecState | null> {
    const dir = specDir(cwd, name);
    // R1.5: no spec.json at all -> null, not a throw.
    if (!(await pathExists(specJsonPath(dir)))) {
      return null;
    }
    // Past this point spec.json is expected to exist; a read/parse failure
    // is corruption (R8.3), not absence, so readSpecState's throw stands.
    const stored = await readSpecState(dir);
    const md = await readFileOrEmpty(tasksPath(dir));
    const { tasks } = parseTasks(md); // tolerant: R6.3 errors ignored here
    return { ...stored, tasks: mergeTasks(tasks, stored.tasks) };
  }

  async function list(): Promise<SpecState[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(specsRoot(cwd), { withFileTypes: true });
    } catch {
      return [];
    }

    const out: SpecState[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const dir = specDir(cwd, name);
      try {
        const stored = await readSpecState(dir);
        const md = await readFileOrEmpty(tasksPath(dir));
        const { tasks } = parseTasks(md);
        out.push({ ...stored, tasks: mergeTasks(tasks, stored.tasks) });
      } catch (err) {
        // R1.6: skip unreadable/corrupt spec.json, name it, keep going.
        const message = err instanceof Error ? err.message : String(err);
        onEvent({ type: "error", message: `list: skipping spec "${name}" — ${message}` });
      }
    }
    return out;
  }

  async function generate(name: string, phase: SpecPhase): Promise<SpecState> {
    throw new Error("not implemented");
  }

  async function approve(name: string, phase: SpecPhase): Promise<SpecState> {
    throw new Error("not implemented");
  }

  async function runTask(name: string, taskId?: string): Promise<SpecState> {
    throw new Error("not implemented");
  }

  return { create, load, list, generate, approve, runTask };
}
