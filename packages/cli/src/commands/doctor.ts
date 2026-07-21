/**
 * cox doctor (R10.1): node >= 20, config parses, each configured
 * provider's apiKeyEnv is set (when required), .cox/ writability, and
 * (unless --offline) provider reachability. Prints ✓/✗ per check; the
 * caller exits 1 if any check failed.
 *
 * Node/config/env-var/writability checks use only @cox/core + node
 * builtins — no engine package — so `cox doctor --offline` keeps working
 * while every lane is still a stub (R8.2). Reachability is injected as
 * `checkReachability` (no real network in tests, per docs/04); main.ts
 * wires the real one as a 1-token scout call and treats a NotWiredError
 * from building it as simply a failed check, not a crash.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, type CoxConfig } from "@cox/core";

export interface DoctorCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorDeps {
  cwd: string;
  offline: boolean;
  nodeVersion?: string; // default process.version
  env?: NodeJS.ProcessEnv; // default process.env
  checkReachability?: () => Promise<boolean>;
  write: (line: string) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function nodeMajorVersion(version: string): number {
  return Number(version.replace(/^v/, "").split(".")[0]);
}

async function checkCoxDirWritable(cwd: string): Promise<DoctorCheck> {
  const dir = join(cwd, ".cox");
  try {
    await mkdir(dir, { recursive: true });
    const probe = join(dir, `.doctor-write-check-${process.pid}-${Date.now()}`);
    await writeFile(probe, "");
    await rm(probe);
    return { label: ".cox/ is writable", ok: true };
  } catch (err) {
    return { label: ".cox/ is writable", ok: false, detail: errorMessage(err) };
  }
}

function checkApiKeyEnvVars(cfg: CoxConfig, env: NodeJS.ProcessEnv): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const anthropicEnv = cfg.providers.anthropic.apiKeyEnv;
  checks.push({ label: `${anthropicEnv} is set (anthropic)`, ok: Boolean(env[anthropicEnv]) });
  for (const entry of cfg.providers.openaiCompat) {
    if (!entry.apiKeyEnv) continue; // omitted for local servers (e.g. ollama)
    checks.push({ label: `${entry.apiKeyEnv} is set (${entry.id})`, ok: Boolean(env[entry.apiKeyEnv]) });
  }
  return checks;
}

/** Returns true iff every check passed. */
export async function runDoctor(deps: DoctorDeps): Promise<boolean> {
  const checks: DoctorCheck[] = [];
  const nodeVersion = deps.nodeVersion ?? process.version;

  checks.push({
    label: `node >= 20 (found ${nodeVersion})`,
    ok: nodeMajorVersion(nodeVersion) >= 20,
  });

  let cfg: CoxConfig | undefined;
  try {
    cfg = loadConfig(deps.cwd);
    checks.push({ label: "config parses", ok: true });
  } catch (err) {
    checks.push({ label: "config parses", ok: false, detail: errorMessage(err) });
  }

  if (cfg) {
    checks.push(...checkApiKeyEnvVars(cfg, deps.env ?? process.env));
    checks.push(await checkCoxDirWritable(deps.cwd));
  }

  if (!deps.offline) {
    if (deps.checkReachability) {
      try {
        const reachable = await deps.checkReachability();
        checks.push({ label: "provider reachable", ok: reachable });
      } catch (err) {
        checks.push({ label: "provider reachable", ok: false, detail: errorMessage(err) });
      }
    } else {
      checks.push({ label: "provider reachable", ok: false, detail: "no reachability check available" });
    }
  }

  for (const check of checks) {
    const mark = check.ok ? "✓" : "✗";
    deps.write(check.detail ? `${mark} ${check.label} — ${check.detail}` : `${mark} ${check.label}`);
  }
  return checks.every((c) => c.ok);
}
