/**
 * Financial design pack for CXOS — generic retail bank / financial services.
 * Journeys: account_inquiry, loan_support, fraud_alert, onboarding, retention.
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

export function seedFinancialDesignPack(spec: CxSpec, _ontology: CxOntology): CxArtifact[] {
  const p = prov(spec.state.name);
  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "account_inquiry",
      provenance: p,
      name: "Account Inquiry",
      stages: stages([
        { id: "initiated", name: "Inquiry initiated", description: "Customer inquires via app, web, or phone", touchpoints: ["app", "web", "phone", "chat"] },
        { id: "validated", name: "Validated", description: "Identity and account validated", touchpoints: ["agent", "backoffice"] },
        { id: "resolved", name: "Resolved", description: "Inquiry answered", touchpoints: ["app", "email", "sms"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "loan_support",
      provenance: p,
      name: "Loan Support",
      stages: stages([
        { id: "applied", name: "Applied", description: "Loan application submitted", touchpoints: ["web", "app"] },
        { id: "under_review", name: "Under review", description: "Credit and documents reviewed", touchpoints: ["backoffice", "agent"] },
        { id: "approved", name: "Approved", description: "Loan approved", touchpoints: ["email", "app", "sms"] },
        { id: "disbursed", name: "Disbursed", description: "Funds disbursed", touchpoints: ["billing_system", "sms"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "fraud_alert",
      provenance: p,
      name: "Fraud Alert",
      stages: stages([
        { id: "alerted", name: "Alerted", description: "Fraud system flags transaction", touchpoints: ["backoffice", "sms", "app"] },
        { id: "verified", name: "Verified", description: "Customer verifies via phone or app", touchpoints: ["phone", "app", "agent"] },
        { id: "resolved", name: "Resolved", description: "Fraud confirmed or cleared", touchpoints: ["app", "email"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "onboarding",
      provenance: p,
      name: "Onboarding (KYC)",
      stages: stages([
        { id: "started", name: "Started", description: "Application started", touchpoints: ["web", "app"] },
        { id: "kyc", name: "KYC", description: "Identity verified", touchpoints: ["backoffice", "agent"] },
        { id: "approved", name: "Approved", description: "Account approved", touchpoints: ["email", "app"] },
        { id: "active", name: "Active", description: "Account active", touchpoints: ["app", "sms"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "retention",
      provenance: p,
      name: "Retention",
      stages: stages([
        { id: "at_risk", name: "At risk", description: "Churn risk detected", touchpoints: ["app", "backoffice"] },
        { id: "offered", name: "Offered", description: "Retention offer presented", touchpoints: ["app", "email", "chat"] },
        { id: "retained", name: "Retained", description: "Customer retained", touchpoints: ["app", "sms"] },
      ]),
    },
  ];

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: p,
    title: `Financial CX architecture — ${spec.state.name}`,
    markdown: [
      `# Financial CX architecture: ${spec.state.name}`,
      ``,
      `## Journeys`,
      ...journeys.map((j) => `- **${j.id}** — ${j.name}`),
      ``,
      `## Channels`,
      `web, app, phone, chat, backoffice, billing`,
    ].join("\n"),
  };

  return [...journeys, architectureDoc];
}
