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
// Paths (R8.2 — all resolved from an explicit cwd, never process.cwd())
// ---------------------------------------------------------------------------

export function specDir(cwd: string, name: string): string {
  return path.join(cwd, ".cox", "specs", name);
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

export function assertCanGenerate(s: SpecState, phase: SpecPhase): void {
  throw new Error("not implemented");
}

export function assertCanApprove(s: SpecState, phase: SpecPhase): void {
  throw new Error("not implemented");
}

/** R4.2 — downstream cascade only; demoting `regenerated` itself (R4.1) is
 * the caller's job as part of the unconditional "set phase to draft" write. */
export function applyDemotionCascade(
  s: SpecState,
  regenerated: SpecPhase,
): { state: SpecState; demoted: SpecPhase[] } {
  throw new Error("not implemented");
}
