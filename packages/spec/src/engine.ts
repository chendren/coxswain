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
  AgentTask,
  HookPayload,
  SpecEngine,
  SpecPhase,
  SpecState,
  SpecTask,
} from "@cox/core";
import { extractRequirementExcerpts, flipCheckbox, parseTasks, renderTasks } from "./parser.js";
import { designPrompt, execPrompt, requirementsPrompt, SPEC_SYSTEM, tasksPrompt } from "./prompts.js";
import {
  applyDemotionCascade,
  assertCanApprove,
  assertCanGenerate,
  createInitialState,
  designPath,
  ideaPath,
  readRuns,
  readSpecState,
  requirementsPath,
  specDir,
  specJsonPath,
  specsRoot,
  tasksPath,
  tasksRejectedPath,
  writeRuns,
  writeSpecState,
  type RunEntry,
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

function setTaskStatus(state: SpecState, taskId: string, status: SpecTask["status"]): SpecState {
  return { ...state, tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) };
}

/** R5.3 — strip a single wrapping ```markdown / ``` fence around the whole
 * document, if the model added one despite SPEC_SYSTEM asking it not to. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:markdown)?\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return match ? (match[1] ?? "") : trimmed;
}

export function createSpecEngine(deps: SpecEngineDeps): SpecEngine {
  const { cwd, runner, onEvent, onPhaseChange, onTaskComplete, now } = deps;

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

  async function mustLoad(name: string, op: string): Promise<SpecState> {
    const state = await load(name);
    if (!state) {
      throw new Error(`${op}: spec "${name}" not found — call create() first`);
    }
    return state;
  }

  async function generate(name: string, phase: SpecPhase): Promise<SpecState> {
    const state = await mustLoad(name, "generate");
    assertCanGenerate(state, phase); // R2.1–R2.4: throws + changes nothing when gated
    const dir = specDir(cwd, name);
    const idea = await readFileOrEmpty(ideaPath(dir));

    let kind: AgentTask["kind"];
    let prompt: string;
    let maxTurns: number | undefined;

    if (phase === "requirements") {
      kind = "spec-requirements";
      prompt = requirementsPrompt(name, idea);
      maxTurns = 1; // R5.2
    } else if (phase === "design") {
      kind = "spec-design";
      const reqMd = await readFileOrEmpty(requirementsPath(dir));
      prompt = designPrompt(name, idea, reqMd);
      maxTurns = undefined; // R5.2 — design may explore the repo with tools
    } else {
      // phase === "tasks"; assertCanGenerate already rejected "execution"/unknown.
      kind = "spec-tasks";
      const reqMd = await readFileOrEmpty(requirementsPath(dir));
      const designMd = await readFileOrEmpty(designPath(dir));
      prompt = tasksPrompt(name, reqMd, designMd);
      maxTurns = 1; // R5.2
    }

    const task: AgentTask = {
      kind,
      prompt,
      system: SPEC_SYSTEM,
      history: [],
      cwd,
      sessionId: `spec:${name}`, // R5.1
      specName: name,
      maxTurns,
    };

    const result = await runner.run(task, onEvent);

    if (result.stopReason !== "end_turn" || result.finalText.trim() === "") {
      // R5.4: write nothing, leave all statuses unchanged.
      onEvent({
        type: "error",
        message:
          `generate: spec "${name}" phase "${phase}" — model did not complete ` +
          `(stopReason "${result.stopReason}")`,
      });
      return state;
    }

    const content = stripFence(result.finalText);

    if (phase === "tasks") {
      return finishTasksGeneration(name, dir, state, content);
    }

    const filePath = phase === "requirements" ? requirementsPath(dir) : designPath(dir);
    await fs.writeFile(filePath, content, "utf8");

    // R4.1/R4.2: sets `phase` itself to "draft" and demotes approved
    // downstream phases.
    const cascade = applyDemotionCascade(state, phase);
    await writeSpecState(dir, cascade.state);

    onEvent({ type: "spec_event", specName: name, phase, status: "draft" }); // R5.3
    await emitDemotions(name, dir, cascade.demoted);

    return cascade.state;
  }

  /** R4.3 — one spec_event + one awaited onPhaseChange per phase demoted by
   * a regeneration's cascade. Shared by generate()'s requirements/design
   * path and finishTasksGeneration. */
  async function emitDemotions(name: string, dir: string, demoted: SpecPhase[]): Promise<void> {
    for (const demotedPhase of demoted) {
      onEvent({ type: "spec_event", specName: name, phase: demotedPhase, status: "demoted" });
      if (onPhaseChange) {
        await onPhaseChange({
          event: "SpecPhaseChange",
          sessionId: `spec:${name}`,
          cwd,
          data: { specName: name, phase: demotedPhase, from: "approved", to: "draft" },
        });
      }
    }
  }

  /** R5.5 (validate before writing; reject to tasks.rejected.md) + R4.4
   * (fresh task list always resets every status to pending; "tasks-reset"
   * event when a previously-"done" task's progress is being discarded). */
  async function finishTasksGeneration(
    name: string,
    dir: string,
    state: SpecState,
    content: string,
  ): Promise<SpecState> {
    const { tasks, errors } = parseTasks(content);
    if (errors.length > 0) {
      await fs.writeFile(tasksRejectedPath(dir), content, "utf8");
      onEvent({
        type: "error",
        message: `generate: spec "${name}" phase "tasks" — rejected: ${errors[0]}`,
      });
      return state; // tasks.md and all statuses unchanged (R5.5)
    }

    const hadDone = state.tasks.some((t) => t.status === "done");
    const freshTasks: SpecTask[] = tasks.map((t) => ({ ...t, status: "pending" as const }));
    await fs.writeFile(tasksPath(dir), renderTasks(name, freshTasks), "utf8");

    const cascade = applyDemotionCascade(state, "tasks"); // tasks has no downstream (R4.2)
    const newState: SpecState = { ...cascade.state, tasks: freshTasks };
    await writeSpecState(dir, newState);

    onEvent({ type: "spec_event", specName: name, phase: "tasks", status: "draft" }); // R5.3
    if (hadDone) {
      onEvent({ type: "spec_event", specName: name, phase: "tasks", status: "tasks-reset" }); // R4.4
    }
    await emitDemotions(name, dir, cascade.demoted);

    return newState;
  }

  async function approve(name: string, phase: SpecPhase): Promise<SpecState> {
    const state = await mustLoad(name, "approve");
    assertCanApprove(state, phase); // R3.2 (missing/approved throw) + R2.4-style execution/unknown guard
    const dir = specDir(cwd, name);

    if (phase === "tasks") {
      // R3.3: re-parse tasks.md first so hand-edits to the draft are picked
      // up; fail actionably and leave the phase "draft" (nothing persisted
      // yet) when it no longer parses.
      const raw = await readFileOrEmpty(tasksPath(dir));
      const { tasks, errors } = parseTasks(raw);
      if (errors.length > 0) {
        throw new Error(
          `approve: spec "${name}" phase "tasks" — tasks.md no longer parses: ${errors[0]}`,
        );
      }
      const freshTasks: SpecTask[] = tasks.map((t) => ({ ...t, status: "pending" as const }));
      const newState: SpecState = {
        ...state,
        tasks: freshTasks,
        phases: { ...state.phases, tasks: "approved" },
        approvals: [...state.approvals, { phase: "tasks", at: now() }],
      };
      await writeSpecState(dir, newState);
      onEvent({ type: "spec_event", specName: name, phase: "tasks", status: "approved" });
      if (onPhaseChange) {
        await onPhaseChange({
          event: "SpecPhaseChange",
          sessionId: `spec:${name}`,
          cwd,
          data: { specName: name, phase: "tasks", from: "draft", to: "approved" },
        });
      }
      return newState;
    }

    const newState: SpecState = {
      ...state,
      phases: { ...state.phases, [phase]: "approved" },
      approvals: [...state.approvals, { phase, at: now() }],
    };
    await writeSpecState(dir, newState);
    onEvent({ type: "spec_event", specName: name, phase, status: "approved" }); // R3.1
    if (onPhaseChange) {
      await onPhaseChange({
        event: "SpecPhaseChange",
        sessionId: `spec:${name}`,
        cwd,
        data: { specName: name, phase, from: "draft", to: "approved" },
      });
    }
    return newState;
  }

  async function runTask(name: string, taskId?: string): Promise<SpecState> {
    let state = await mustLoad(name, "runTask");
    if (state.phases.tasks !== "approved") {
      // R7.1
      throw new Error(
        `runTask: spec "${name}" — phase "tasks" is "${state.phases.tasks}", must be "approved" before running tasks`,
      );
    }
    const dir = specDir(cwd, name);

    let task: SpecTask;
    let isExplicit: boolean;
    if (taskId === undefined) {
      // R7.2: first pending task in document order.
      const pending = state.tasks.find((t) => t.status === "pending");
      if (!pending) {
        const allDone = state.tasks.length > 0 && state.tasks.every((t) => t.status === "done");
        throw new Error(
          `runTask: spec "${name}" — no pending tasks (${allDone ? "all tasks are done" : "remaining tasks are blocked or in progress"})`,
        );
      }
      task = pending;
      isExplicit = false;
    } else {
      const found = state.tasks.find((t) => t.id === taskId);
      if (!found) {
        throw new Error(`runTask: spec "${name}" — no task with id "${taskId}"`);
      }
      if (found.status === "done") {
        // R7.3
        throw new Error(`runTask: spec "${name}" — task "${taskId}" is already "done"`);
      }
      task = found;
      isExplicit = true;
    }

    const runs = await readRuns(dir);
    if (isExplicit) {
      // R7.7: an explicit re-run resets the consecutive-failure count.
      const prior = runs[task.id];
      runs[task.id] = { consecutiveFailures: 0, lastStopReason: prior?.lastStopReason ?? "", lastRunAt: prior?.lastRunAt ?? "" };
    }

    // R7.4: mark in_progress and persist before the run (crash recovery).
    state = setTaskStatus(state, task.id, "in_progress");
    await writeSpecState(dir, state);
    onEvent({ type: "spec_event", specName: name, phase: "execution", status: "task:in_progress", taskId: task.id });

    const reqMd = await readFileOrEmpty(requirementsPath(dir));
    const designMd = await readFileOrEmpty(designPath(dir));
    const excerpts = extractRequirementExcerpts(reqMd, task.requirements);
    const prompt = execPrompt(task, excerpts, designMd);

    const agentTask: AgentTask = {
      kind: "spec-task-exec",
      prompt,
      system: SPEC_SYSTEM,
      history: [],
      cwd,
      sessionId: `spec:${name}`,
      specName: name,
      taskId: task.id,
      complexityHint: task.complexity,
    };

    const result = await runner.run(agentTask, onEvent);

    if (result.stopReason === "end_turn") {
      // R7.5
      state = setTaskStatus(state, task.id, "done");
      const md = await readFileOrEmpty(tasksPath(dir));
      await fs.writeFile(tasksPath(dir), flipCheckbox(md, task.id), "utf8");
      runs[task.id] = { consecutiveFailures: 0, lastStopReason: result.stopReason, lastRunAt: now() };
      await writeRuns(dir, runs);
      await writeSpecState(dir, state);
      onEvent({ type: "spec_event", specName: name, phase: "execution", status: "task:done", taskId: task.id });
      if (onTaskComplete) {
        await onTaskComplete({
          event: "TaskComplete",
          sessionId: `spec:${name}`,
          cwd,
          data: { specName: name, taskId: task.id, title: task.title },
        });
      }
      return state;
    }

    // R7.6/R7.7: any other stop reason — back to pending, bump the failure
    // count, and demote to blocked once it reaches 2.
    const priorCount = runs[task.id]?.consecutiveFailures ?? 0;
    const nextCount = priorCount + 1;
    const entry: RunEntry = { consecutiveFailures: nextCount, lastStopReason: result.stopReason, lastRunAt: now() };
    runs[task.id] = entry;
    await writeRuns(dir, runs);

    if (nextCount >= 2) {
      state = setTaskStatus(state, task.id, "blocked");
      await writeSpecState(dir, state);
      onEvent({ type: "spec_event", specName: name, phase: "execution", status: "task:blocked", taskId: task.id });
    } else {
      state = setTaskStatus(state, task.id, "pending");
      await writeSpecState(dir, state);
      onEvent({ type: "spec_event", specName: name, phase: "execution", status: "task:failed", taskId: task.id });
    }

    return state;
  }

  return { create, load, list, generate, approve, runTask };
}
