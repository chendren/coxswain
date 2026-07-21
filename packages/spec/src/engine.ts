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
import { parseTasks } from "./parser.js";
import { designPrompt, requirementsPrompt, SPEC_SYSTEM, tasksPrompt } from "./prompts.js";
import {
  applyDemotionCascade,
  assertCanGenerate,
  createInitialState,
  designPath,
  ideaPath,
  readSpecState,
  requirementsPath,
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

/** R5.3 — strip a single wrapping ```markdown / ``` fence around the whole
 * document, if the model added one despite SPEC_SYSTEM asking it not to. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:markdown)?\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return match ? (match[1] ?? "") : trimmed;
}

export function createSpecEngine(deps: SpecEngineDeps): SpecEngine {
  const { cwd, runner, onEvent, onPhaseChange, now } = deps;

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
    const filePath =
      phase === "requirements" ? requirementsPath(dir) : phase === "design" ? designPath(dir) : tasksPath(dir);
    await fs.writeFile(filePath, content, "utf8");

    // R4.1/R4.2: sets `phase` itself to "draft" and demotes approved
    // downstream phases; R4.4 (tasks-specific reset) layers on in task 10.
    const cascade = applyDemotionCascade(state, phase);
    await writeSpecState(dir, cascade.state);

    onEvent({ type: "spec_event", specName: name, phase, status: "draft" }); // R5.3
    for (const demotedPhase of cascade.demoted) {
      // R4.3: one spec_event + one awaited onPhaseChange per demoted phase.
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

    return cascade.state;
  }

  async function approve(name: string, phase: SpecPhase): Promise<SpecState> {
    throw new Error("not implemented");
  }

  async function runTask(name: string, taskId?: string): Promise<SpecState> {
    throw new Error("not implemented");
  }

  return { create, load, list, generate, approve, runTask };
}
