/**
 * Append-only deployment health history for trend-ish ops (offline store).
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HealthEntry, MetricsSummary } from "./metrics-summary";
import { summarizeDeployments } from "./metrics-summary";

export interface HealthSample {
  at: string;
  score: number;
  healthy: number;
  degraded: number;
  down: number;
  errors: number;
  total: number;
  entries: HealthEntry[];
}

export interface HealthHistoryDeps {
  cxRoot: string;
  now: () => string;
}

function historyPath(deps: HealthHistoryDeps, specName: string): string {
  return join(deps.cxRoot, specName, "health-history.jsonl");
}

export async function appendHealthSample(
  deps: HealthHistoryDeps,
  specName: string,
  entries: HealthEntry[],
): Promise<HealthSample> {
  const summary: MetricsSummary = summarizeDeployments(entries);
  const sample: HealthSample = {
    at: deps.now(),
    score: summary.score,
    healthy: summary.healthy,
    degraded: summary.degraded,
    down: summary.down,
    errors: summary.errors,
    total: summary.total,
    entries,
  };
  await mkdir(join(deps.cxRoot, specName), { recursive: true });
  await appendFile(historyPath(deps, specName), `${JSON.stringify(sample)}\n`, "utf8");
  return sample;
}

export async function loadHealthHistory(
  deps: HealthHistoryDeps,
  specName: string,
  limit = 20,
): Promise<HealthSample[]> {
  try {
    const raw = await readFile(historyPath(deps, specName), "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const samples: HealthSample[] = [];
    for (const line of lines) {
      try {
        samples.push(JSON.parse(line) as HealthSample);
      } catch {
        /* skip */
      }
    }
    if (limit <= 0 || samples.length <= limit) return samples;
    return samples.slice(-limit);
  } catch {
    return [];
  }
}
