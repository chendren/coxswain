import { describe, expect, it } from "vitest";
import {
  configSchema,
  type EscalationSignal,
  type RoutingDecision,
  type RoutingInput,
  type Tier,
} from "@cox/core";
import { shouldEscalate } from "../src/escalate";
import { createRouter } from "../src/index";
import { createMockModel } from "./helpers/mockModel";
import { createStubLedger } from "./helpers/mockLedger";

const DEFAULT_CONFIG = configSchema.parse({});

describe("shouldEscalate thresholds (R4.2)", () => {
  it("R4.2: tool_error_streak below threshold does not escalate", () => {
    expect(shouldEscalate([{ type: "tool_error_streak", count: 2 }], DEFAULT_CONFIG)).toBeNull();
  });

  it("R4.2: tool_error_streak at the configured threshold escalates with the count interpolated", () => {
    expect(shouldEscalate([{ type: "tool_error_streak", count: 3 }], DEFAULT_CONFIG)).toBe(
      "3 consecutive tool errors",
    );
  });

  it("R4.2: tool_error_streak above the threshold also escalates", () => {
    expect(shouldEscalate([{ type: "tool_error_streak", count: 5 }], DEFAULT_CONFIG)).toBe(
      "5 consecutive tool errors",
    );
  });

  it("R4.2: verification_failed below threshold does not escalate", () => {
    expect(shouldEscalate([{ type: "verification_failed", attempts: 1 }], DEFAULT_CONFIG)).toBeNull();
  });

  it("R4.2: verification_failed at 2 uses the special-cased 'tests failed twice'", () => {
    expect(shouldEscalate([{ type: "verification_failed", attempts: 2 }], DEFAULT_CONFIG)).toBe(
      "tests failed twice",
    );
  });

  it("R4.2: verification_failed above 2 uses 'tests failed N times'", () => {
    expect(shouldEscalate([{ type: "verification_failed", attempts: 3 }], DEFAULT_CONFIG)).toBe(
      "tests failed 3 times",
    );
  });

  it("R4.2: any model_stuck escalates regardless of magnitude", () => {
    expect(
      shouldEscalate([{ type: "model_stuck", evidence: "same bash call twice" }], DEFAULT_CONFIG),
    ).toBe("repeated identical tool calls");
  });

  it("R4.2: any model_requested_help escalates", () => {
    expect(shouldEscalate([{ type: "model_requested_help" }], DEFAULT_CONFIG)).toBe(
      "model requested help",
    );
  });

  it("R4.2: context_overflow never triggers escalation (inert in v1, reserved)", () => {
    expect(
      shouldEscalate([{ type: "context_overflow", contextTokens: 999_999 }], DEFAULT_CONFIG),
    ).toBeNull();
  });

  it("R4.2: first threshold-met signal wins, in array order", () => {
    const signals: EscalationSignal[] = [
      { type: "tool_error_streak", count: 1 }, // below threshold — skipped
      { type: "verification_failed", attempts: 2 }, // meets threshold — wins
      { type: "model_stuck", evidence: "would also match, but comes later" },
    ];
    expect(shouldEscalate(signals, DEFAULT_CONFIG)).toBe("tests failed twice");
  });

  it("R4.2: thresholds are read from config.routing.escalation (customizable)", () => {
    const custom = configSchema.parse({ routing: { escalation: { toolErrorStreak: 1 } } });
    expect(shouldEscalate([{ type: "tool_error_streak", count: 1 }], custom)).toBe(
      "1 consecutive tool errors",
    );
  });

  it("R4.2: no signals at all -> null", () => {
    expect(shouldEscalate([], DEFAULT_CONFIG)).toBeNull();
  });
});

function makeRouter(opts: { escalationEnabled?: boolean } = {}) {
  const config = configSchema.parse({
    routing: { escalation: { enabled: opts.escalationEnabled ?? true } },
  });
  const ledger = createStubLedger(); // default budgetState: ok — governance is a no-op
  const router = createRouter({
    config,
    ledger,
    classifyModel: () => createMockModel(),
    now: () => "2026-07-20T12:00:00.000Z",
  });
  return { router, config, ledger };
}

const baseInput: RoutingInput = {
  kind: "spec-task-exec",
  text: "fix the intermittent 500",
  contextTokens: 500,
  sessionId: "s1",
  complexityHint: 3,
};

function currentDecision(tier: Tier, overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    tier,
    model: DEFAULT_CONFIG.tiers[tier].primary,
    reasons: ["policy spec-task-exec"],
    estimate: { inputTokens: 500, estOutputTokens: 2500, estCostUsd: 0.01 },
    ...overrides,
  };
}

