/**
 * Synthetic neutral telco design pack for offline CXOS artifacts.
 * Grounded in closed-world ontology journeys (billing, tech, churn, setup, upgrade).
 * Platform-neutral: no vendor product names; channel-agnostic touchpoints.
 */
import type {
  CxArchitectureDoc,
  CxArtifact,
  CxSpec,
  IntentTaxonomy,
  JourneyMap,
  KpiFrame,
  NbaRuleSet,
  Persona,
  CxOntology,
} from "@cox/cx-core";
import { listIntentIds, listKpiIds } from "@cox/cx-core";

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

/** Detect telco / communications CSP idea language. */
export function isTelcoIdea(text: string): boolean {
  const t = text.toLowerCase();
  const keys = [
    "telco",
    "telecom",
    "telecommunications",
    "mobile",
    "wireless",
    "broadband",
    "fiber",
    "5g",
    "carrier",
    "mvno",
    "isp",
    "connectivity",
    "outage",
    "sim ",
    "handset",
    "roaming",
    "prepaid",
    "postpaid",
    "wireline",
    "cable",
  ];
  return keys.some((k) => t.includes(k));
}

/**
 * Full synthetic pack: multi journey maps, multi personas, telco architecture.
 * Journey ids align with ontology catalog where possible.
 */
