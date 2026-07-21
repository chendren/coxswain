import { describe, expect, it } from "vitest";
import { configSchema, type RoutingInput } from "@cox/core";
import { createRouter } from "../src/index";
import { createMockModel } from "./helpers/mockModel";
import { createStubLedger } from "./helpers/mockLedger";

const config = configSchema.parse({});

function makeRouter() {
  return createRouter({
    config,
    ledger: createStubLedger(),
    classifyModel: () => createMockModel(),
    now: () => "2026-07-20T12:00:00.000Z",
  });
}

const base: RoutingInput = {
  kind: "chat",
  text: "add a test",
  contextTokens: 1000,
  sessionId: "s1",
};

describe("router precedence + policy table", () => {
  it("R1.1: userOverrideTier wins over hookOverrideTier and policy, reason 'user override (/model)'", async () => {
    const router = makeRouter();
    const decision = await router.route({
      ...base,
      kind: "spec-design", // would otherwise resolve architect
      userOverrideTier: "scout",
      hookOverrideTier: "architect",
    });
    expect(decision.tier).toBe("scout");
    expect(decision.reasons).toContain("user override (/model)");
  });

  it("R1.2: hookOverrideTier wins when no userOverrideTier, reason 'hook override'", async () => {
    const router = makeRouter();
    const decision = await router.route({
      ...base,
      kind: "spec-design", // would otherwise resolve architect
      hookOverrideTier: "scout",
    });
    expect(decision.tier).toBe("scout");
    expect(decision.reasons).toContain("hook override");
  });

  it("R1.3: classify -> scout, reason 'policy classify'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "classify" });
    expect(decision.tier).toBe("scout");
    expect(decision.reasons).toContain("policy classify");
  });

  it("R1.3: oneshot -> scout, reason 'policy oneshot'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "oneshot" });
    expect(decision.tier).toBe("scout");
    expect(decision.reasons).toContain("policy oneshot");
  });

  it("R1.3: hook -> scout, reason 'policy hook'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "hook" });
    expect(decision.tier).toBe("scout");
    expect(decision.reasons).toContain("policy hook");
  });

  it("R1.3: spec-requirements -> architect, reason 'policy spec-requirements'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "spec-requirements" });
    expect(decision.tier).toBe("architect");
    expect(decision.reasons).toContain("policy spec-requirements");
  });

  it("R1.3: spec-design -> architect, reason 'policy spec-design'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "spec-design" });
    expect(decision.tier).toBe("architect");
    expect(decision.reasons).toContain("policy spec-design");
  });

  it("R1.3: spec-tasks -> builder, reason 'policy spec-tasks'", async () => {
    const decision = await makeRouter().route({ ...base, kind: "spec-tasks" });
    expect(decision.tier).toBe("builder");
    expect(decision.reasons).toContain("policy spec-tasks");
  });

  it("R1.3: spec-task-exec complexityHint 1-2 -> scout, with complexity reason", async () => {
    const router = makeRouter();
    const d1 = await router.route({ ...base, kind: "spec-task-exec", complexityHint: 1 });
    expect(d1.tier).toBe("scout");
    expect(d1.reasons).toContain("complexity=1 from spec task");
    const d2 = await router.route({ ...base, kind: "spec-task-exec", complexityHint: 2 });
    expect(d2.tier).toBe("scout");
    expect(d2.reasons).toContain("complexity=2 from spec task");
  });

  it("R1.3: spec-task-exec complexityHint 3 -> builder, with complexity reason", async () => {
    const decision = await makeRouter().route({
      ...base,
      kind: "spec-task-exec",
      complexityHint: 3,
    });
    expect(decision.tier).toBe("builder");
    expect(decision.reasons).toContain("complexity=3 from spec task");
  });

  it("R1.3: spec-task-exec complexityHint 4-5 -> architect, with complexity reason", async () => {
    const router = makeRouter();
    const d4 = await router.route({ ...base, kind: "spec-task-exec", complexityHint: 4 });
    expect(d4.tier).toBe("architect");
    expect(d4.reasons).toContain("complexity=4 from spec task");
    const d5 = await router.route({ ...base, kind: "spec-task-exec", complexityHint: 5 });
    expect(d5.tier).toBe("architect");
    expect(d5.reasons).toContain("complexity=5 from spec task");
  });

  it("R1.3: spec-task-exec missing complexityHint -> builder, policy reason only (no complexity addendum)", async () => {
    const decision = await makeRouter().route({ ...base, kind: "spec-task-exec" });
    expect(decision.tier).toBe("builder");
    expect(decision.reasons).toContain("policy spec-task-exec");
    expect(decision.reasons.some((r) => r.startsWith("complexity="))).toBe(false);
  });

  it("R1.6: decision.model equals config.tiers[tier].primary for every resolved tier", async () => {
    const router = makeRouter();
    const scout = await router.route({ ...base, kind: "oneshot" });
    expect(scout.model).toEqual(config.tiers.scout.primary);
    const builder = await router.route({ ...base, kind: "spec-tasks" });
    expect(builder.model).toEqual(config.tiers.builder.primary);
    const architect = await router.route({ ...base, kind: "spec-requirements" });
    expect(architect.model).toEqual(config.tiers.architect.primary);
  });

  it("R1.7: reasons has >= 1 entry, ordered most-specific first (policy reason, then complexity addendum)", async () => {
    const decision = await makeRouter().route({
      ...base,
      kind: "spec-task-exec",
      complexityHint: 2,
    });
    expect(decision.reasons.length).toBeGreaterThanOrEqual(1);
    expect(decision.reasons[0]).toBe("policy spec-task-exec");
    expect(decision.reasons[1]).toBe("complexity=2 from spec task");
  });

  it("R1.7: override reasons contain exactly one entry", async () => {
    const decision = await makeRouter().route({ ...base, userOverrideTier: "architect" });
    expect(decision.reasons).toEqual(["user override (/model)"]);
  });
});
