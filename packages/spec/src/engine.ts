/**
 * createSpecEngine — orchestration, phase gating, event emission. Delegates
 * storage/transitions to state.ts and tasks.md grammar to parser.ts. All
 * model work goes through the injected AgentRunner (R8.2 — no network here).
 */
import type {
  AgentEvent,
  AgentRunner,
  HookPayload,
  SpecEngine,
  SpecPhase,
  SpecState,
} from "@cox/core";

export interface SpecEngineDeps {
  cwd: string;
  runner: AgentRunner;
  onEvent: (e: AgentEvent) => void;
  onPhaseChange?: (p: HookPayload) => Promise<void>;
  onTaskComplete?: (p: HookPayload) => Promise<void>;
  /** ISO 8601 clock, injected for deterministic tests. */
  now: () => string;
}

export function createSpecEngine(deps: SpecEngineDeps): SpecEngine {
  async function create(name: string, idea: string): Promise<SpecState> {
    throw new Error("not implemented");
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
