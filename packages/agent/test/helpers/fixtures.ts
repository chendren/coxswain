import type {
  AgentTask,
  BudgetState,
  CoxConfig,
  ModelRef,
  PermissionDecision,
  PermissionRequest,
  Router,
  RoutingDecision,
  RoutingInput,
  Tier,
  Tool,
  ToolRegistry,
} from "@cox/core";
import { configSchema } from "@cox/core";

/** A Router that always returns `decision`, and `reconsiderResult` on reconsider(). */
export function fixedRouter(
  decision: RoutingDecision,
  reconsiderResult: RoutingDecision | null = null,
): Router {
  return {
    route: async (_input: RoutingInput) => decision,
    reconsider: async () => reconsiderResult,
  };
}

/** A Router that records every routing input it was called with. */
export function capturingRouter(decision: RoutingDecision): Router & { inputs: RoutingInput[] } {
  const inputs: RoutingInput[] = [];
  return {
    inputs,
    route: async (input: RoutingInput) => {
      inputs.push(input);
      return decision;
    },
    reconsider: async () => null,
  };
}

export function okBudget(): () => Promise<BudgetState> {
  return async () => ({ level: "ok", spentUsd: 0, spentTokens: 0 });
}

export function fixedBudget(state: BudgetState): () => Promise<BudgetState> {
  return async () => state;
}

export function emptyTools(): ToolRegistry {
  return { list: () => [], get: () => undefined };
}

export function toolRegistryFrom(tools: Tool[]): ToolRegistry {
  const byName = new Map(tools.map((t) => [t.spec.name, t] as const));
  return { list: () => tools, get: (n: string) => byName.get(n) };
}

/** A requestPermission that fails the test if it's ever actually invoked. */
export function neverAsked(): (req: PermissionRequest) => Promise<PermissionDecision> {
  return async (req: PermissionRequest) => {
    throw new Error(`unexpected permission request: ${req.summary}`);
  };
}

export function baseTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    kind: "chat",
    prompt: "hello",
    system: "you are cox",
    history: [],
    cwd: "/proj",
    sessionId: "s1",
    ...overrides,
  };
}

export const baseConfig: CoxConfig = configSchema.parse({});

export function decisionFor(tier: Tier, model: ModelRef = { provider: "test", model: "m1" }): RoutingDecision {
  return {
    tier,
    model,
    reasons: [`tier=${tier}`],
    estimate: { inputTokens: 100, estOutputTokens: 100, estCostUsd: null },
  };
}
