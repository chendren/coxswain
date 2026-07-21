import { spawn } from "node:child_process";
import type {
  AgentHookConfig,
  CommandHookConfig,
  CoxConfig,
  HookEngine,
  HookOutcome,
  HookPayload,
} from "@cox/core";
import { createHookConfigLoader } from "./config";

const MAX_CAPTURE_CHARS = 1024 * 1024; // 1 MiB (R9.3)
const TRUNCATION_MARKER = "…[truncated]";
const DEFAULT_TIMEOUT_MS = 30_000;

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

/**
 * R8.1: spawns `$SHELL -c <command>` with captured (never inherited) stdio,
 * writes the payload JSON to stdin, and maps the exit code to an outcome
 * per R8.2-R8.4. R9.1 (timeout) / R9.2 (spawn failure) / R9.3 (output caps)
 * are also handled here since they're all part of the same process
 * lifecycle. R9.4: `hook.command` is passed to spawn verbatim as a single
 * argv element — the payload only ever reaches the hook via stdin.
 */
async function runOne(
  hook: CommandHookConfig,
  payload: HookPayload,
  env: NodeJS.ProcessEnv,
): Promise<HookOutcome> {
  const shell = env.SHELL ?? "/bin/sh";
  const timeoutMs = hook.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<HookOutcome>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout;

    function finish(outcome: HookOutcome): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(shell, ["-c", hook.command], {
        cwd: payload.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      // R9.2: spawning itself failed synchronously (rare — most spawn
      // failures, e.g. a missing shell, surface as an async 'error' event
      // instead; handled below).
      resolve({
        hook: hook.command,
        action: "continue",
        stderr: `failed to spawn hook: ${(err as Error).message}`,
      });
      return;
    }

    timer = setTimeout(() => {
      // R9.1: hard timeout — SIGKILL, never block.
      child.kill("SIGKILL");
      finish({
        hook: hook.command,
        action: "continue",
        stderr: `hook timed out after ${timeoutMs}ms and was killed`,
      });
    }, timeoutMs);

    const stdout = createCappedBuffer();
    const stderr = createCappedBuffer();

    child.once("error", (err) => {
      // R9.2: e.g. ENOENT if `shell` doesn't exist.
      finish({ hook: hook.command, action: "continue", stderr: `hook process error: ${err.message}` });
    });

    child.stdout?.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.append(chunk));

    // The hook may never read stdin (e.g. a one-liner that ignores it);
    // writing/ending after it exits would otherwise raise an unhandled
    // EPIPE and crash the process.
    child.stdin?.on("error", () => {});
    child.stdin?.end(`${JSON.stringify(payload)}\n`);

    child.once("close", (code) => {
      if (code === 0) {
        // R8.2
        const output = parseStdoutJson(stdout.text());
        finish({ hook: hook.command, action: "continue", ...(output ? { output } : {}) });
      } else if (code === 2) {
        // R8.3
        finish({ hook: hook.command, action: "block", stderr: stderr.text() });
      } else {
        // R8.4 — any other exit code (including null from a signal).
        const message = stderr.text() || `hook exited with code ${code ?? "null"}`;
        finish({ hook: hook.command, action: "continue", stderr: message });
      }
    });
  });
}

function createCappedBuffer(): { append(chunk: Buffer): void; text(): string } {
  let buf = "";
  let truncated = false;
  return {
    append(chunk: Buffer): void {
      if (truncated) return;
      buf += chunk.toString("utf8");
      if (buf.length > MAX_CAPTURE_CHARS) {
        // R9.3
        buf = buf.slice(0, MAX_CAPTURE_CHARS) + TRUNCATION_MARKER;
        truncated = true;
      }
    },
    text(): string {
      return buf;
    },
  };
}

/**
 * R8.2: trimmed stdout parsed as a JSON object becomes `outcome.output`;
 * `tierOverride` survives only when it's a valid Tier (other keys pass
 * through untouched). Anything that isn't parseable JSON, or doesn't parse
 * to a plain object, yields no output at all.
 */
function parseStdoutJson(stdout: string): HookOutcome["output"] {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;

  const obj = parsed as Record<string, unknown>;
  if ("tierOverride" in obj) {
    const t = obj.tierOverride;
    if (t !== "scout" && t !== "builder" && t !== "architect") {
      delete obj.tierOverride;
    }
  }
  return obj as HookOutcome["output"];
}
