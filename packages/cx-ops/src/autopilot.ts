/**
 * Graph Autopilot — closed-world operate from language.
 *
 * Path: load_strong → route_retrieval → score_intents → resolve_nba
 *        → recommend_nba → compose_proposal → [persist|dry_run] → emit
 *
 * Zero model calls. Never mutates adapters or production.
 */
import type { CxNbaContext, CxOntology, CxSpec, CxTargetId } from "@cox/cx-core";
import {
  DEFAULT_ONTOLOGY,
  routeRetrieval,
  scoreIntents,
  type IntentScore,
  type RetrievalRoute,
} from "@cox/cx-core";
import {
  appendProposalsFromTick,
  type CxProposal,
  type ProposalStoreDeps,
} from "./proposals.js";
import type { ConsoleProposal, ConsoleProposalKind } from "./console.js";
import { opsRecommendNba, resolveNbaContextFromSpec, type NbaRecommendResult } from "./nba.js";

export interface AutopilotInput {
  /** Customer / operator free text (closed-world intent scored). */
  utterance?: string;
  /** Explicit NBA context overrides (journey=, stage=, confidence=). */
  nbaContext?: CxNbaContext;
  /** Target id for proposal (default local). */
  targetId?: CxTargetId;
  /** When true, persist open proposal (still human-gated). Default false (dry-run). */
  apply?: boolean;
  /** Ontology already resolved. */
  ontology?: CxOntology;
  /** Spec record for journey defaults (optional). */
  spec?: CxSpec | null;
  /** Actor label for audit notes in summary. */
  actor?: string;
}

export interface AutopilotResult {
  path: string[];
  route: RetrievalRoute;
  intents: IntentScore[];
  primaryIntent?: IntentScore;
  nba: NbaRecommendResult;
  proposal?: ConsoleProposal;
  persisted?: CxProposal[];
  skipped: number;
  dryRun: boolean;
  summary: string;
}

function kindFromNba(nba: NbaRecommendResult): ConsoleProposalKind {
  const action = nba.primary?.actionType ?? nba.primary?.action ?? "";
  const a = String(action).toLowerCase();
  if (a.includes("remediat") || a.includes("fix") || a.includes("repair")) {
    return "remediate";
  }
  if (a.includes("scale")) return "scale";
  if (nba.primary) return "investigate";
  return "none";
}

/**
 * Enrich NBA context from closed-world intent so catalog rules can fire.
 * Still only uses ontology ids — never free invent.
 */
function mergeContext(
  base: CxNbaContext,
  intent?: IntentScore,
  overrides?: CxNbaContext,
): CxNbaContext {
  const ctx: CxNbaContext = { ...base };
  if (intent) {
    ctx.intent = intent.intentId;
    ctx.domain = intent.domainId;
    if (ctx.confidence === undefined) {
      ctx.confidence = Math.min(0.95, Math.max(0.4, intent.score / 100));
    }
    // Domain-guided journey/context defaults (catalog-aligned)
    if (intent.domainId === "billing" || intent.intentId.startsWith("billing.")) {
      if (ctx.journey === undefined) ctx.journey = "billing_dispute";
      if (ctx.stage === undefined) ctx.stage = "under_review";
      if (ctx.sla_status === undefined) ctx.sla_status = "at_risk";
    }
    if (intent.domainId === "technical_support" || intent.intentId.startsWith("technical")) {
      if (ctx.domain === undefined) ctx.domain = "technical_support";
      if (ctx.previous_interactions === undefined) ctx.previous_interactions = 4;
    }
    if (intent.intentId.includes("complaint") || intent.name.toLowerCase().includes("complaint")) {
      ctx.intent = "general.complaint";
    }
    if (intent.domainId === "retention" || intent.intentId.includes("churn")) {
      if (ctx.journey === undefined) ctx.journey = "churn_prevention";
      if (ctx.stage === undefined) ctx.stage = "cancel_requested";
    }
  }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      ctx[k] = v;
    }
  }
  return ctx;
}

