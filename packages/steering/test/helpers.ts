import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, type CoxConfig } from "@cox/core";

/** Fresh mkdtemp project root for a single test. */
export async function makeTmpCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cox-steering-"));
}

/** Writes `${cwd}/.cox/steering/${fileName}`, creating the dir as needed. */
export async function writeSteeringFile(
  cwd: string,
  fileName: string,
  content: string,
): Promise<void> {
  const dir = join(cwd, ".cox", "steering");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), content, "utf8");
}

/** Writes an arbitrary file relative to `cwd`, creating parent dirs. */
export async function writeProjectFile(
  cwd: string,
  relPath: string,
  content: string,
): Promise<void> {
  const full = join(cwd, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

/** A full CoxConfig with the given overrides deep-merged over defaults. */
export function makeConfig(overrides: Record<string, unknown> = {}): CoxConfig {
  return configSchema.parse(overrides);
}
