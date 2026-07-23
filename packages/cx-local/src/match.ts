import type { CxTargetId, JourneyMap } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

/** The platform's 13 fixed journey types (from its CLAUDE.md — Commercial
 * + Treasury Core + Treasury Expanded). Static, not runtime-discoverable
 * via any API the platform exposes; hardcoded here deliberately. */
export const JOURNEY_TYPE_KEYS = [
  "billing_dispute",
  "technical_troubleshooting",
  "new_account_setup",
  "churn_prevention",
  "service_upgrade",
  "treasury_check_replacement",
  "bond_redemption",
  "debt_offset_dispute",
  "treasury_account_recovery",
  "tax_identity_recovery",
  "tax_debt_resolution",
  "audit_response",
  "foreign_compliance",
] as const;

export type JourneyTypeKey = (typeof JOURNEY_TYPE_KEYS)[number];

export function matchPrompt(journeyMap: JourneyMap): string {
  const stageNames = journeyMap.stages.map((s) => s.name).join(", ");
  return `Given this customer journey map:\nName: ${journeyMap.name}\nStages: ${stageNames}\n\nWhich of these journey types is the best match?\n${JOURNEY_TYPE_KEYS.join(", ")}\n\nRespond with JSON only: {"journeyType": "<one of the keys above>"}`;
}

export function parseMatch(raw: string, targetId: CxTargetId): JourneyTypeKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCxAdapterError({
      message: `cx-local: malformed JSON matching journey type: ${raw.slice(0, 200)}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  const key = (parsed as { journeyType?: unknown } | null)?.journeyType;
  if (typeof key !== "string" || !(JOURNEY_TYPE_KEYS as readonly string[]).includes(key)) {
    throw createCxAdapterError({
      message: `cx-local: matched journey type "${String(key)}" is not one of the platform's 13 journey types`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  return key as JourneyTypeKey;
}
