import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { TIERS, type AgentHookConfig, type CommandHookConfig, type HookEventName, type Tier } from "@cox/core";

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
// .cox/hooks/*.md agent hooks (R6)
// ---------------------------------------------------------------------------

interface FrontMatterResult {
  data: Record<string, unknown> | null;
  body: string;
}

const OPEN_DELIM_RE = /^---\r?\n/;
// First line, from the start of `rest`, that is exactly "---" (m = per-line ^/$).
const CLOSE_DELIM_RE = /^---\r?(?:\n|$)/m;

/**
 * Local duplicate of @cox/steering's front-matter/body splitter — design.md
 * requires hooks not import @cox/steering. Keep in sync; see NOTES.md.
 */
function parseFrontMatter(raw: string): FrontMatterResult {
  const openMatch = OPEN_DELIM_RE.exec(raw);
  if (!openMatch) return { data: null, body: raw };

  const rest = raw.slice(openMatch[0].length);
  const closeMatch = CLOSE_DELIM_RE.exec(rest);
  if (!closeMatch) return { data: null, body: raw }; // unclosed block

  const yamlText = rest.slice(0, closeMatch.index);
  const body = rest.slice(closeMatch.index + closeMatch[0].length);

  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return { data: null, body: raw };
  }

  if (parsed === null || parsed === undefined) {
    return { data: {}, body }; // empty block — valid, no fields
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { data: null, body: raw }; // scalar/array — can't read fields off it
  }
  return { data: parsed as Record<string, unknown>, body };
}

function isTier(x: unknown): x is Tier {
  return typeof x === "string" && (TIERS as readonly string[]).includes(x);
}

/**
 * Accepts `trigger: manual`, `trigger: { type: manual }` (R6.3, "or
 * equivalent YAML"), and `trigger: { type: fileSave, pattern: <non-empty> }`.
 * Anything else (missing, malformed, fileSave without a pattern) is
 * unresolvable and the caller skips the file (R6.2).
 */
function resolveTrigger(raw: unknown): AgentHookConfig["trigger"] | null {
  if (raw === "manual") return { type: "manual" };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.type === "manual") return { type: "manual" };
    if (obj.type === "fileSave") {
      const pattern = obj.pattern;
      if (typeof pattern === "string" && pattern.length > 0) {
        return { type: "fileSave", pattern };
      }
      return null; // fileSave without a non-empty pattern
    }
  }
  return null;
}

/** Top-level `*.md` file names in `dir`, sorted; `[]` when `dir` is missing. */
function readTopLevelMarkdownFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "en"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function loadAgentHooks(dir: string, warnings: LoadWarning[]): AgentHookConfig[] {
  const fileNames = readTopLevelMarkdownFiles(dir);

  const hooks: AgentHookConfig[] = [];
  for (const fileName of fileNames) {
    const filePath = join(dir, fileName);
    const raw = readFileSync(filePath, "utf8");
    const hook = buildAgentHook(fileName.slice(0, -3), filePath, raw, warnings);
    if (hook) hooks.push(hook);
  }
  return hooks;
}

function buildAgentHook(
  name: string,
  path: string,
  raw: string,
  warnings: LoadWarning[],
): AgentHookConfig | null {
  const { data, body } = parseFrontMatter(raw);

  if (data === null) {
    warnings.push({ source: path, message: `${path}: missing or unparseable front matter, skipped` });
    return null;
  }

  const trigger = resolveTrigger(data.trigger);
  if (!trigger) {
    warnings.push({
      source: path,
      message: `${path}: trigger must be "manual" or {type: fileSave, pattern: <non-empty>}, skipped`,
    });
    return null;
  }

  let tier: Tier = "scout"; // R6.1: default when unspecified
  if (data.tier !== undefined) {
    if (!isTier(data.tier)) {
      warnings.push({
        source: path,
        message: `${path}: tier ${JSON.stringify(data.tier)} is not a valid Tier, skipped`,
      });
      return null;
    }
    tier = data.tier;
  }

  const prompt = body.trim();
  if (prompt.length === 0) {
    warnings.push({ source: path, message: `${path}: body is empty, skipped` });
    return null;
  }

  return { name, trigger, tier, prompt };
}
