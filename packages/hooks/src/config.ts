import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentHookConfig, CommandHookConfig, HookEventName } from "@cox/core";

const HOOK_EVENT_NAMES: readonly HookEventName[] = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PreModelCall",
  "PostModelCall",
  "SpecPhaseChange",
  "TaskComplete",
  "Stop",
  "SessionEnd",
];

function isHookEventName(x: unknown): x is HookEventName {
  return typeof x === "string" && (HOOK_EVENT_NAMES as readonly string[]).includes(x);
}

/** A config-load-time problem, surfaced by the engine as a `continue` outcome. */
export interface LoadWarning {
  /** File path the warning originates from (becomes HookOutcome.hook). */
  source: string;
  message: string;
}

export interface HookConfigLoader {
  commandHooks(): CommandHookConfig[];
  agentHookConfigs(): AgentHookConfig[];
  /** Returns accumulated load warnings and clears them (R10.4: once only). */
  drainWarnings(): LoadWarning[];
}

interface LoadedConfig {
  commandHooks: CommandHookConfig[];
  agentHookConfigs: AgentHookConfig[];
  warnings: LoadWarning[];
}

/**
 * Lazy, cached loader for `hooks.json` (user then project) and
 * `.cox/hooks/*.md` agent hooks. Uses sync fs — sanctioned for config
 * loading per docs/04-CONVENTIONS.md — so `agentHookConfigs()` can stay
 * synchronous per the frozen `HookEngine` contract.
 */
export function createHookConfigLoader(opts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): HookConfigLoader {
  let loaded: LoadedConfig | null = null;

  function ensureLoaded(): LoadedConfig {
    if (loaded) return loaded;

    const warnings: LoadWarning[] = [];

    // R5.1: user hooks.json resolved from injected env.HOME (fallback
    // os.homedir()), never process.env directly and never a hardcoded `~`.
    const homeDir = opts.env.HOME ?? homedir();
    const userHooksPath = join(homeDir, ".cox", "hooks.json");
    const projectHooksPath = join(opts.cwd, ".cox", "hooks.json");

    const commandHooks = [
      ...loadHooksJson(userHooksPath, warnings),
      ...loadHooksJson(projectHooksPath, warnings),
    ];

    const agentHookConfigs = loadAgentHooks(join(opts.cwd, ".cox", "hooks"), warnings);

    loaded = { commandHooks, agentHookConfigs, warnings };
    return loaded;
  }

  return {
    commandHooks(): CommandHookConfig[] {
      return ensureLoaded().commandHooks;
    },
    agentHookConfigs(): AgentHookConfig[] {
      return ensureLoaded().agentHookConfigs;
    },
    drainWarnings(): LoadWarning[] {
      const current = ensureLoaded();
      const drained = current.warnings;
      current.warnings = [];
      return drained;
    },
  };
}

// ---------------------------------------------------------------------------
// hooks.json (R5)
// ---------------------------------------------------------------------------

function loadHooksJson(path: string, warnings: LoadWarning[]): CommandHookConfig[] {
  if (!existsSync(path)) return []; // R5.2: missing file, no error.

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    warnings.push({ source: path, message: `failed to read ${path}: ${(err as Error).message}` });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // R5.3: malformed JSON — skip the whole file.
    warnings.push({ source: path, message: `malformed JSON in ${path}: ${(err as Error).message}` });
    return [];
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    warnings.push({
      source: path,
      message: `${path}: expected a JSON object with a "hooks" array, skipping`,
    });
    return [];
  }

  const hooksField = (parsed as Record<string, unknown>).hooks;
  if (!Array.isArray(hooksField)) {
    warnings.push({
      source: path,
      message: `${path}: "hooks" field is missing or not an array, skipping`,
    });
    return [];
  }

  const result: CommandHookConfig[] = [];
  hooksField.forEach((entry, index) => {
    const hook = validateCommandHookEntry(entry, path, index, warnings);
    if (hook) result.push(hook);
  });
  return result;
}

function validateCommandHookEntry(
  entry: unknown,
  path: string,
  index: number,
  warnings: LoadWarning[],
): CommandHookConfig | null {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    warnings.push({ source: path, message: `${path}: hooks[${index}] is not an object, skipped` });
    return null;
  }
  const e = entry as Record<string, unknown>;

  if (!isHookEventName(e.event)) {
    // R5.3: unknown `event` — skip this entry only.
    warnings.push({
      source: path,
      message: `${path}: hooks[${index}] has unknown event ${JSON.stringify(e.event)}, skipped`,
    });
    return null;
  }

  if (typeof e.command !== "string" || e.command.length === 0) {
    warnings.push({
      source: path,
      message: `${path}: hooks[${index}] (event ${e.event}) is missing a non-empty "command", skipped`,
    });
    return null;
  }

  const hook: CommandHookConfig = { event: e.event, command: e.command };
  if (typeof e.matcher === "string") hook.matcher = e.matcher;
  if (typeof e.timeoutMs === "number" && Number.isFinite(e.timeoutMs)) {
    hook.timeoutMs = e.timeoutMs;
  }
  return hook;
}

// ---------------------------------------------------------------------------
// .cox/hooks/*.md agent hooks (R6) — implemented in a later task.
// ---------------------------------------------------------------------------

function loadAgentHooks(_dir: string, _warnings: LoadWarning[]): AgentHookConfig[] {
  return [];
}
