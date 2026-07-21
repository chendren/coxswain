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

export function RoutingAnnouncement({
  decision,
  label,
  spentUsd,
  limitUsd,
}: RoutingAnnouncementProps): React.JSX.Element {
  const sessionSegment =
    limitUsd === undefined
      ? `session ${formatUsd(spentUsd)}`
      : `session ${formatUsd(spentUsd)}/${formatUsd(limitUsd)} ${budgetBar(spentUsd, limitUsd, 10)}`;
  return (
    <Box flexDirection="column">
      <Text>{`${HEADER_PREFIX}${label} → ${decision.tier} (${decision.model.model})`}</Text>
      <Text>{`${INDENT}${decision.reasons.join(" · ")}`}</Text>
      <Text>
        {`${INDENT}est ${formatTokens(decision.estimate.inputTokens)} in / ~${formatTokens(
          decision.estimate.estOutputTokens,
        )} out ≈ ${formatUsd(decision.estimate.estCostUsd)}    ${sessionSegment}`}
      </Text>
    </Box>
  );
}
