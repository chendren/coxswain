/**
 * Table-driven integration suite implementing design.md's fixture table
 * verbatim (§Table-driven test plan). Each row exercises route() (or
 * reconsider() for the two R4 rows) end-to-end against the base fixture:
 * { kind: "chat", text: "add a test", contextTokens: 1000, sessionId: "s1" },
 * default config, and a ledger stubbed with a controllable budgetState.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configSchema,
  type BudgetState,
  type EscalationSignal,
  type RoutingDecision,
  type RoutingInput,
  type Tier,
} from "@cox/core";
import { createRouter } from "../src/index";
import { createClassifyMockModel, createMockModel } from "./helpers/mockModel";
import { createStubLedger } from "./helpers/mockLedger";

const BASE_INPUT: RoutingInput = {
  kind: "chat",
  text: "add a test",
  contextTokens: 1000,
  sessionId: "s1",
};

const OK_BUDGET: BudgetState = { level: "ok", spentUsd: 0, spentTokens: 0 };

const WARN_84_BUDGET: BudgetState = {
  level: "warn",
  spentUsd: 4.2,
  spentTokens: 1000,
  limitUsd: 5,
  scope: "session",
};

const EXCEEDED_BUDGET: BudgetState = {
  level: "exceeded",
  spentUsd: 6,
  spentTokens: 1000,
  limitUsd: 5,
  scope: "session",
};

afterEach(() => {
  vi.useRealTimers();
});

interface RouteRow {
  id: string;
  description: string;
  inputDelta: Partial<RoutingInput>;
  budget: BudgetState;
  hardStop?: boolean;
  /** For chat rows: the classify model's scripted text_delta reply. */
  classifyResponse?: string;
  /** R2.4b: classify call never resolves; exercised with fake timers. */
  hang?: boolean;
  expect: { tier: Tier; reasonContains: string } | { throws: true };
}

// | id | RoutingInput (delta from base) | budget | expect tier | expect reason contains |
const ROUTE_ROWS: RouteRow[] = [
  {
    id: "R1.1",
    description: "userOverrideTier: architect, kind chat -> architect, 'user override (/model)'",
    inputDelta: { userOverrideTier: "architect", kind: "chat" },
    budget: OK_BUDGET,
    expect: { tier: "architect", reasonContains: "user override (/model)" },
  },
  {
    id: "R1.2",
    description: "hookOverrideTier: scout, kind chat -> scout, 'hook override'",
    inputDelta: { hookOverrideTier: "scout", kind: "chat" },
    budget: OK_BUDGET,
    expect: { tier: "scout", reasonContains: "hook override" },
  },
  {
    id: "R1.3a",
    description: "kind oneshot -> scout, 'policy oneshot'",
    inputDelta: { kind: "oneshot" },
    budget: OK_BUDGET,
    expect: { tier: "scout", reasonContains: "policy oneshot" },
  },
  {
    id: "R1.3b",
    description: "kind spec-design -> architect, 'policy spec-design'",
    inputDelta: { kind: "spec-design" },
    budget: OK_BUDGET,
    expect: { tier: "architect", reasonContains: "policy spec-design" },
  },
  {
    id: "R1.3c",
    description: "kind spec-task-exec, complexityHint 1 -> scout, 'complexity=1 from spec task'",
    inputDelta: { kind: "spec-task-exec", complexityHint: 1 },
    budget: OK_BUDGET,
    expect: { tier: "scout", reasonContains: "complexity=1 from spec task" },
  },
  {
    id: "R1.3d",
    description: "kind spec-task-exec, complexityHint 5 -> architect, 'policy spec-task-exec'",
    inputDelta: { kind: "spec-task-exec", complexityHint: 5 },
    budget: OK_BUDGET,
    expect: { tier: "architect", reasonContains: "policy spec-task-exec" },
  },
  {
    id: "R1.3e",
    description: "kind spec-task-exec, no hint -> builder, 'policy spec-task-exec'",
    inputDelta: { kind: "spec-task-exec" },
    budget: OK_BUDGET,
    expect: { tier: "builder", reasonContains: "policy spec-task-exec" },
  },
  {
    id: "R2.3a",
    description: "chat; mock replies feature/2 -> builder, 'classified task-type=feature'",
    inputDelta: { kind: "chat" },
    budget: OK_BUDGET,
    classifyResponse: '{"task_type":"feature","complexity":2,"est_output_tokens":500}',
    expect: { tier: "builder", reasonContains: "classified task-type=feature" },
  },
  {
    id: "R2.3b",
    description: "chat; mock replies question/4 (bump) -> builder, 'complexity=4'",
    inputDelta: { kind: "chat" },
    budget: OK_BUDGET,
    classifyResponse: '{"task_type":"question","complexity":4,"est_output_tokens":500}',
    expect: { tier: "builder", reasonContains: "complexity=4" },
  },
  {
    id: "R2.4a",
    description: "chat; mock replies garbage -> builder (default), 'classification failed'",
    inputDelta: { kind: "chat" },
    budget: OK_BUDGET,
    classifyResponse: "not json at all",
    expect: { tier: "builder", reasonContains: "classification failed" },
  },
  {
    id: "R2.4b",
    description: "chat; mock hangs > 3s (fake timers) -> builder, 'classification failed'",
    inputDelta: { kind: "chat" },
    budget: OK_BUDGET,
    hang: true,
    expect: { tier: "builder", reasonContains: "classification failed" },
  },
  {
    id: "R3.2",
    description: "kind spec-tasks, architect via override, warn 84% -> builder, 'degraded architect→builder'",
    inputDelta: { kind: "spec-tasks", userOverrideTier: "architect" },
    budget: WARN_84_BUDGET,
    expect: { tier: "builder", reasonContains: "degraded architect→builder" },
  },
  {
    id: "R3.3",
    description: "kind spec-design, warn -> builder (floor holds, never scout)",
    inputDelta: { kind: "spec-design" },
    budget: WARN_84_BUDGET,
    expect: { tier: "builder", reasonContains: "policy spec-design" },
  },
  {
    id: "R3.4",
    description: "any kind, exceeded + hardStop -> throws code 'budget_exceeded'",
    inputDelta: { kind: "oneshot" },
    budget: EXCEEDED_BUDGET,
    hardStop: true,
    expect: { throws: true },
  },
];

