import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { EventBus, ZERO_USAGE } from "@cox/core";
import type { SessionController, SessionSnapshot } from "@cox/core";
import { App } from "../src/app";

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
  return s.replace(/\[[0-9;]*m/g, "");
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("R1.1 (partial)/R1.2/R1.6: App text path", () => {
  it("renders user_prompt bold with a ❯ prefix", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "user_prompt", text: "add tests" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("❯ add tests");
  });

  it("R1.2: streams text_delta into one growing block and does not duplicate it on agent_message", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "Hello, " });
    bus.emit({ type: "text_delta", text: "world." });
    bus.emit({ type: "agent_message", text: "Hello, world." });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    await flush();

    const frame = stripAnsi(lastFrame() ?? "");
    const occurrences = frame.split("Hello, world.").length - 1;
    expect(occurrences).toBe(1);
  });

  it("R1.2: renders agent_message text when no prior delta streamed this turn (replay/non-streaming)", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "agent_message", text: "Added zod validation." });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("Added zod validation.");
  });

  it("renders error in red with a ✖ prefix", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "error", message: "boom" });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("✖ boom");
    expect(frame).toContain("[31m"); // red
  });

  it("turn_done settles the streaming block into Static and appends a dim turn-cost separator", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "done." });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0.0721 });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("done.");
    expect(frame).toContain("· turn $0.07");
  });

  it("a later turn's agent_message dedupe state resets after turn_done", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "text_delta", text: "first" });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    bus.emit({ type: "agent_message", text: "second (no deltas this turn)" });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("second (no deltas this turn)");
  });

  it("R1.6: a listener never throws out of the render loop — multiple events in one turn are all reflected", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(
      <App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />,
    );
    bus.emit({ type: "user_prompt", text: "do the thing" });
    bus.emit({ type: "text_delta", text: "working" });
    bus.emit({ type: "turn_done", usage: ZERO_USAGE, costUsd: 0 });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("❯ do the thing");
    expect(frame).toContain("working");
  });
});

