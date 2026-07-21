/**
 * spec.json + runs.json persistence, phase transition guards, and the
 * regeneration demotion cascade (R1, R2, R4, R8.3). Pure functions
 * (assertCanGenerate/assertCanApprove/applyDemotionCascade) take/return
 * SpecState with no I/O so tests can hit them directly.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpecPhase, SpecState } from "@cox/core";

export interface RunEntry {
  consecutiveFailures: number;
  lastStopReason: string;
  lastRunAt: string;
}

/** runs.json shape — engine-private, never part of SpecState (R7.6, R7.7). */
export interface RunsState {
  [taskId: string]: RunEntry;
}

// ---------------------------------------------------------------------------
// Paths (R8.2 — all resolved from an explicit cwd argument, never read from
// the running process's own working directory)
// ---------------------------------------------------------------------------

export function specsRoot(cwd: string): string {
  return path.join(cwd, ".cox", "specs");
}

export function specDir(cwd: string, name: string): string {
  return path.join(specsRoot(cwd), name);
}

export function specJsonPath(dir: string): string {
  return path.join(dir, "spec.json");
}

export function runsJsonPath(dir: string): string {
  return path.join(dir, "runs.json");
}

export function ideaPath(dir: string): string {
  return path.join(dir, "idea.md");
}

export function requirementsPath(dir: string): string {
  return path.join(dir, "requirements.md");
}

export function designPath(dir: string): string {
  return path.join(dir, "design.md");
}

export function tasksPath(dir: string): string {
  return path.join(dir, "tasks.md");
}

export function tasksRejectedPath(dir: string): string {
  return path.join(dir, "tasks.rejected.md");
}

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

export function createInitialState(name: string, createdAt: string): SpecState {
  return {
    name,
    createdAt,
    phases: { requirements: "missing", design: "missing", tasks: "missing" },
    tasks: [],
    approvals: [],
  };
}

// ---------------------------------------------------------------------------
// Persistence (R1.1, R8.3) — write-temp-then-rename so a crash never
// truncates spec.json; corrupt spec.json throws naming the path and is
// never overwritten.
// ---------------------------------------------------------------------------

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

export async function readSpecState(dir: string): Promise<SpecState> {
  const p = specJsonPath(dir);
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (err) {
    throw new Error(`readSpecState: cannot read ${p} — ${errMsg(err)}`);
  }
  try {
    return JSON.parse(raw) as SpecState;
  } catch (err) {
    throw new Error(`readSpecState: ${p} is corrupt (invalid JSON) — ${errMsg(err)}`);
  }
}

export async function writeSpecState(dir: string, state: SpecState): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(specJsonPath(dir), `${JSON.stringify(state, null, 2)}\n`);
}

export async function readRuns(dir: string): Promise<RunsState> {
  let raw: string;
  try {
    raw = await fs.readFile(runsJsonPath(dir), "utf8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(raw) as RunsState;
  } catch {
    // runs.json is disposable telemetry (NOTES.md) — corruption resets, never throws.
    return {};
  }
}

export async function writeRuns(dir: string, runs: RunsState): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(runsJsonPath(dir), `${JSON.stringify(runs, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Transition guards + demotion cascade (R2, R4) — pure, no I/O.
// ---------------------------------------------------------------------------

/** Phases generate()/approve() actually operate on. "execution" and any
 * other string are never valid arguments to either (R2.4). */
type GeneratablePhase = Exclude<SpecPhase, "execution">;

function isGeneratablePhase(phase: SpecPhase): phase is GeneratablePhase {
  return phase === "requirements" || phase === "design" || phase === "tasks";
}

function assertKnownPhase(s: SpecState, op: string, phase: SpecPhase): asserts phase is GeneratablePhase {
  if (!isGeneratablePhase(phase)) {
    throw new Error(
      `${op}: phase "${phase}" of spec "${s.name}" is invalid — only requirements, design, tasks are ` +
        `valid here (execution is driven by runTask, never by generate/approve)`,
    );
  }
}

/** R2.1–R2.4. requirements has no precondition; design requires requirements
 * approved; tasks requires design approved; execution/unknown always throws. */
export function assertCanGenerate(s: SpecState, phase: SpecPhase): void {
  assertKnownPhase(s, "generate", phase);
  if (phase === "design" && s.phases.requirements !== "approved") {
    throw new Error(
      `generate: cannot generate "design" for spec "${s.name}" — phase "requirements" is ` +
        `"${s.phases.requirements}", must be "approved" first`,
    );
  }
  if (phase === "tasks" && s.phases.design !== "approved") {
    throw new Error(
      `generate: cannot generate "tasks" for spec "${s.name}" — phase "design" is ` +
        `"${s.phases.design}", must be "approved" first`,
    );
  }
}

/** R3.2 (missing/approved throw) lives here too since it's the same shape of
 * guard as R2's; R2.4 (execution/unknown throws) applies uniformly. */
export function assertCanApprove(s: SpecState, phase: SpecPhase): void {
  assertKnownPhase(s, "approve", phase);
  const status = s.phases[phase];
  if (status === "missing") {
    throw new Error(`approve: phase "${phase}" of spec "${s.name}" is "missing" — generate it first`);
  }
  if (status === "approved") {
    throw new Error(`approve: phase "${phase}" of spec "${s.name}" is already "approved"`);
  }
}

const DOWNSTREAM: Record<GeneratablePhase, GeneratablePhase[]> = {
  requirements: ["design", "tasks"],
  design: ["tasks"],
  tasks: [],
};

/**
 * R4.1 + R4.2. Unconditionally sets `regenerated` itself to "draft" (R4.1 —
 * true whether it was "missing", "draft" already, or "approved"; R5.3 relies
 * on this for the non-demotion case too) and demotes every downstream phase
 * that is currently "approved" (R4.2), leaving "draft"/"missing" downstream
 * phases untouched. `demoted` lists only the downstream phases that actually
 * flipped — the regenerated phase's own transition is reported by the
 * caller's "draft" spec_event (R5.3), not a "demoted" one (R4.3).
 */
export function applyDemotionCascade(
  s: SpecState,
  regenerated: SpecPhase,
): { state: SpecState; demoted: SpecPhase[] } {
  assertKnownPhase(s, "generate", regenerated);
  const phases = { ...s.phases, [regenerated]: "draft" as const };
  const demoted: SpecPhase[] = [];
  for (const downstream of DOWNSTREAM[regenerated]) {
    if (phases[downstream] === "approved") {
      phases[downstream] = "draft";
      demoted.push(downstream);
    }
  }
  return { state: { ...s, phases }, demoted };
}