describe("table-driven fixture suite — route() rows", () => {
  for (const row of ROUTE_ROWS) {
    it(`${row.id}: ${row.description}`, async () => {
      const config = configSchema.parse({ budgets: { hardStop: row.hardStop ?? true } });
      const ledger = createStubLedger({ budgetState: row.budget });
      const model =
        row.classifyResponse !== undefined
          ? createClassifyMockModel(row.classifyResponse)
          : row.hang
            ? createMockModel({ hang: true })
            : createMockModel();

      const router = createRouter({
        config,
        ledger,
        classifyModel: () => model,
        now: () => "2026-07-20T12:00:00.000Z",
      });

      const routingInput: RoutingInput = { ...BASE_INPUT, ...row.inputDelta };

      if ("throws" in row.expect) {
        await expect(router.route(routingInput)).rejects.toMatchObject({
          code: "budget_exceeded",
        });
        return;
      }

      if (row.hang) {
        vi.useFakeTimers();
        const decisionPromise = router.route(routingInput);
        await vi.advanceTimersByTimeAsync(3100);
        const decision = await decisionPromise;
        expect(decision.tier).toBe(row.expect.tier);
        expect(decision.reasons.join(" | ")).toContain(row.expect.reasonContains);
        return;
      }

      const decision = await router.route(routingInput);
      expect(decision.tier).toBe(row.expect.tier);
      expect(decision.reasons.join(" | ")).toContain(row.expect.reasonContains);
    });
  }
});

describe("table-driven fixture suite — reconsider() rows", () => {
  function makeRouter(budget: BudgetState) {
    const config = configSchema.parse({ routing: { escalation: { enabled: true } } });
    const ledger = createStubLedger({ budgetState: budget });
    return createRouter({
      config,
      ledger,
      classifyModel: () => createMockModel(),
      now: () => "2026-07-20T12:00:00.000Z",
    });
  }

  it("R4.3: reconsider builder + verification_failed 2 -> architect, 'tests failed twice'", async () => {
    const router = makeRouter(OK_BUDGET);
    const current: RoutingDecision = {
      tier: "builder",
      model: configSchema.parse({}).tiers.builder.primary,
      reasons: ["policy chat"],
      estimate: { inputTokens: 1000, estOutputTokens: 1500, estCostUsd: 0.01 },
    };
    const signals: EscalationSignal[] = [{ type: "verification_failed", attempts: 2 }];

    const result = await router.reconsider(current, BASE_INPUT, signals);

    expect(result).not.toBeNull();
    expect(result!.tier).toBe("architect");
    expect(result!.reasons.join(" | ")).toContain("tests failed twice");
  });

  it("R4.4: reconsider w/ escalatedFrom set -> null", async () => {
    const router = makeRouter(OK_BUDGET);
    const current: RoutingDecision = {
      tier: "builder",
      model: configSchema.parse({}).tiers.builder.primary,
      reasons: ["escalated scout→builder: 3 consecutive tool errors"],
      estimate: { inputTokens: 1000, estOutputTokens: 1500, estCostUsd: 0.01 },
      escalatedFrom: "scout",
    };
    const signals: EscalationSignal[] = [{ type: "model_requested_help" }];

    const result = await router.reconsider(current, BASE_INPUT, signals);

    expect(result).toBeNull();
  });
});