describe("reconsider — escalation ladder (R4.1, R4.3, R4.4)", () => {
  it("R4.1: disabled escalation always returns null, even with strong evidence", async () => {
    const { router } = makeRouter({ escalationEnabled: false });
    const result = await router.reconsider(currentDecision("scout"), baseInput, [
      { type: "model_requested_help" },
    ]);
    expect(result).toBeNull();
  });

  it("R4.1: disabled escalation short-circuits before evaluating signals at all", async () => {
    const { router } = makeRouter({ escalationEnabled: false });
    const result = await router.reconsider(currentDecision("scout"), baseInput, [
      { type: "tool_error_streak", count: 999 },
      { type: "verification_failed", attempts: 999 },
    ]);
    expect(result).toBeNull();
  });

  it("R4.3: escalates scout->builder, sets escalatedFrom, selects builder's primary, single evidence reason", async () => {
    const { router, config } = makeRouter();
    const result = await router.reconsider(currentDecision("scout"), baseInput, [
      { type: "tool_error_streak", count: 3 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("builder");
    expect(result!.escalatedFrom).toBe("scout");
    expect(result!.model).toEqual(config.tiers.builder.primary);
    expect(result!.reasons).toEqual(["escalated scout→builder: 3 consecutive tool errors"]);
  });

  it("R4.3: escalates builder->architect on verification_failed=2 ('tests failed twice')", async () => {
    const { router, config } = makeRouter();
    const result = await router.reconsider(currentDecision("builder"), baseInput, [
      { type: "verification_failed", attempts: 2 },
    ]);
    expect(result!.tier).toBe("architect");
    expect(result!.escalatedFrom).toBe("builder");
    expect(result!.model).toEqual(config.tiers.architect.primary);
    expect(result!.reasons).toEqual(["escalated builder→architect: tests failed twice"]);
  });

  it("R4.3: escalates builder->architect on model_stuck", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(currentDecision("builder"), baseInput, [
      { type: "model_stuck", evidence: "identical bash call twice" },
    ]);
    expect(result!.tier).toBe("architect");
    expect(result!.reasons).toEqual(["escalated builder→architect: repeated identical tool calls"]);
  });

  it("R4.3: escalates builder->architect on model_requested_help", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(currentDecision("builder"), baseInput, [
      { type: "model_requested_help" },
    ]);
    expect(result!.tier).toBe("architect");
    expect(result!.reasons).toEqual(["escalated builder→architect: model requested help"]);
  });

  it("no signal meets its threshold -> null (no escalation)", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(currentDecision("scout"), baseInput, [
      { type: "tool_error_streak", count: 1 },
      { type: "verification_failed", attempts: 1 },
    ]);
    expect(result).toBeNull();
  });

  it("no signals at all -> null", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(currentDecision("scout"), baseInput, []);
    expect(result).toBeNull();
  });

  it("R4.4: current.tier architect is terminal -> null, even with strong evidence", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(currentDecision("architect"), baseInput, [
      { type: "model_requested_help" },
    ]);
    expect(result).toBeNull();
  });

  it("R4.4: current.escalatedFrom already set -> null (one escalation per task)", async () => {
    const { router } = makeRouter();
    const result = await router.reconsider(
      currentDecision("builder", { escalatedFrom: "scout" }),
      baseInput,
      [{ type: "model_requested_help" }],
    );
    expect(result).toBeNull();
  });
});

describe("reconsider — governor interaction (R4.5)", () => {
  function makeWarnRouter() {
    const config = configSchema.parse({ routing: { escalation: { enabled: true } } });
    const ledger = createStubLedger({
      budgetState: { level: "warn", spentUsd: 4.2, spentTokens: 1000, limitUsd: 5, scope: "session" },
    });
    const router = createRouter({
      config,
      ledger,
      classifyModel: () => createMockModel(),
      now: () => "2026-07-20T12:00:00.000Z",
    });
    return router;
  }

  it("R4.5: an escalation the governor degrades straight back to current.tier returns null", async () => {
    const router = makeWarnRouter();
    // builder -> architect escalation, but the warn-budget governor
    // degrades architect back to builder — a no-op relative to current.tier.
    const result = await router.reconsider(currentDecision("builder"), baseInput, [
      { type: "model_requested_help" },
    ]);
    expect(result).toBeNull();
  });

  it("R4.5: escalation scout->builder under warn budget still succeeds (warn only touches architect)", async () => {
    const router = makeWarnRouter();
    const result = await router.reconsider(currentDecision("scout"), baseInput, [
      { type: "model_requested_help" },
    ]);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("builder");
    expect(result!.escalatedFrom).toBe("scout");
    expect(result!.reasons).toEqual(["escalated scout→builder: model requested help"]);
  });
});
