/**
 * createSpecEngine — orchestration, phase gating, event emission. Delegates
 * storage/transitions to state.ts and tasks.md grammar to parser.ts. All
 * model work goes through the injected AgentRunner (R8.2 — no network here).
 */
import * as fs from "node:fs/promises";
import type {
  AgentEvent,
  AgentRunner,
  HookPayload,
  SpecEngine,
  SpecPhase,
  SpecState,
} from "@cox/core";
import { createInitialState, ideaPath, specDir, specJsonPath, writeSpecState } from "./state.js";

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

export function createSpecEngine(deps: SpecEngineDeps): SpecEngine {
  const { cwd, now } = deps;

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
    throw new Error("not implemented");
  }

  async function list(): Promise<SpecState[]> {
    throw new Error("not implemented");
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
