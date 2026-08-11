/**
 * Pure deployment health rollup for status command.
 */

import { healthBand } from "./health-band";

export interface HealthEntry {
  targetId: string;
  level?: "healthy" | "degraded" | "down";
  error?: string;
}

export interface MetricsSummary {
  healthy: number;
  degraded: number;
  down: number;
  errors: number;
  total: number;
  /** 0-100: healthy=100 weight, degraded=50, down/error=0 */
  score: number;
  band: "green" | "yellow" | "red";
}

export function summarizeDeployments(entries: HealthEntry[]): MetricsSummary {
  let healthy = 0;
  let degraded = 0;
  let down = 0;
  let errors = 0;
  let points = 0;
  for (const e of entries) {
    if (e.error) {
      errors++;
      continue;
    }
    if (e.level === "healthy") {
      healthy++;
      points += 100;
    } else if (e.level === "degraded") {
      degraded++;
      points += 50;
    } else if (e.level === "down") {
      down++;
    } else {
      errors++;
    }
  }
  const total = entries.length;
  const scored = healthy + degraded + down + errors;
  const score = scored === 0 ? 0 : Math.round(points / scored);
  return { healthy, degraded, down, errors, total, score, band: healthBand(score) };
}
