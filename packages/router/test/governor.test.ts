import { describe, expect, it } from "vitest";
import { configSchema, type BudgetState, type CoxConfig, type RoutingInput } from "@cox/core";
import { createRouter } from "../src/index";
import { createMockModel } from "./helpers/mockModel";
import { createStubLedger } from "./helpers/mockLedger";

function makeRouter(opts: {
  budgetState?: BudgetState | ((sessionId: string, specName?: string) => BudgetState);
  hardStop?: boolean;
} = {}) {
  const config: CoxConfig = configSchema.parse({
    budgets: { hardStop: opts.hardStop ?? true },
  });
  const ledger = createStubLedger({ budgetState: opts.budgetState });
  const router = createRouter({
    config,
    ledger,
    classifyModel: () => createMockModel(),
    now: () => "2026-07-20T12:00:00.000Z",
  });
  return { router, ledger, config };
}

const OK: BudgetState = { level: "ok", spentUsd: 0.01, spentTokens: 100 };

function input(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    kind: "oneshot",
    text: "explain this function",
    contextTokens: 500,
    sessionId: "s1",
    ...overrides,
  };
}

describe("budget governor (R3.1-R3.6)", () => {
  it("R3.1: fetches Ledger.budgetState(sessionId, specName) before returning a decision", async () => {
    let calledWith: [string, string | undefined] | null = null;
    const { router } = makeRouter({
      budgetState: (sessionId, specName) => {
        calledWith = [sessionId, specName];
        return OK;
      },
    });
    await router.route(input({ kind: "spec-design", sessionId: "sess-1", specName: "auth-flow" }));
    expect(calledWith).toEqual(["sess-1", "auth-flow"]);
  });

  it("R3.1: ok level leaves the decision untouched — no budget reasons, no degrade", async () => {
    const { router } = makeRouter({ budgetState: OK });
    const decision = await router.route(input({ kind: "spec-design" }));
    expect(decision.tier).toBe("architect");
    expect(decision.reasons).toEqual(["policy spec-design"]);
    expect(decision.degradedByBudget).toBeUndefined();
  });

  it("R3.2: warn + architect degrades to builder, degradedByBudget: true, pct reason", async () => {
    const { router, config } = makeRouter({
      budgetState: { level: "warn", spentUsd: 4.2, spentTokens: 1000, limitUsd: 5, scope: "session" },
    });
    const decision = await router.route(input({ kind: "spec-design" }));
    expect(decision.tier).toBe("builder");
    expect(decision.model).toEqual(config.tiers.builder.primary);
    expect(decision.degradedByBudget).toBe(true);
    expect(decision.reasons).toEqual([
      "policy spec-design",
      "budget 84% — degraded architect→builder",
    ]);
  });

  it("R3.3: spec-requirements under warn floors at builder (never below)", async () => {
    const { router } = makeRouter({
      budgetState: { level: "warn", spentUsd: 4.2, spentTokens: 1000, limitUsd: 5, scope: "session" },
    });
    const decision = await router.route(input({ kind: "spec-requirements" }));
    expect(decision.tier).toBe("builder");
  });

  it("R3.3: warn never touches an already-scout decision", async () => {
    const { router } = makeRouter({
      budgetState: { level: "warn", spentUsd: 4.2, spentTokens: 1000, limitUsd: 5, scope: "session" },
    });
    const decision = await router.route(input({ kind: "oneshot" })); // scout
    expect(decision.tier).toBe("scout");
    expect(decision.degradedByBudget).toBeUndefined();
    expect(decision.reasons.some((r) => r.startsWith("budget"))).toBe(false);
  });

  it("R3.3: warn never touches an already-builder decision", async () => {
    const { router } = makeRouter({
      budgetState: { level: "warn", spentUsd: 4.2, spentTokens: 1000, limitUsd: 5, scope: "session" },
    });
    const decision = await router.route(input({ kind: "spec-tasks" })); // builder
    expect(decision.tier).toBe("builder");
    expect(decision.degradedByBudget).toBeUndefined();
  });

  it("R3.4: exceeded + hardStop true throws an Error with code 'budget_exceeded'", async () => {
    const { router } = makeRouter({
      budgetState: { level: "exceeded", spentUsd: 5.5, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: true,
    });
    await expect(router.route(input())).rejects.toMatchObject({ code: "budget_exceeded" });
  });

  it("R3.4: the thrown error names the tripped scope and limit", async () => {
    const { router } = makeRouter({
      budgetState: { level: "exceeded", spentUsd: 5.5, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: true,
    });
    await expect(router.route(input())).rejects.toThrow(/session/);
  });

  it("R3.4: exceeded + hardStop false proceeds and appends 'budget exceeded — hardStop off'", async () => {
    const { router } = makeRouter({
      budgetState: { level: "exceeded", spentUsd: 5.5, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: false,
    });
    const decision = await router.route(input());
    expect(decision.tier).toBe("scout"); // policy tier unchanged — exceeded isn't a degrade
    expect(decision.reasons).toContain("budget exceeded — hardStop off");
  });

  it("R3.5: a projected overrun (spent + estimate) throws even when the ledger reports 'ok'", async () => {
    const { router } = makeRouter({
      budgetState: { level: "ok", spentUsd: 4.5, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: true,
    });
    await expect(
      router.route(
        input({
          kind: "spec-design", // architect; kind-default est_output_tokens=6000
          contextTokens: 100_000, // inflates the pre-call cost estimate
        }),
      ),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
  });

  it("R3.5: no projected overrun when spent + estimate stays comfortably under the limit", async () => {
    const { router } = makeRouter({
      budgetState: { level: "ok", spentUsd: 0.01, spentTokens: 100, limitUsd: 5, scope: "session" },
      hardStop: true,
    });
    const decision = await router.route(input());
    expect(decision.tier).toBe("scout");
    expect(decision.reasons.some((r) => r.includes("exceeded"))).toBe(false);
  });

  it("R3.6: never raises a tier — a scout decision under exceeded+hardStop-off stays scout", async () => {
    const { router } = makeRouter({
      budgetState: { level: "exceeded", spentUsd: 10, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: false,
    });
    const decision = await router.route(input({ kind: "oneshot" }));
    expect(decision.tier).toBe("scout");
  });

  it("R3.6: never raises a tier — a builder decision under exceeded+hardStop-off stays builder", async () => {
    const { router } = makeRouter({
      budgetState: { level: "exceeded", spentUsd: 10, spentTokens: 1000, limitUsd: 5, scope: "session" },
      hardStop: false,
    });
    const decision = await router.route(input({ kind: "spec-tasks" }));
    expect(decision.tier).toBe("builder");
  });
});
