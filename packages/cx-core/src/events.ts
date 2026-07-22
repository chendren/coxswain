import type { AgentEvent } from "@cox/core";
import type { CxOpsMode, CxTargetId } from "./target";

export type CxOpsEvent =
  | { type: "cx_watch_triggered"; targetId: CxTargetId; metric: string; value: number; threshold: number }
  | { type: "cx_diagnosis_proposed"; targetId: CxTargetId; specName: string; taskTitle: string }
  | { type: "cx_remediation_applied"; targetId: CxTargetId; description: string }
  | { type: "cx_mode_changed"; targetId: CxTargetId; from: CxOpsMode; to: CxOpsMode };

function summarize(e: CxOpsEvent): string {
  switch (e.type) {
    case "cx_watch_triggered":
      return `cx watch: ${e.targetId} ${e.metric}=${e.value} crossed ${e.threshold}`;
    case "cx_diagnosis_proposed":
      return `cx diagnosis: ${e.targetId} proposed "${e.taskTitle}" on spec ${e.specName}`;
    case "cx_remediation_applied":
      return `cx remediation: ${e.targetId} ${e.description}`;
    case "cx_mode_changed":
      return `cx mode: ${e.targetId} ${e.from} -> ${e.to}`;
  }
}

/** Bridges a typed CxOpsEvent onto @cox/core's generic `cx_event`
 * AgentEvent variant, so the TUI and ledger subscriber need no CXOS
 * knowledge to render/record it. */
export function toAgentEvent(e: CxOpsEvent): AgentEvent {
  return {
    type: "cx_event",
    targetId: e.targetId,
    summary: summarize(e),
    data: e as unknown as Record<string, unknown>,
  };
}
