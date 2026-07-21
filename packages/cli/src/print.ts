/**
 * runPrint — R6.1-R6.3: plain (non-Ink) rendering of one turn, an automatic
 * permission policy (no user present to answer prompts), and an exit code
 * derived from how the turn ended.
 *
 * design.md's sketch is `runPrint(prompt, flags)`; `flags` here bundles the
 * bus/controller a real caller gets from wire.ts's buildSession (task 13)
 * alongside the --yolo flag, keeping the (prompt, flags) shape while
 * staying testable now with a fake bus/controller (no engines needed).
 *
 * Exit-code note (R6.3): `turn_done` itself carries no stopReason. The
 * agent loop always emits `model_call_finished` (which does have one)
 * immediately before `turn_done` in the same step
 * (docs/specs/agent-tools/design.md's loop algorithm, step e before g) —
 * this remembers the most recent one and uses it to decide 0 (end_turn)
 * vs 1 (max_tokens/refusal/anything else). There's no event-level
 * *guarantee* of that pairing, only the documented algorithm; flagged in
 * INTEGRATION-NOTES.md.
 */
import { createPlainRenderer } from "@cox/tui";
import type {
  AgentEvent,
  EventBus,
  PermissionDecision,
  SessionController,
  StopReason,
} from "@cox/core";

export interface PrintFlags {
  bus: EventBus;
  controller: SessionController;
  yolo?: boolean;
  write?: (line: string) => void;
}

export async function runPrint(prompt: string, flags: PrintFlags): Promise<number> {
  const write = flags.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const renderPlain = createPlainRenderer(write);

  let lastStopReason: StopReason | undefined;

  return new Promise<number>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;

    function finish(code: number): void {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      resolve(code);
    }

    unsubscribe = flags.bus.subscribe((e: AgentEvent) => {
      renderPlain(e);
      switch (e.type) {
        case "model_call_finished": {
          lastStopReason = e.stopReason;
          break;
        }
        case "permission_request": {
          const decision: PermissionDecision = flags.yolo ? "allow" : "deny";
          flags.controller.resolvePermission(decision);
          write(
            decision === "allow"
              ? "  -> allowed (--yolo)"
              : "  -> denied (default; pass --yolo to auto-allow)",
          );
          break;
        }
        case "turn_done": {
          finish(lastStopReason === "end_turn" ? 0 : 1);
          break;
        }
        case "error": {
          finish(1);
          break;
        }
        default:
          break;
      }
    });

    flags.controller.submitPrompt(prompt);
  });
}
