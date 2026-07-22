import type { CxTargetId } from "./target";

export type CxAdapterErrorPhase = "plan" | "build" | "deploy" | "status" | "simulate" | "teardown";

/** A typed adapter error: a plain Error with CXOS fields attached — no
 * custom class hierarchy, matching @cox/providers's providerError(). */
export interface CxAdapterError extends Error {
  targetId: CxTargetId;
  phase: CxAdapterErrorPhase;
  retryable: boolean;
}

export function createCxAdapterError(init: {
  message: string;
  targetId: CxTargetId;
  phase: CxAdapterErrorPhase;
  retryable: boolean;
}): CxAdapterError {
  const err = new Error(init.message) as CxAdapterError;
  err.targetId = init.targetId;
  err.phase = init.phase;
  err.retryable = init.retryable;
  return err;
}

export function isCxAdapterError(e: unknown): e is CxAdapterError {
  return (
    e instanceof Error &&
    "targetId" in e &&
    "phase" in e &&
    "retryable" in e
  );
}
