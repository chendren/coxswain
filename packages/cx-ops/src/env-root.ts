/**
 * Multi-env CX root: optional CX_ENV segments under .cox/cx or .cox/cx-<env>.
 */
import { join } from "node:path";

/**
 * Resolve CX workspace root from project cwd.
 * - CX_ENV unset or "default" → `{cwd}/.cox/cx`
 * - else → `{cwd}/.cox/cx-{env}` (e.g. stage → .cox/cx-stage)
 */
export function resolveCxRoot(cwd: string, env?: string): string {
  const raw = (env ?? process.env.CX_ENV ?? "default").trim().toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "default";
  if (safe === "default") {
    return join(cwd, ".cox", "cx");
  }
  return join(cwd, ".cox", `cx-${safe}`);
}