/**
 * Run closed-world Graph Autopilot for one spec namespace.
 * Dry-run by default: composes proposal without writing.
 */
export async function runGraphAutopilot(
  deps: ProposalStoreDeps,
  specName: string,
  input: AutopilotInput = {},
): Promise<AutopilotResult> {
  const path: string[] = ["load_strong"];
  const ontology = input.ontology ?? DEFAULT_ONTOLOGY;
  const utterance = (input.utterance ?? "").trim();
  const dryRun = input.apply !== true;
  const targetId: CxTargetId = input.targetId ?? "local";

  path.push("route_retrieval");
  const route = utterance
    ? routeRetrieval(utterance, { closedWorldAvailable: true })
    : routeRetrieval("nba recommend", {
        closedWorldAvailable: true,
        multiHopLanguage: false,
      });

  if (route.mode === "refuse" && utterance) {
    path.push("fail");
    return {
      path,
      route,
      intents: [],
      nba: { path: ["emit"], rules: [] },
      skipped: 0,
      dryRun,
      summary: `refused: ${route.reason}`,
    };
  }

  path.push("score_intents");
  const intents = utterance ? scoreIntents(ontology, utterance, 8) : [];
  const primaryIntent = intents[0];

  path.push("resolve_nba_context");
  let baseCtx: CxNbaContext;
  if (input.spec) {
    baseCtx = resolveNbaContextFromSpec(input.spec, ontology);
  } else {
    baseCtx = { journey: "billing_dispute", stage: "under_review", confidence: 0.75 };
  }
  const nbaContext = mergeContext(baseCtx, primaryIntent, input.nbaContext);

  path.push("recommend_nba");
  const nba = opsRecommendNba(nbaContext, ontology);
  for (const p of nba.path) {
    if (p !== "load_strong" && p !== "emit" && !path.includes(p)) path.push(p);
  }

  path.push("compose_proposal");
  const kind = kindFromNba(nba);
  const actor = input.actor?.trim();
  const intentBit = primaryIntent
    ? `intent=${primaryIntent.intentId} (score ${primaryIntent.score})`
    : "intent=none";
  const nbaBit = nba.primary
    ? `nba=${nba.primary.id} action=${nba.primary.action}`
    : "nba=none";
  const summaryParts = [
    utterance ? `utterance: ${utterance.slice(0, 120)}` : "utterance: (none)",
    intentBit,
    nbaBit,
    actor ? `actor=${actor}` : undefined,
  ].filter(Boolean) as string[];

  // With a scored closed-world intent, always surface human-gated work
  // (investigate) even when no NBA rule fires.
  const hasWork = Boolean(nba.primary) || Boolean(primaryIntent);
  const proposal: ConsoleProposal = !hasWork
    ? {
        targetId,
        kind: "none",
        summary: `No closed-world action for this input (${intentBit})`,
        path: [...path, "emit"],
      }
    : {
        targetId,
        kind: kind === "none" ? "investigate" : kind,
        summary: summaryParts.join(" · "),
        nba: nba.primary
          ? { rules: nba.rules, primary: nba.primary }
          : undefined,
        path: [...path, "emit"],
      };

  let persisted: CxProposal[] | undefined;
  let skipped = 0;
  if (!dryRun && proposal.kind !== "none") {
    path.push("persist");
    const res = await appendProposalsFromTick(deps, specName, [proposal]);
    persisted = res.added;
    skipped = res.skipped;
  } else {
    path.push("dry_run");
  }

  path.push("emit");

  const summary = dryRun
    ? `dry-run: would open ${proposal.kind} proposal (${intentBit}; ${nbaBit})`
    : persisted && persisted.length > 0
      ? `opened ${persisted.length} proposal(s): ${persisted.map((p) => p.id).join(", ")}`
      : skipped > 0
        ? `skipped ${skipped} duplicate open proposal(s)`
        : `no proposal persisted (${proposal.kind})`;

  return {
    path,
    route,
    intents,
    primaryIntent,
    nba,
    proposal,
    persisted,
    skipped,
    dryRun,
    summary,
  };
}
