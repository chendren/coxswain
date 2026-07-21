/**
 * RoutingAnnouncement — the 3-line `routing_decision` block, byte-compatible
 * with docs/05-ROUTING-AND-LEDGER.md §2 (R1.3). Exact spacing verified
 * character-by-character against that doc: "⑆ router  " is 10 chars, and
 * both continuation lines indent by exactly that many spaces; the estimate
 * line has four spaces before "session" and one space before the bar.
 */
import React from "react";
import { Box, Text } from "ink";
import type { RoutingDecision } from "@cox/core";
import { budgetBar, formatTokens, formatUsd } from "../format";

export interface RoutingAnnouncementProps {
  decision: RoutingDecision;
  label: string;
  spentUsd: number;
  limitUsd?: number;
}

const HEADER_PREFIX = "⑆ router  ";
const INDENT = " ".repeat(HEADER_PREFIX.length);

/**
 * Pure line-builder shared with plain.ts (R6.1 "same transcript content
 * line-by-line") so the byte format is defined in exactly one place.
 */
export function routingAnnouncementLines(
  decision: RoutingDecision,
  label: string,
  spentUsd: number,
  limitUsd?: number,
): [string, string, string] {
  const sessionSegment =
    limitUsd === undefined
      ? `session ${formatUsd(spentUsd)}`
      : `session ${formatUsd(spentUsd)}/${formatUsd(limitUsd)} ${budgetBar(spentUsd, limitUsd, 10)}`;
  return [
    `${HEADER_PREFIX}${label} → ${decision.tier} (${decision.model.model})`,
    `${INDENT}${decision.reasons.join(" · ")}`,
    `${INDENT}est ${formatTokens(decision.estimate.inputTokens)} in / ~${formatTokens(
      decision.estimate.estOutputTokens,
    )} out ≈ ${formatUsd(decision.estimate.estCostUsd)}    ${sessionSegment}`,
  ];
}

export function RoutingAnnouncement({
  decision,
  label,
  spentUsd,
  limitUsd,
}: RoutingAnnouncementProps): React.JSX.Element {
  const [line1, line2, line3] = routingAnnouncementLines(decision, label, spentUsd, limitUsd);
  return (
    <Box flexDirection="column">
      <Text>{line1}</Text>
      <Text>{line2}</Text>
      <Text>{line3}</Text>
    </Box>
  );
}
