import type { CxTargetId } from "./target";

export type CxHealthLevel = "healthy" | "degraded" | "down";

export interface CxHealthMetric {
  name: string;
  value: number;
  unit: string;
}

export interface CxHealth {
  targetId: CxTargetId;
  level: CxHealthLevel;
  metrics: CxHealthMetric[];
  checkedAt: string;
}

export interface CxTrafficProfile {
  name: string;
  volumePerMinute: number;
  /** Persona id -> traffic share; entries should sum to 1. */
  personaWeights: Record<string, number>;
  durationMinutes: number;
}

export interface CxSimOutcome {
  kpiName: string;
  achieved: number;
  target: number;
}

export interface CxSimReport {
  targetId: CxTargetId;
  profile: CxTrafficProfile;
  outcomes: CxSimOutcome[];
  ranAt: string;
}
