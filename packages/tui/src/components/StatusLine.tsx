/**
 * StatusLine — persistent bottom status line (R2.1), byte-compatible with
 * docs/05-ROUTING-AND-LEDGER.md §2:
 * `⛵ <tier> <model> │ ▲<in> ▼<out> │ $<spent>/$<limit|∞> │ cache <pct>% │ spec <name> <done>/<total>`
 * (spec segment omitted when `activeSpec` is undefined, R2.1). The cost
 * segment renders yellow at budget.level "warn", red at "exceeded" (R2.3).
 * App re-renders this from a fresh `getSnapshot()` on every event (R2.2) —
 * this component itself is a pure function of its `snapshot` prop.
 */
import React from "react";
import { Text } from "ink";
import type { SessionSnapshot } from "@cox/core";
import { cachePct, formatTokens, formatUsd } from "../format";

export interface StatusLineProps {
  snapshot: SessionSnapshot;
}

export function StatusLine({ snapshot }: StatusLineProps): React.JSX.Element {
  const modelLabel = snapshot.currentModel ? snapshot.currentModel.model : "(none)";
  const limitStr = snapshot.budget.limitUsd === undefined ? "∞" : formatUsd(snapshot.budget.limitUsd);
  const costColor: "red" | "yellow" | undefined =
    snapshot.budget.level === "exceeded" ? "red" : snapshot.budget.level === "warn" ? "yellow" : undefined;
  const specSuffix = snapshot.activeSpec
    ? ` │ spec ${snapshot.activeSpec.name} ${snapshot.activeSpec.tasksDone}/${snapshot.activeSpec.tasksTotal}`
    : "";

  return (
    <Text>
      {`⛵ ${snapshot.currentTier} ${modelLabel} │ ▲${formatTokens(snapshot.usage.inputTokens)} ▼${formatTokens(
        snapshot.usage.outputTokens,
      )} │ `}
      <Text color={costColor}>{`${formatUsd(snapshot.budget.spentUsd)}/${limitStr}`}</Text>
      {` │ cache ${cachePct(snapshot.usage)}%${specSuffix}`}
    </Text>
  );
}