describe("R1.1/R1.5: full event mapping (task 6) — one assertion per remaining variant", () => {
  it("session_started: dim `session <sessionId> · <cwd>`", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "session_started", sessionId: "ses_demo", cwd: "/Users/demo/app" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("session ses_demo · /Users/demo/app");
  });

  it("routing_decision: renders the RoutingAnnouncement block with the quoted user-prompt label", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "user_prompt", text: "add input validation to the signup endpoint" });
    bus.emit({
      type: "routing_decision",
      kind: "chat",
      decision: {
        tier: "builder",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        reasons: ["classified task-type=feature complexity=2", "tier builder per routing table"],
        estimate: { inputTokens: 11200, estOutputTokens: 2400, estCostUsd: 0.0696 },
      },
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    // Label is the first 40 chars of the user_prompt text, quoted.
    expect(frame).toContain(
      '⑆ router  "add input validation to the signup endpo" → builder (claude-sonnet-5)',
    );
    expect(frame).toContain("classified task-type=feature complexity=2 · tier builder per routing table");
    expect(frame).toContain("est 11.2k in / ~2.4k out ≈ $0.07    session $0.000");
  });

  it("routing_decision: spec-task-exec label falls back to the last spec_event's taskId", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "spec_event", specName: "auth-flow", phase: "execution", status: "task:in_progress", taskId: "4" });
    bus.emit({
      type: "routing_decision",
      kind: "spec-task-exec",
      decision: {
        tier: "scout",
        model: { provider: "anthropic", model: "claude-haiku-4-5" },
        reasons: ["complexity=1 from spec task"],
        estimate: { inputTokens: 3100, estOutputTokens: 600, estCostUsd: 0.006 },
      },
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("⑆ router  spec task 4 → scout (claude-haiku-4-5)");
  });

  it("model_call_started: transient spinner line", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "model_call_started",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      tier: "builder",
    });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("⠋ builder claude-sonnet-5 …");
  });

  it("thinking_delta: transient dim `∴ <last 60 chars>` preview, never settled", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "thinking_delta", text: "analyzing the codebase" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("∴ analyzing the codebase");
  });

  it("tool_call_started: transient `⚙ <name> <summary>`", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "tool_call_started", id: "t1", name: "read", summary: "read src/routes/signup.ts" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("⚙ read read src/routes/signup.ts");
  });

  it("permission_request: modal placeholder shows the summary", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "permission_request",
      request: { toolName: "edit", summary: "edit src/routes/signup.ts", detail: "@@ -10,6 +10,12 @@ ..." },
    });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("? permission: edit src/routes/signup.ts");
  });

  it("R1.5: tool_call_finished renders green ✓ on success, pulling the summary from tool_call_started", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "tool_call_started", id: "t1", name: "read", summary: "read src/routes/signup.ts" });
    bus.emit({ type: "tool_call_finished", id: "t1", name: "read", isError: false, resultPreview: "42 lines" });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("✓ read read src/routes/signup.ts · 42 lines");
    expect(frame).toContain("[32m"); // green
  });

  it("R1.5: tool_call_finished renders red ✗ when isError", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "tool_call_started", id: "t2", name: "edit", summary: "edit foo.ts" });
    bus.emit({ type: "tool_call_finished", id: "t2", name: "edit", isError: true, resultPreview: "boom" });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("✗ edit edit foo.ts · boom");
    expect(frame).toContain("[31m"); // red
  });

  it("model_call_finished: dim actual-usage receipt line and clears the spinner", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "model_call_started",
      model: { provider: "anthropic", model: "claude-sonnet-5" },
      tier: "builder",
    });
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
    expect(frame).not.toContain("⠋"); // spinner cleared
  });

  it("escalation: yellow `⚠ escalated <from>→<to>: <reasons>`", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "escalation", from: "builder", to: "architect", reasons: ["tests failed twice"] });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("⚠ escalated builder→architect: tests failed twice");
    expect(frame).toContain("[33m"); // yellow
  });

  it("budget_alert (warn): yellow headline", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "budget_alert",
      state: { level: "warn", spentUsd: 4.2, spentTokens: 100_000, limitUsd: 5, limitTokens: 200_000, scope: "session" },
    });
    await flush();
    const frame = lastFrame() ?? "";
    expect(stripAnsi(frame)).toContain("▲ budget $4.20/$5.00 (session)");
    expect(frame).toContain("[33m"); // yellow
    expect(stripAnsi(frame)).not.toContain("/budget extend");
  });

  it("budget_alert (exceeded): red headline plus the /budget extend hint", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "budget_alert",
      state: { level: "exceeded", spentUsd: 5.5, spentTokens: 210_000, limitUsd: 5, limitTokens: 200_000, scope: "session" },
    });
    await flush();
    const frame = lastFrame() ?? "";
    const stripped = stripAnsi(frame);
    expect(stripped).toContain("▲ budget $5.50/$5.00 (session)");
    expect(stripped).toContain("type /budget extend <usd>");
    expect(frame).toContain("[31m"); // red
  });

  it("spec_event: `◆ spec <name> · <phase> · <status>` with the task suffix when present", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({ type: "spec_event", specName: "auth-flow", phase: "execution", status: "task:done", taskId: "4" });
    await flush();
    expect(stripAnsi(lastFrame() ?? "")).toContain("◆ spec auth-flow · execution · task:done · task 4");
  });

  it("hook_fired: dim summary line, no block line when nothing blocked", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "hook_fired",
      event: "PreToolUse",
      outcomes: [{ hook: "echo hi", action: "continue" }],
    });
    await flush();
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("⚓ PreToolUse: 1 hook(s)");
    expect(frame).not.toContain("✗");
  });

  it("hook_fired: a blocked outcome adds a red line with its stderr", async () => {
    const bus = new EventBus();
    const { lastFrame } = render(<App bus={bus} controller={fakeController()} getSnapshot={fakeSnapshot} />);
    bus.emit({
      type: "hook_fired",
      event: "PreToolUse",
      outcomes: [{ hook: "guard.sh", action: "block", stderr: "denied: dangerous command" }],
    });
    await flush();
    const frame = lastFrame() ?? "";
    const stripped = stripAnsi(frame);
    expect(stripped).toContain("⚓ PreToolUse: 1 hook(s)");
    expect(stripped).toContain("✗ guard.sh: denied: dangerous command");
    expect(frame).toContain("[31m"); // red
  });
});
