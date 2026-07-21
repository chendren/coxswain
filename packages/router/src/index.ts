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
    const { tier, reasons } = await resolveTier(input);
    const model = deps.config.tiers[tier].primary;
    return {
      tier,
      model,
      reasons,
      // TODO(task 7, R5.*): real pre-call estimate via buildEstimate.
      estimate: { inputTokens: 0, estOutputTokens: 0, estCostUsd: null },
    };
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
