/**
 * /healthz equivalent for cox — used by `cox --health` and CI.
 * Pure, no I/O beyond process info; keep it cheap and deterministic.
 */

export interface Healthz {
  /** Always "ok" for the local CLI health endpoint (mirrors /healthz). */
  status: "ok";
  /** CLI version (matches package.json). */
  version: string;
  /** ISO-8601 timestamp when the check ran. */
  timestamp: string;
  /** Process uptime in ms (rounded). */
  uptimeMs: number;
  /** Node.js version. */
  node: string;
  /** Optional per-check booleans. */
  checks: Record<string, boolean>;
}

export function getHealthz(opts?: { version?: string }): Healthz {
  const version = opts?.version ?? "0.1.0";
  return {
    status: "ok",
    version,
    timestamp: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    node: process.version,
    checks: {
      ok: true,
    },
  };
}
