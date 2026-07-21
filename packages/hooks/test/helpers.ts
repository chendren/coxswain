import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configSchema,
  type AgentHookConfig,
  type CommandHookConfig,
  type CoxConfig,
  type HookEventName,
  type HookPayload,
} from "@cox/core";

/** Fresh mkdtemp project root for a single test. */
export async function makeTmpCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cox-hooks-cwd-"));
}

/** Fresh mkdtemp dir standing in for a user's $HOME — never the real one. */
export async function makeTmpHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cox-hooks-home-"));
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** A full CoxConfig with the given overrides deep-merged over defaults. */
export function makeConfig(overrides: Record<string, unknown> = {}): CoxConfig {
  return configSchema.parse(overrides);
}

/** A minimal, isolated env for spawning test hooks — never process.env. */
export function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { SHELL: "/bin/sh", ...overrides };
}

/** Writes `${cwd}/.cox/hooks.json` with the given command hooks. */
export async function writeHooksJson(cwd: string, hooks: CommandHookConfig[]): Promise<void> {
  await writeJsonFile(join(cwd, ".cox", "hooks.json"), { hooks });
}

/** A HookPayload with sensible defaults, `data` merged over `{}`. */
export function makePayload(
  event: HookEventName,
  cwd: string,
  data: Record<string, unknown> = {},
): HookPayload {
  return { event, sessionId: "test-session", cwd, data };
}

/** A synthetic AgentHookConfig for watcher tests (manual trigger by default). */
export function makeAgentHook(
  overrides: Partial<AgentHookConfig> & Pick<AgentHookConfig, "name">,
): AgentHookConfig {
  return {
    name: overrides.name,
    trigger: overrides.trigger ?? { type: "manual" },
    tier: overrides.tier ?? "scout",
    prompt: overrides.prompt ?? `prompt for ${overrides.name}`,
  };
}

/** Polls `predicate` until it's true or `timeoutMs` elapses. */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 2000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
