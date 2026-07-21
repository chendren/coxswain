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
    const outcome = await classify(deps.classifyModel(), input.text);
    // TODO(task 10, R2.5/R2.6): ledger the classify call when usage arrived.

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
    return { tier, model, reasons, estimate };
  }

  async function reconsider(
    _current: RoutingDecision,
    _input: RoutingInput,
    _signals: EscalationSignal[],
  ): Promise<RoutingDecision | null> {
    // TODO(task 12/13, R4.*): escalation ladder.
    return null;
  }

  return { route, reconsider };
}
