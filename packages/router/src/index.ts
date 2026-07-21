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
import { resolveStaticTier } from "./policy";
import { buildEstimate } from "./estimate";

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

    // kind === "chat" with no override: scout classification (R1.4, tasks
    // 8/9) or the disabled/default path (R1.5). Classification itself lands
    // in classify.ts; until then this always takes the failure path.
    if (!deps.config.routing.classifyWithScout) {
      return { tier: deps.config.routing.defaultTier, reasons: ["default tier"] };
    }
    return { tier: deps.config.routing.defaultTier, reasons: ["classification failed"] };
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