export function seedTelcoDesignPack(spec: CxSpec, ontology: CxOntology): CxArtifact[] {
  const p = prov(spec.state.name);
  const idea =
    spec.requirements.map((r) => r.text).join(" ") ||
    (spec as { idea?: string }).idea ||
    spec.state.name;

  const journeys: JourneyMap[] = [
    {
      kind: "journeyMap",
      id: "billing_dispute",
      provenance: p,
      name: "Billing Dispute Resolution",
      stages: stages([
        {
          id: "initiated",
          name: "Dispute initiated",
          description: "Subscriber contests a charge via IVR, app, chat, or retail",
          touchpoints: ["phone", "app", "chat", "retail"],
        },
        {
          id: "under_review",
          name: "Under review",
          description: "Usage and rating events validated against plan and promos",
          touchpoints: ["agent", "backoffice"],
        },
        {
          id: "refund_processing",
          name: "Adjustment processing",
          description: "Approved credit or rebill applied to account",
          touchpoints: ["billing_system", "sms"],
        },
        {
          id: "escalated",
          name: "Escalated",
          description: "Complex case to retention or fraud queue",
          touchpoints: ["agent", "supervisor"],
        },
        {
          id: "resolved",
          name: "Resolved",
          description: "Subscriber accepts outcome; case closed",
          touchpoints: ["app", "email", "sms"],
        },
        {
          id: "abandoned",
          name: "Abandoned",
          description: "Subscriber drops without resolution",
          touchpoints: ["chat", "phone"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "technical_troubleshooting",
      provenance: p,
      name: "Connectivity Troubleshooting",
      stages: stages([
        {
          id: "reported",
          name: "Issue reported",
          description: "No service, slow data, or device failure reported",
          touchpoints: ["phone", "app", "chat"],
        },
        {
          id: "diagnosing",
          name: "Diagnosing",
          description: "Line test, tower/region health, CPE/modem checks",
          touchpoints: ["agent", "network_ops"],
        },
        {
          id: "waiting_for_fix",
          name: "Waiting for fix",
          description: "Truck roll, remote reset, or network change pending",
          touchpoints: ["field", "sms"],
        },
        {
          id: "follow_up",
          name: "Follow up",
          description: "Confirm service restored with subscriber",
          touchpoints: ["phone", "app"],
        },
        {
          id: "escalated",
          name: "Escalated",
          description: "NOC / tier-3 for regional outage or complex CPE",
          touchpoints: ["noc", "supervisor"],
        },
        {
          id: "resolved",
          name: "Resolved",
          description: "Service restored or workaround accepted",
          touchpoints: ["app", "sms"],
        },
        {
          id: "abandoned",
          name: "Abandoned",
          description: "Customer exits without confirmation",
          touchpoints: ["chat"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "churn_prevention",
      provenance: p,
      name: "Churn Prevention / Save",
      stages: stages([
        {
          id: "cancel_requested",
          name: "Cancel requested",
          description: "Subscriber signals intent to leave (port-out or cancel)",
          touchpoints: ["phone", "chat", "retail"],
        },
        {
          id: "reason_captured",
          name: "Reason captured",
          description: "Price, coverage, competitor, or life-event reason coded",
          touchpoints: ["agent", "app"],
        },
        {
          id: "offer_presented",
          name: "Save offer presented",
          description: "Closed-world NBA offer within policy guardrails",
          touchpoints: ["agent", "app"],
        },
        {
          id: "cooling_off",
          name: "Cooling off",
          description: "Subscriber considers offer; follow-up scheduled",
          touchpoints: ["sms", "email"],
        },
        {
          id: "retained",
          name: "Retained",
          description: "Offer accepted; plan change or credit applied",
          touchpoints: ["billing_system", "app"],
        },
        {
          id: "cancelled",
          name: "Cancelled",
          description: "Port-out or disconnect completed",
          touchpoints: ["billing_system", "sms"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "new_account_setup",
      provenance: p,
      name: "New Line / Account Activation",
      stages: stages([
        {
          id: "started",
          name: "Order started",
          description: "New postpaid/prepaid order in digital or retail",
          touchpoints: ["app", "web", "retail"],
        },
        {
          id: "identity_verified",
          name: "Identity verified",
          description: "KYC / credit / eligibility checks complete",
          touchpoints: ["backoffice", "app"],
        },
        {
          id: "provisioning",
          name: "Provisioning",
          description: "SIM/eSIM, number, and plan profile provisioned",
          touchpoints: ["provisioning", "sms"],
        },
        {
          id: "device_setup",
          name: "Device setup",
          description: "Handset or CPE activated; first-use guidance",
          touchpoints: ["app", "retail", "chat"],
        },
        {
          id: "active",
          name: "Active",
          description: "Line live; welcome and first-bill education",
          touchpoints: ["app", "email", "sms"],
        },
        {
          id: "abandoned",
          name: "Abandoned",
          description: "Order incomplete or cancelled pre-activation",
          touchpoints: ["web", "app"],
        },
      ]),
    },
    {
      kind: "journeyMap",
      id: "service_upgrade",
      provenance: p,
      name: "Plan Change / Upgrade",
      stages: stages([
        {
          id: "browsing",
          name: "Browsing plans",
          description: "Subscriber compares rates, data, device promos",
          touchpoints: ["app", "web", "retail"],
        },
        {
          id: "quote",
          name: "Quote",
          description: "Prorate and promo eligibility calculated",
          touchpoints: ["agent", "app"],
        },
        {
          id: "committed",
          name: "Committed",
          description: "Change order accepted; cooling-off if required",
          touchpoints: ["app", "sms"],
        },
        {
          id: "provisioned",
          name: "Provisioned",
          description: "Rating and entitlements updated mid-cycle",
          touchpoints: ["billing_system", "provisioning"],
        },
        {
          id: "completed",
          name: "Completed",
          description: "Confirmation and first-cycle bill preview",
          touchpoints: ["app", "email"],
        },
        {
          id: "abandoned",
          name: "Abandoned",
          description: "Customer backs out before commit",
          touchpoints: ["web", "chat"],
        },
      ]),
    },
  ];

  const personas: Persona[] = [
    {
      kind: "persona",
      id: "persona_price_sensitive_mobile",
      provenance: p,
      name: "Price-sensitive mobile subscriber",
      goals: [
        "Predictable monthly bill",
        "Easy plan comparison",
        "Fast dispute resolution without store visit",
      ],
      painPoints: [
        "Surprise overage and promo cliffs",
        "Long hold times for billing questions",
        "Conflicting digital vs agent offers",
      ],
    },
    {
      kind: "persona",
      id: "persona_sme_owner",
      provenance: p,
      name: "Small business multi-line owner",
      goals: [
        "Keep lines online for field staff",
        "One bill and one admin contact",
        "Fast restore during outages",
      ],
      painPoints: [
        "Per-line friction for adds/changes",
        "Unclear SLA when multiple sites fail",
        "Repeat authentication across channels",
      ],
    },
    {
      kind: "persona",
      id: "persona_fiber_home",
      provenance: p,
      name: "Home broadband decision maker",
      goals: [
        "Stable Wi-Fi for work and streaming",
        "Transparent install and truck windows",
        "Self-serve modem reboot that works",
      ],
      painPoints: [
        "Missed install appointments",
        "Finger-pointing between Wi-Fi and access network",
        "Slow callback after ticket open",
      ],
    },
    {
      kind: "persona",
      id: "persona_churn_risk",
      provenance: p,
      name: "Churn-risk postpaid subscriber",
      goals: [
        "Feel valued with a fair save offer",
        "Keep number and device financing intact",
        "Exit cleanly if coverage remains poor",
      ],
      painPoints: [
        "Win-back offers worse than new-customer promos",
        "Coverage issues dismissed as device fault",
        "Port-out friction and surprise ETFs",
      ],
    },
  ];

  const telcoDomains = ["billing", "technical_support", "account", "sales"].filter((d) =>
    ontology.domains.some((x) => x.id === d),
  );
  const domainIds =
    telcoDomains.length > 0 ? telcoDomains : ontology.domains.slice(0, 4).map((d) => d.id);

  const intentTaxonomy: IntentTaxonomy = {
    kind: "intentTaxonomy",
    id: "intentTaxonomy",
    provenance: p,
    domains: domainIds.map((did) => {
      const def = ontology.domains.find((d) => d.id === did);
      const intents = listIntentIds(ontology)
        .filter((i) => i.startsWith(`${did}.`))
        .map((full) => {
          const local = full.slice(full.indexOf(".") + 1);
          const intentDef = def?.intents.find((x) => x.id === local);
          return {
            id: local,
            name: intentDef?.name ?? local,
            description: intentDef?.description,
          };
        });
      return {
        id: did,
        name: def?.name ?? did,
        intents:
          intents.length > 0
            ? intents
            : [{ id: "general", name: "General" }],
      };
    }),
  };

  const nbaRuleSet: NbaRuleSet = {
    kind: "nbaRuleSet",
    id: "nbaRuleSet",
    provenance: p,
    rules: ontology.nbaRules.slice(0, 12).map((r) => ({
      id: r.id,
      condition: r.conditions
        .map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value)}`)
        .join(` ${r.logic} `),
      action: r.action,
      priority: r.priority,
    })),
  };

  const preferredKpis = [
    "sla_compliance_rate",
    "avg_wait_time",
    "deflection_rate",
    "total_contacts",
    "csat",
    "first_contact_resolution",
  ];
  const kpiIds = [
    ...preferredKpis.filter((id) => ontology.kpis.some((k) => k.id === id)),
    ...listKpiIds(ontology).filter((id) => !preferredKpis.includes(id)),
  ].slice(0, 8);

  const kpiFrame: KpiFrame = {
    kind: "kpiFrame",
    id: "kpiFrame",
    provenance: p,
    metrics: kpiIds.map((id, i) => {
      const def = ontology.kpis.find((k) => k.id === id);
      const unit = String(def?.unit ?? "count");
      const rateLike = unit === "percent" || id.includes("rate") || id === "csat";
      return {
        name: id,
        target: rateLike ? 90 - i : 100 + i * 10,
        unit,
      };
    }),
  };

  const architectureDoc: CxArchitectureDoc = {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: p,
    title: `Telco CX architecture — ${spec.state.name}`,
    markdown: [
      `# Telco CX architecture: ${spec.state.name}`,
      ``,
      `## Program idea`,
      idea,
      ``,
      `## Positioning`,
      `Neutral, multi-channel customer experience design for a communications service`,
      `provider (mobile, broadband, or converged). Closed-world ontology`,
      `\`${ontology.version}\` / source \`${ontology.source}\`.`,
      ``,
      `## Journeys (strong catalog aligned)`,
      `- **billing_dispute** — charge inquiry, refund, rating disputes`,
      `- **technical_troubleshooting** — connectivity, device, app errors`,
      `- **churn_prevention** — cancel / port-out save path`,
      `- **new_account_setup** — activate new line or broadband`,
      `- **service_upgrade** — plan change with mid-cycle rating`,
      ``,
      `## Channels`,
      ontology.channels.map((c) => `- ${c}`).join("\n") || "- voice\n- chat\n- digital",
      ``,
      `## Logical building blocks (vendor-neutral)`,
      `1. **Engagement layer** — IVR, chat, app, retail POS, email/SMS`,
      `2. **Orchestration** — journey state, intent routing, NBA evaluate`,
      `3. **Knowledge & identity** — account, product, network status hubs`,
      `4. **Fulfillment** — provisioning, billing, field, NOC tickets`,
      `5. **Observe** — contact KPIs, journey health, human-gated remediations`,
      ``,
      `## AWS plan-only mapping (human apply)`,
      `- Amazon Connect + Lex for voice/chat entry`,
      `- Bedrock agent roles for weak generate (optional) with strong ontology guardrails`,
      `- No CreateStack from Coxswain; export CFN via \`cox cx export-aws\` / \`cab-export\``,
      ``,
      `## Local platform mapping`,
      `- Omnichannel platform journeys bound from design journey maps`,
      `- Status via ready/health; simulate for KPI smoke`,
      ``,
      `## Control plane (CXOS)`,
      `- Spec under \`.cox/cx/${spec.state.name}/\``,
      `- Human-gated proposals → tasks → remediations`,
      `- Offline-first artifacts; hybrid/live when stack ready`,
      ``,
      `## Non-goals`,
      `- Silent production mutation`,
      `- Open-world invented journeys outside the pack`,
      `- Automatic AWS deploy`,
      ``,
    ].join("\n"),
  };

  return [
    ...journeys,
    ...personas,
    intentTaxonomy,
    nbaRuleSet,
    kpiFrame,
    architectureDoc,
  ];
}
