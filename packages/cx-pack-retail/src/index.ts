/**
 * Retail design pack for CXOS — domain-agnostic retail brand.
 * Journeys: returns, loyalty, store pickup, online order support, retention.
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

export function seedRetailDesignPack(spec: CxSpec, _ontology: CxOntology): CxArtifact[] {
  const p = prov(spec.state.name);

  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "returns_refunds",
      provenance: p,
      name: "Returns and Refunds",
      stages: stages([
        {
          id: "initiated",
          name: "Return initiated",
          description: "Customer requests return via app, web, or store",
          touchpoints: ["app", "web", "retail", "chat"],
        },
        {
          id: "validated",
          name: "Validated",
          description: "Order and eligibility validated against policy",
          touchpoints: ["agent", "backoffice"],
        },
        {
          id: "refund_processing",
          name: "Refund processing",
          description: "Refund issued to original payment method",
          touchpoints: ["billing_system", "sms", "email"],
        },
        {
          id: "resolved",
          name: "Resolved",
          description: "Customer confirmed refund and case closed",
          touchpoints: ["app", "sms"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "loyalty_program",
      provenance: p,
      name: "Loyalty Program",
      stages: stages([
        {
          id: "enrolled",
          name: "Enrolled",
          description: "Customer enrolls in loyalty via app or POS",
          touchpoints: ["app", "retail", "POS"],
        },
        {
          id: "earning",
          name: "Earning",
          description: "Points earned on purchases",
          touchpoints: ["POS", "app", "email"],
        },
        {
          id: "redeeming",
          name: "Redeeming",
          description: "Points redeemed for rewards",
          touchpoints: ["app", "retail", "chat"],
        },
        {
          id: "retained",
          name: "Retained",
          description: "Customer retained with personalized offers",
          touchpoints: ["app", "email", "sms"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "store_pickup",
      provenance: p,
      name: "Store Pickup (BOPIS)",
      stages: stages([
        {
          id: "ordered",
          name: "Ordered",
          description: "Online order placed for store pickup",
          touchpoints: ["web", "app"],
        },
        {
          id: "picking",
          name: "Picking",
          description: "Store associate picks and packs order",
          touchpoints: ["retail", "backoffice"],
        },
        {
          id: "ready",
          name: "Ready for pickup",
          description: "Customer notified order ready",
          touchpoints: ["sms", "app", "email"],
        },
        {
          id: "collected",
          name: "Collected",
          description: "Customer collects order in store",
          touchpoints: ["retail", "POS"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "online_order_support",
      provenance: p,
      name: "Online Order Support",
      stages: stages([
        {
          id: "placed",
          name: "Order placed",
          description: "Order placed via web or app",
          touchpoints: ["web", "app"],
        },
        {
          id: "fulfillment",
          name: "Fulfillment",
          description: "Order fulfilled from warehouse",
          touchpoints: ["backoffice", "sms"],
        },
        {
          id: "inquiry",
          name: "Inquiry",
          description: "Customer inquires about status via chat or phone",
          touchpoints: ["chat", "phone", "agent"],
        },
        {
          id: "resolved",
          name: "Resolved",
          description: "Inquiry resolved",
          touchpoints: ["app", "email"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "retention",
      provenance: p,
      name: "Retention",
      stages: stages([
        {
          id: "at_risk",
          name: "At risk",
          description: "Churn risk detected via behavior or feedback",
          touchpoints: ["app", "backoffice"],
        },
        {
          id: "offered",
          name: "Offered",
          description: "Personalized retention offer presented",
          touchpoints: ["app", "email", "chat", "agent"],
        },
        {
          id: "accepted",
          name: "Accepted",
          description: "Customer accepts offer",
          touchpoints: ["app", "retail"],
        },
        {
          id: "retained",
          name: "Retained",
          description: "Customer retained, loyalty updated",
          touchpoints: ["app", "sms"],
        },
      ]),
    },
  ];

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: p,
    title: `Retail CX architecture — ${spec.state.name}`,
    markdown: [
      `# Retail CX architecture: ${spec.state.name}`,
      ``,
      `## Journeys`,
      ...journeys.map((j) => `- **${j.id}** — ${j.name}`),
      ``,
      `## Channels`,
      `web, app, retail, POS, chat, phone, backoffice, billing`,
    ].join("\n"),
  };

  return [...journeys, architectureDoc];
}
