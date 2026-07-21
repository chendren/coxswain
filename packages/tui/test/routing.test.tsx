import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { EventBus, ZERO_USAGE } from "@cox/core";
import type { RoutingDecision, SessionController, SessionSnapshot } from "@cox/core";
import { App } from "../src/app";
import { RoutingAnnouncement } from "../src/components/RoutingAnnouncement";

function fakeController(): SessionController {
  return {
    sessionId: "ses_test",
    submitPrompt: () => {},
    submitCommand: () => {},
    resolvePermission: () => {},
    interrupt: () => {},
  };
}

function fakeSnapshot(): SessionSnapshot {
  return {
    sessionId: "ses_test",
    currentTier: "builder",
    currentModel: null,
    usage: ZERO_USAGE,
    costUsd: 0,
    budget: { level: "ok", spentUsd: 0, spentTokens: 0 },
  };
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "");
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("R1.3: RoutingAnnouncement byte-exact block", () => {
  it("matches the fixture's routing_decision (fixtures/events-sample.jsonl lines 2-3) exactly", () => {
    // line 2: {"type":"user_prompt","text":"add input validation to the signup endpoint"}
    // line 3: {"type":"routing_decision","kind":"chat","decision":{...}}
    const decision: RoutingDecision = {
      tier: "builder",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      reasons: ["classified task-type=feature complexity=2", "tier builder per routing table"],
      estimate: { inputTokens: 11200, estOutputTokens: 2400, estCostUsd: 0.0696 },
    };
    // App computes this label: first 40 chars of the user_prompt text, quoted.
    const label = '"add input validation to the signup endpo"';
    const { lastFrame } = render(<RoutingAnnouncement decision={decision} label={label} spentUsd={0} />);
    const frame = stripAnsi(lastFrame() ?? "");
    const expected = [
      '⑆ router  "add input validation to the signup endpo" → builder (claude-sonnet-5)',
      "          classified task-type=feature complexity=2 · tier builder per routing table",
      "          est 11.2k in / ~2.4k out ≈ $0.07    session $0.000",
    ].join("\n");
    expect(frame).toBe(expected);
  });

  it("renders a 10-char budget bar and both sides of the fraction when a limit is set", () => {
    const decision: RoutingDecision = {
      tier: "scout",
      model: { provider: "anthropic", model: "claude-haiku-4-5" },
      reasons: ["policy oneshot"],
      estimate: { inputTokens: 500, estOutputTokens: 200, estCostUsd: 0.001 },
    };
    const { lastFrame } = render(
      <RoutingAnnouncement decision={decision} label='"explain this"' spentUsd={0.42} limitUsd={5} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    const expected = [
      '⑆ router  "explain this" → scout (claude-haiku-4-5)',
      "          policy oneshot",
      "          est 500 in / ~200 out ≈ $0.001    session $0.42/$5.00 █░░░░░░░░░",
    ].join("\n");
    expect(frame).toBe(expected);
  });

  it("omits the fraction and bar entirely when no limit is configured", () => {
    const decision: RoutingDecision = {
      tier: "architect",
      model: { provider: "anthropic", model: "claude-opus-4-8" },
      reasons: ["policy spec-design"],
      estimate: { inputTokens: 6000, estOutputTokens: 3000, estCostUsd: 0.12 },
    };
    const { lastFrame } = render(
      <RoutingAnnouncement decision={decision} label='"design the auth flow"' spentUsd={1.5} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    const lastLine = frame.split("\n")[2];
    expect(lastLine).toBe("          est 6k in / ~3k out ≈ $0.12    session $1.50");
    expect(lastLine).not.toContain("█");
    expect(lastLine).not.toContain("░");
  });
});

describe("R1.4: model_call_finished receipt line formats", () => {
  it("renders cached tokens and a known cost/duration", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      usage: { inputTokens: 11834, outputTokens: 2110, cacheReadTokens: 9200, cacheWriteTokens: 2634 },
      costUsd: 0.0721,
      stopReason: "end_turn",
      durationMs: 9450,
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("─ actual: 11.8k in (9.2k cached) / 2.1k out · $0.07 · 9.4s");
  });

  it("renders n/a for an unknown-pricing model (costUsd: null) and sub-second duration in ms", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "model_call_finished",
      model: { provider: "ollama", model: "llama3" },
      usage: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costUsd: null,
      stopReason: "end_turn",
      durationMs: 200,
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("─ actual: 500 in (0 cached) / 100 out · n/a · 200ms");
  });

  it("renders >1M-scale token counts", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "model_call_finished",
      model: { provider: "anthropic", model: "claude-opus-4-8" },
      usage: { inputTokens: 1_200_000, outputTokens: 50_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 },
      costUsd: 12.5,
      stopReason: "end_turn",
      durationMs: 45_000,
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("─ actual: 1.2M in (1M cached) / 50k out · $12.50 · 45.0s");
  });
});
