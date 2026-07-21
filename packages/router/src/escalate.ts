import type { CoxConfig, EscalationSignal } from "@cox/core";

/**
 * First threshold-met signal wins (R4.2), mapped to its evidence string
 * (streak/attempt counts interpolated). `context_overflow` is intentionally
 * inert in v1 — reserved for the integrator to wire compaction later.
 * Returns null when no signal meets its threshold (no escalation).
 */
export function shouldEscalate(signals: EscalationSignal[], config: CoxConfig): string | null {
  const escalation = config.routing.escalation;

  for (const signal of signals) {
    switch (signal.type) {
      case "tool_error_streak":
        if (signal.count >= escalation.toolErrorStreak) {
          return `${signal.count} consecutive tool errors`;
        }
        break;
      case "verification_failed":
        if (signal.attempts >= escalation.verificationFailures) {
          return signal.attempts === 2
            ? "tests failed twice"
            : `tests failed ${signal.attempts} times`;
        }
        break;
      case "model_stuck":
        return "repeated identical tool calls";
      case "model_requested_help":
        return "model requested help";
      case "context_overflow":
        break; // R4.2: never triggers escalation in v1.
    }
  }

  return null;
}
