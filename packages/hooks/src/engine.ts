import type {
  AgentHookConfig,
  CommandHookConfig,
  CoxConfig,
  HookEngine,
  HookOutcome,
  HookPayload,
} from "@cox/core";
import { createHookConfigLoader } from "./config";

const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

export function createHookEngine(deps: {
  cwd: string;
  config: CoxConfig;
  env?: NodeJS.ProcessEnv;
}): HookEngine {
  const env = deps.env ?? process.env;
  const loader = createHookConfigLoader({ cwd: deps.cwd, env });
  // R7.4 / design.md: compile each matcher pattern once per engine instance.
  const regexCache = new Map<string, RegExp | null>();

  return {
    agentHooks(): AgentHookConfig[] {
      return loader.agentHookConfigs();
    },

    async fire(payload: HookPayload): Promise<HookOutcome[]> {
      // R10.1: hooks disabled — no config access, no spawns.
      if (!deps.config.hooks.enabled) return [];

      const outcomes: HookOutcome[] = [];

      // R10.4: load warnings ride along on the first fire() after load, once.
      for (const warning of loader.drainWarnings()) {
        outcomes.push({ hook: warning.source, action: "continue", stderr: warning.message });
      }

      // R7.1: select command hooks whose event matches.
      const candidates = loader.commandHooks().filter((hook) => hook.event === payload.event);

      for (const hook of candidates) {
        if (TOOL_EVENTS.has(payload.event)) {
          // R7.2/R7.3: matcher only applies (and is only even inspected) on
          // PreToolUse/PostToolUse; "*"/absent means "match everything".
          if (hook.matcher !== undefined && hook.matcher !== "*") {
            const regex = compileCached(regexCache, hook.matcher);
            if (regex === null) {
              // R7.4: invalid regex — skip this hook, warn naming the pattern.
              outcomes.push({
                hook: hook.command,
                action: "continue",
                stderr: `invalid matcher regex ${JSON.stringify(hook.matcher)} on a ${hook.event} hook`,
              });
              continue;
            }
            const toolName = String((payload.data as Record<string, unknown>)?.toolName ?? "");
            if (!regex.test(toolName)) continue; // no match — not selected, no outcome
          }
        }
        outcomes.push(await runOne(hook, payload, env));
      }

      return outcomes;
    },
  };
}

function compileCached(cache: Map<string, RegExp | null>, pattern: string): RegExp | null {
  const cached = cache.get(pattern);
  if (cached !== undefined) return cached;
  let regex: RegExp | null;
  try {
    regex = new RegExp(pattern);
  } catch {
    regex = null;
  }
  cache.set(pattern, regex);
  return regex;
}

async function runOne(
  hook: CommandHookConfig,
  _payload: HookPayload,
  _env: NodeJS.ProcessEnv,
): Promise<HookOutcome> {
  // Stub: real spawn-based execution (R8/R9) is implemented in the next task.
  return { hook: hook.command, action: "continue" };
}
