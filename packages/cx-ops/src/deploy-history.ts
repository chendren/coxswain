/**
 * Append-only deployment history (plan/build snapshots, not cloud rollback).
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DeployHistoryEntry {
  at: string;
  targets: string[];
  ok: boolean;
  mode?: string;
  note?: string;
  actor?: string;
}

export interface DeployHistoryDeps {
  cxRoot: string;
  now: () => string;
}

function histPath(deps: DeployHistoryDeps, specName: string): string {
  return join(deps.cxRoot, specName, "deploy-history.jsonl");
}

export async function appendDeployHistory(
  deps: DeployHistoryDeps,
  specName: string,
  entry: Omit<DeployHistoryEntry, "at"> & { at?: string },
): Promise<DeployHistoryEntry> {
  const full: DeployHistoryEntry = {
    at: entry.at ?? deps.now(),
    targets: entry.targets,
    ok: entry.ok,
    mode: entry.mode,
    note: entry.note,
    actor: entry.actor,
  };
  await mkdir(join(deps.cxRoot, specName), { recursive: true });
  await appendFile(histPath(deps, specName), `${JSON.stringify(full)}\n`, "utf8");
  return full;
}

export async function loadDeployHistory(
  deps: DeployHistoryDeps,
  specName: string,
  limit = 20,
): Promise<DeployHistoryEntry[]> {
  try {
    const raw = await readFile(histPath(deps, specName), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const out: DeployHistoryEntry[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as DeployHistoryEntry);
      } catch {
        /* skip */
      }
    }
    return limit > 0 && out.length > limit ? out.slice(-limit) : out;
  } catch {
    return [];
  }
}
