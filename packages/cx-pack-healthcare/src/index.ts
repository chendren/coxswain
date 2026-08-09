/**
 * Healthcare design pack for CXOS — generic provider / payer.
 * Journeys: appointment, claims, prior_auth, benefits, retention. HIPAA-aware (no PHI in ontology).
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

export function seedHealthcareDesignPack(spec: CxSpec, _ontology: CxOntology): CxArtifact[] {
  const p = prov(spec.state.name);
  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "appointment",
      provenance: p,
      name: "Appointment Scheduling",
      stages: stages([
        { id: "requested", name: "Requested", description: "Patient requests appointment via portal or phone", touchpoints: ["web", "app", "phone"] },
        { id: "scheduled", name: "Scheduled", description: "Appointment scheduled", touchpoints: ["backoffice", "sms", "email"] },
        { id: "confirmed", name: "Confirmed", description: "Patient confirmed", touchpoints: ["sms", "app"] },
        { id: "completed", name: "Completed", description: "Visit completed", touchpoints: ["retail", "app"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "claims",
      provenance: p,
      name: "Claims",
      stages: stages([
        { id: "submitted", name: "Submitted", description: "Claim submitted", touchpoints: ["web", "app", "backoffice"] },
        { id: "adjudicated", name: "Adjudicated", description: "Claim adjudicated", touchpoints: ["backoffice", "agent"] },
        { id: "paid", name: "Paid", description: "Claim paid", touchpoints: ["billing_system", "email"] },
        { id: "appealed", name: "Appealed", description: "Claim appealed if needed", touchpoints: ["chat", "phone"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "prior_auth",
      provenance: p,
      name: "Prior Authorization",
      stages: stages([
        { id: "requested", name: "Requested", description: "Prior auth requested", touchpoints: ["web", "app", "backoffice"] },
        { id: "reviewed", name: "Reviewed", description: "Clinical review", touchpoints: ["backoffice", "agent"] },
        { id: "approved", name: "Approved", description: "Auth approved", touchpoints: ["email", "app", "sms"] },
        { id: "denied", name: "Denied", description: "Auth denied with reason", touchpoints: ["app", "chat"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "benefits",
      provenance: p,
      name: "Benefits Inquiry",
      stages: stages([
        { id: "inquired", name: "Inquired", description: "Member inquires about benefits", touchpoints: ["app", "chat", "phone"] },
        { id: "verified", name: "Verified", description: "Eligibility verified", touchpoints: ["backoffice", "agent"] },
        { id: "explained", name: "Explained", description: "Benefits explained", touchpoints: ["app", "email"] },
      ]),
    },
    {
      kind: "journeyMap",
      id: "retention",
      provenance: p,
      name: "Retention",
      stages: stages([
        { id: "at_risk", name: "At risk", description: "Member churn risk", touchpoints: ["app", "backoffice"] },
        { id: "engaged", name: "Engaged", description: "Proactive outreach", touchpoints: ["app", "sms", "chat"] },
        { id: "retained", name: "Retained", description: "Member retained", touchpoints: ["app", "sms"] },
      ]),
    },
  ];

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: p,
    title: `Healthcare CX architecture — ${spec.state.name}`,
    markdown: [
      `# Healthcare CX architecture: ${spec.state.name}`,
      ``,
      `## Journeys`,
      ...journeys.map((j) => `- **${j.id}** — ${j.name}`),
      ``,
      `## Channels`,
      `web, app, phone, chat, backoffice, billing`,
      ``,
      `## Note`,
      `HIPAA-aware: no PHI in ontology, strong graph only.`,
    ].join("\n"),
  };

  return [...journeys, architectureDoc];
}
