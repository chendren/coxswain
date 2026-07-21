import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, type CoxConfig } from "@cox/core";

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
