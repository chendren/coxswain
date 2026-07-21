/**
 * cox spec new|approve|design|tasks|run|status (docs/00) and /spec (R8.5).
 * Thin dispatch over SpecEngine; both main.ts's CLI commands and
 * session.ts's slash-command handler share this.
 */
import type { SpecEngine, SpecPhase, SpecState } from "@cox/core";

export interface SpecCliDeps {
  specs: SpecEngine;
  write: (line: string) => void;
}

const PHASE_ORDER: Exclude<SpecPhase, "execution">[] = ["requirements", "design", "tasks"];

function formatSpecStatus(state: SpecState): string {
  const done = state.tasks.filter((t) => t.status === "done").length;
  const phaseStr = PHASE_ORDER.map((p) => `${p}=${state.phases[p]}`).join(" ");
  return `${state.name}: ${phaseStr} · tasks ${done}/${state.tasks.length}`;
}

export async function runSpecNew(deps: SpecCliDeps, name: string, idea: string): Promise<void> {
  const state = await deps.specs.create(name, idea);
  deps.write(`created spec "${state.name}" — next: cox spec approve ${state.name} (after reviewing requirements.md)`);
}

export async function runSpecApprove(deps: SpecCliDeps, name: string, phase?: string): Promise<void> {
  let target = phase as SpecPhase | undefined;
  if (!target) {
    const state = await deps.specs.load(name);
    target = state ? PHASE_ORDER.find((p) => state.phases[p] !== "approved") : PHASE_ORDER[0];
  }
  if (!target) {
    deps.write(`spec "${name}": all phases already approved`);
    return;
  }
  await deps.specs.approve(name, target);
  deps.write(`approved ${target} for spec "${name}"`);
}

export async function runSpecGenerate(
  deps: SpecCliDeps,
  name: string,
  phase: "design" | "tasks",
): Promise<void> {
  await deps.specs.generate(name, phase);
  deps.write(`generated ${phase} for spec "${name}"`);
}

export async function runSpecRunTask(deps: SpecCliDeps, name: string, taskId?: string): Promise<void> {
  const state = await deps.specs.runTask(name, taskId);
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : state.tasks.find((t) => t.status !== "pending");
  deps.write(`spec "${name}" task ${task?.id ?? taskId ?? "?"}: ${task?.status ?? "unknown"}`);
}

export async function runSpecStatus(deps: SpecCliDeps, name?: string): Promise<void> {
  if (name) {
    const state = await deps.specs.load(name);
    deps.write(state ? formatSpecStatus(state) : `spec "${name}" not found`);
    return;
  }
  const specs = await deps.specs.list();
  if (specs.length === 0) {
    deps.write('no specs yet — try: cox spec new <name> "idea"');
    return;
  }
  for (const state of specs) deps.write(formatSpecStatus(state));
}
