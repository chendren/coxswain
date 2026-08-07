/**
 * Full program snapshot directory (ops + design state) for backup / handoff.
 * Broader than CAB (includes spec.json and health history when present).
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exportCabPackage } from "./cab-export";
import type { CxWorkspaceDeps } from "./workspace";

export interface SnapshotResult {
  outDir: string;
  files: string[];
  path: string[];
}

export async function snapshotCxSpec(
  deps: CxWorkspaceDeps,
  specName: string,
  outDirRaw: string,
  cwd: string,
): Promise<SnapshotResult> {
  const path = ["snapshot", "cab_base", "copy_spec", "copy_health", "emit"];
  const outDir = resolve(cwd, outDirRaw);
  // CAB package first
  const cab = await exportCabPackage(deps, specName, outDir, cwd);
  const files = [...cab.files];

  // Full spec.json
  try {
    const src = join(deps.cxRoot, specName, "spec.json");
    await cp(src, join(outDir, "spec.json"));
    files.push("spec.json");
  } catch {
    /* missing */
  }

  // health history
  try {
    const raw = await readFile(join(deps.cxRoot, specName, "health-history.jsonl"), "utf8");
    await writeFile(join(outDir, "health-history.jsonl"), raw, "utf8");
    files.push("health-history.jsonl");
  } catch {
    /* optional */
  }

  // daemon meta if present
  for (const f of ["daemon.json", "audit.jsonl"] as const) {
    try {
      await cp(join(deps.cxRoot, specName, f), join(outDir, f));
      if (!files.includes(f)) files.push(f);
    } catch {
      /* optional */
    }
  }

  const note = [
    `# CXOS snapshot: ${specName}`,
    ``,
    `Exported: ${deps.now()}`,
    ``,
    `Includes CAB package contents plus spec.json and optional health/audit/daemon meta.`,
    `Restore is manual: copy files back under .cox/cx/${specName}/.`,
    ``,
  ].join("\n");
  await writeFile(join(outDir, "SNAPSHOT.md"), note, "utf8");
  files.push("SNAPSHOT.md");

  return { outDir, files, path };
}
