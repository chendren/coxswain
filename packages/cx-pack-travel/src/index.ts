/**
 * Travel design pack for CXOS — airline / hospitality / OTA.
 * Journeys: booking, disruption, loyalty, checkin, retention.
 */
import type {
  CxArchitectureDoc,
  CxArtifact,
  CxSpec,
  JourneyMap,
  CxOntology,
} from "@cox/cx-core";

function prov(specName: string) {
  return {
    specName,
    phase: "design" as const,
    targetId: "artifacts" as const,
  };
}

function stages(
  rows: { id: string; name: string; description: string; touchpoints: string[] }[],
): JourneyMap["stages"] {
  return rows;
}

export function seedTravelDesignPack(spec: CxSpec, _ontology: CxOntology): CxArtifact[] {
  const p = prov(spec.state.name);
  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "booking",
      provenance: p,
      name: "Booking",
      stages: stages([
        { id: "searching", name: "Searching", description: "Traveler searches flights or hotels via app or web", touchpoints: ["app", "web", "chat"] },
        { id: "selected", name: "Selected", description: "Itinerary selected and priced", touchpoints: ["app", "web", "agent"] },
        { id: "booked", name: "Booked", description: "Booking confirmed and ticketed", touchpoints: ["email", "app", "sms"] },
        { id: "confirmed", name: "Confirmed", description: "Confirmation sent", touchpoints: ["email", "sms", "app"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "disruption",
      provenance: p,
      name: "Disruption and Rebooking",
      stages: stages([
        { id: "disrupted", name: "Disrupted", description: "Flight delayed or canceled, hotel overbooked", touchpoints: ["sms", "app", "backoffice"] },
        { id: "informed", name: "Informed", description: "Traveler notified with options", touchpoints: ["sms", "app", "email", "agent"] },
        { id: "rebooked", name: "Rebooked", description: "Traveler rebooked or refunded", touchpoints: ["app", "agent", "chat"] },
        { id: "resolved", name: "Resolved", description: "Disruption resolved, compensation if eligible", touchpoints: ["app", "email"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "loyalty_program",
      provenance: p,
      name: "Loyalty Program",
      stages: stages([
        { id: "enrolled", name: "Enrolled", description: "Traveler enrolled in loyalty", touchpoints: ["app", "web"] },
        { id: "earning", name: "Earning", description: "Points earned on travel", touchpoints: ["app", "email"] },
        { id: "redeeming", name: "Redeeming", description: "Points redeemed for upgrades or nights", touchpoints: ["app", "agent"] },
        { id: "retained", name: "Retained", description: "Elite status retained", touchpoints: ["app", "email", "sms"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "checkin",
      provenance: p,
      name: "Check-in and Boarding",
      stages: stages([
        { id: "checkin_open", name: "Check-in open", description: "Check-in opens 24h before departure", touchpoints: ["app", "web", "kiosk"] },
        { id: "checked_in", name: "Checked in", description: "Boarding pass issued", touchpoints: ["app", "sms", "email"] },
        { id: "boarded", name: "Boarded", description: "Traveler boarded", touchpoints: ["gate", "app"] },
        { id: "arrived", name: "Arrived", description: "Arrival and baggage", touchpoints: ["app", "sms"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "retention",
      provenance: p,
      name: "Retention",
      stages: stages([
        { id: "at_risk", name: "At risk", description: "Churn risk after disruption or competitor offer", touchpoints: ["app", "backoffice"] },
        { id: "engaged", name: "Engaged", description: "Proactive recovery offer", touchpoints: ["app", "email", "chat", "agent"] },
        { id: "retained", name: "Retained", description: "Traveler retained with voucher or status match", touchpoints: ["app", "sms"] },
      ]),
    },
  ];

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: p,
    title: `Travel CX architecture — ${spec.state.name}`,
    markdown: [
      `# Travel CX architecture: ${spec.state.name}`,
      ``,
      `## Journeys`,
      ...journeys.map((j) => `- **${j.id}** — ${j.name}`),
      ``,
      `## Channels`,
      `web, app, chat, phone, agent, backoffice, gate, kiosk`,
      ``,
      `## Note`,
      `Strong graph only, no live pricing or PNR data in ontology.`,
    ].join("\n"),
  };

  return [...journeys, architectureDoc];
}
