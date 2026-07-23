import type { CxTrafficProfile } from "@cox/cx-core";

export interface SyntheticEvent {
  customerId: string;
  channel: string;
  content: string;
}

function pickPersona(weights: Record<string, number>, roll: number): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [persona, w] of entries) {
    acc += w / total;
    if (roll < acc) return persona;
  }
  return entries[entries.length - 1]?.[0] ?? "unknown";
}

export function generateSyntheticEvents(
  traffic: CxTrafficProfile,
  journeyType: string,
  randomFn: () => number,
): SyntheticEvent[] {
  const count = Math.round(traffic.volumePerMinute * traffic.durationMinutes);
  const events: SyntheticEvent[] = [];
  for (let i = 0; i < count; i++) {
    const persona = pickPersona(traffic.personaWeights, randomFn());
    events.push({
      customerId: `sim-${persona}-${i}`,
      channel: "web",
      content: `Synthetic ${journeyType} interaction for persona ${persona}`,
    });
  }
  return events;
}
