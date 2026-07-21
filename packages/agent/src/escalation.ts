import type { EscalationSignal } from "@cox/core";

export interface ToolCallLike {
  name: string;
  input: unknown;
}

export interface ToolResultLike {
  isError: boolean;
}

export interface SignalTracker {
  /** Called once per executed tool call, in call order (R4.1, R4.2). */
  record(call: ToolCallLike, result: ToolResultLike): void;
  /** Returns signals accumulated since the last drain, then clears them. */
  drainNew(): EscalationSignal[];
}

/**
 * R4.1: fires a tool_error_streak signal the moment the consecutive isError
 * streak *reaches* `toolErrorStreak` (edge-triggered — not on every call
 * past the threshold); any success resets the streak to 0.
 * R4.2: fires a model_stuck signal whenever a call repeats the immediately
 * preceding call's name and JSON-equal input (canonical: key order doesn't
 * matter). "Consecutive" tracks the global call sequence across the whole
 * run, not reset per turn.
 */
export function createSignalTracker(config: { toolErrorStreak: number }): SignalTracker {
  let errorStreak = 0;
  let lastCall: { name: string; canonicalInput: string } | null = null;
  const pending: EscalationSignal[] = [];

  return {
    record(call, result) {
      if (result.isError) {
        errorStreak++;
        if (errorStreak === config.toolErrorStreak) {
          pending.push({ type: "tool_error_streak", count: errorStreak });
        }
      } else {
        errorStreak = 0;
      }

      const canonicalInput = canonicalJson(call.input);
      if (lastCall && lastCall.name === call.name && lastCall.canonicalInput === canonicalInput) {
        pending.push({ type: "model_stuck", evidence: call.name });
      }
      lastCall = { name: call.name, canonicalInput };
    },
    drainNew() {
      return pending.splice(0, pending.length);
    },
  };
}

function canonicalJson(v: unknown): string {
  return JSON.stringify(sortKeysDeep(v));
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortKeysDeep(src[k]);
    return out;
  }
  return v;
}
