import type { CxTargetId, JourneyMap } from "@cox/cx-core";
import {
  createCxAdapterError,
  hasJourney,
  LOCAL_PLATFORM_ONTOLOGY,
  loadPlatformLocalOntology,
} from "@cox/cx-core";

/**
 * Commercial journey types the local platform deploys (subset of
 * DEFAULT_ONTOLOGY — excludes gov-only journeys like benefits_enrollment).
 */
const PLATFORM_COMMERCIAL_JOURNEYS = [
  "billing_dispute",
  "technical_troubleshooting",
  "new_account_setup",
  "churn_prevention",
  "service_upgrade",
] as const;

/** Treasury / expanded journeys from the platform-local ontology pack. */
const PLATFORM_EXPANDED_JOURNEYS = loadPlatformLocalOntology().journeys.map((j) => j.id);

/**
 * The platform's fixed journey vocabulary (Commercial + Treasury Expanded).
 * Owned by `@cox/cx-core` ontology; this list is the platform deployable
 * subset, not a free-form adapter invention.
 */
export const JOURNEY_TYPE_KEYS = [
  ...PLATFORM_COMMERCIAL_JOURNEYS,
  ...PLATFORM_EXPANDED_JOURNEYS,
] as const;

export type JourneyTypeKey = (typeof JOURNEY_TYPE_KEYS)[number];

for (const key of JOURNEY_TYPE_KEYS) {
  if (!hasJourney(LOCAL_PLATFORM_ONTOLOGY, key)) {
    throw new Error(
      `cx-local: journey type "${key}" is missing from LOCAL_PLATFORM_ONTOLOGY`,
    );
  }
}

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
      message: `cx-local: matched journey type "${String(key)}" is not one of the platform's ${JOURNEY_TYPE_KEYS.length} journey types`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  return key as JourneyTypeKey;
}
