import type { CoxConfig, RoutingInput, Tier } from "@cox/core";

export interface StaticResolution {
  tier: Tier;
  reasons: string[];
}

/**
 * Precedence steps 1–3 (R1.1–R1.3): user override, hook override, then the
 * static TaskKind policy table. Returns null only for `kind: "chat"` with no
 * override — that case falls through to scout classification / default tier
 * (steps 4–5, handled by the router's `route()` orchestration).
 */
export function resolveStaticTier(
  input: RoutingInput,
  _config: CoxConfig,
): StaticResolution | null {
  if (input.userOverrideTier) {
    return { tier: input.userOverrideTier, reasons: ["user override (/model)"] };
  }
  if (input.hookOverrideTier) {
    return { tier: input.hookOverrideTier, reasons: ["hook override"] };
  }

  switch (input.kind) {
    case "classify":
    case "oneshot":
    case "hook":
      return { tier: "scout", reasons: [`policy ${input.kind}`] };
    case "spec-requirements":
    case "spec-design":
      return { tier: "architect", reasons: [`policy ${input.kind}`] };
    case "spec-tasks":
      return { tier: "builder", reasons: [`policy ${input.kind}`] };
    case "spec-task-exec": {
      const hint = input.complexityHint;
      let tier: Tier;
      if (hint === undefined) tier = "builder"; // missing hint -> builder
      else if (hint <= 2) tier = "scout";
      else if (hint === 3) tier = "builder";
      else tier = "architect"; // 4-5

      const reasons = [`policy ${input.kind}`];
      if (hint !== undefined) reasons.push(`complexity=${hint} from spec task`);
      return { tier, reasons };
    }
    case "chat":
      return null;
  }
}
