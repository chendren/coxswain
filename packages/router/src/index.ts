import { computeCostUsd, pricingFor } from "@cox/core";
import type {
  ChatModel,
  CoxConfig,
  EscalationSignal,
  Ledger,
  Router,
  RoutingDecision,
  RoutingInput,
  Tier,
} from "@cox/core";
import { resolveStaticTier, mapClassifiedTier } from "./policy";
import { buildEstimate } from "./estimate";
import { classify } from "./classify";
import { applyGovernor } from "./governor";
import { shouldEscalate } from "./escalate";

const TIER_STEP: Record<Tier, Tier | null> = {
  scout: "builder",
  builder: "architect",
  architect: null,
};

export interface RouterDeps {
  config: CoxConfig;
  ledger: Ledger;
  /** Lazily resolves the scout primary model; cli wires the real provider. */
  classifyModel: () => ChatModel;
  /** ISO-8601 UTC clock, injected for determinism. */
  now: () => string;
}

interface TierResolution {
  tier: Tier;
  reasons: string[];
  estOutputTokens?: number;
}

export function createRouter(deps: RouterDeps): Router {
  async function resolveTier(input: RoutingInput): Promise<TierResolution> {
    const staticRes = resolveStaticTier(input, deps.config);
    if (staticRes) return staticRes;

    // kind === "chat" with no override: disabled -> default tier (R1.5).
    if (!deps.config.routing.classifyWithScout) {
      return { tier: deps.config.routing.defaultTier, reasons: ["default tier"] };
    }

    // Scout classification (R1.4, R2.1-R2.4).
    const classifyModel = deps.classifyModel();
    const startedAt = Date.now();
    const outcome = await classify(classifyModel, input.text);
    const durationMs = Date.now() - startedAt;

    // R2.5: ledger the call whenever a usage event arrived, regardless of
    // parse success — classify overhead is counted even when it fails.
    if (outcome.usage) {
      const pricing = pricingFor(classifyModel.ref.provider, classifyModel.ref.model);
      const costUsd = pricing ? computeCostUsd(outcome.usage, pricing) : null;
      await deps.ledger.record({
        ts: deps.now(),
        sessionId: input.sessionId,
        kind: "classify",
        specName: input.specName,
        taskId: input.taskId,
        tier: "scout",
        model: classifyModel.ref,
        usage: outcome.usage,
        costUsd,
        routingReasons: ["classification call"],
        durationMs,
      });
    }

    if (!outcome.parsed) {
      return { tier: deps.config.routing.defaultTier, reasons: ["classification failed"] };
    }
    const mapped = mapClassifiedTier(outcome.parsed);
    return {
      tier: mapped.tier,
      reasons: mapped.reasons,
      estOutputTokens: outcome.parsed.estOutputTokens,
    };
  }

  async function route(input: RoutingInput): Promise<RoutingDecision> {
    const { tier, reasons, estOutputTokens } = await resolveTier(input);
    const model = deps.config.tiers[tier].primary;
    const estimate = buildEstimate(input, model, deps.classifyModel(), estOutputTokens);

    // R3.1: budget state is fetched fresh before every decision is returned.
    const state = await deps.ledger.budgetState(input.sessionId, input.specName);
    return applyGovernor({ tier, model, reasons, estimate }, state, deps.config, input.kind);
  }

  async function reconsider(
    current: RoutingDecision,
    input: RoutingInput,
    signals: EscalationSignal[],
  ): Promise<RoutingDecision | null> {
    if (!deps.config.routing.escalation.enabled) return null; // R4.1

    // R4.4: one escalation per task; architect is terminal.
    if (current.tier === "architect" || current.escalatedFrom !== undefined) {
      return null;
    }

    const evidence = shouldEscalate(signals, deps.config);
    if (!evidence) return null;

    const nextTier = TIER_STEP[current.tier];
    if (!nextTier) return null; // unreachable given the R4.4 guard above; typechecks the map.

    const nextModel = deps.config.tiers[nextTier].primary;
    const reason = `escalated ${current.tier}→${nextTier}: ${evidence}`; // R4.3
    const estimate = buildEstimate(input, nextModel, deps.classifyModel());

    const state = await deps.ledger.budgetState(input.sessionId, input.specName);
    const governed = applyGovernor(
      { tier: nextTier, model: nextModel, reasons: [reason], estimate, escalatedFrom: current.tier },
      state,
      deps.config,
      input.kind,
    );

    // R4.5: if governance degraded the escalated tier straight back to
    // where we started, that's a no-op — return null instead.
    if (governed.tier === current.tier) return null;
    return governed;
  }

  return { route, reconsider };
}
