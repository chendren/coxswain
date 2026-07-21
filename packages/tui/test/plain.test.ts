import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@cox/core";
import { createPlainRenderer } from "../src/plain";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "..", "..", "fixtures", "events-sample.jsonl");

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/;

function collectLines(events: AgentEvent[]): string[] {
  const lines: string[] = [];
  const render = createPlainRenderer((line) => lines.push(line));
  for (const e of events) render(e);
  return lines;
}

describe("R6.1: createPlainRenderer emits plain lines, no ANSI cursor control", () => {
  it("renders session_started, user_prompt, tool lines, and the model_call_finished receipt with no ANSI codes", () => {
    const lines = collectLines([
      { type: "session_started", sessionId: "ses_demo", cwd: "/Users/demo/app" },
      { type: "user_prompt", text: "add tests" },
      { type: "tool_call_started", id: "t1", name: "read", summary: "read src/x.ts" },
      { type: "tool_call_finished", id: "t1", name: "read", isError: false, resultPreview: "42 lines" },
      { type: "tool_call_started", id: "t2", name: "edit", summary: "edit src/x.ts" },
      { type: "tool_call_finished", id: "t2", name: "edit", isError: true, resultPreview: "boom" },
      {
        type: "model_call_finished",
        model: { provider: "anthropic", model: "claude-sonnet-5" },
        usage: { inputTokens: 11834, outputTokens: 2110, cacheReadTokens: 9200, cacheWriteTokens: 2634 },
        costUsd: 0.0721,
        stopReason: "end_turn",
        durationMs: 9450,
      },
    ]);
    expect(lines).toEqual([
      "session ses_demo · /Users/demo/app",
      "❯ add tests",
      "⚙ read read src/x.ts",
      "✓ read read src/x.ts · 42 lines",
      "⚙ edit edit src/x.ts",
      "✗ edit edit src/x.ts · boom",
      "─ actual: 11.8k in (9.2k cached) / 2.1k out · $0.07 · 9.4s",
    ]);
    for (const line of lines) expect(line).not.toMatch(ANSI_RE);
  });

  it("R1.2 dedupe rule applies in plain mode too: agent_message after deltas is not duplicated", () => {
    const lines = collectLines([
      { type: "text_delta", text: "Hello, " },
      { type: "text_delta", text: "world." },
      { type: "agent_message", text: "Hello, world." },
      {
        type: "turn_done",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
      },
    ]);
    const occurrences = lines.filter((l) => l === "Hello, world.").length;
    expect(occurrences).toBe(1);
  });

  it("renders agent_message when no prior delta streamed that turn", () => {
    const lines = collectLines([
      { type: "agent_message", text: "Added validation." },
      {
        type: "turn_done",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
      },
    ]);
    expect(lines).toContain("Added validation.");
  });

  it("thinking_delta never produces a line", () => {
    const lines = collectLines([{ type: "thinking_delta", text: "hmm, let me think" }]);
    expect(lines).toEqual([]);
  });

  it("R6.2: permission_request renders `? permission: <summary>`", () => {
    const lines = collectLines([
      {
        type: "permission_request",
        request: { toolName: "bash", summary: "bash: rm -rf dist/", detail: "rm -rf dist/" },
      },
    ]);
    expect(lines).toEqual(["? permission: bash: rm -rf dist/"]);
  });

  it("budget_alert exceeded adds the /budget extend hint line", () => {
    const lines = collectLines([
      {
        type: "budget_alert",
        state: { level: "exceeded", spentUsd: 5.5, spentTokens: 100, limitUsd: 5, scope: "session" },
      },
    ]);
    expect(lines).toEqual(["▲ budget $5.50/$5.00 (session)", "type /budget extend <usd>"]);
  });

  it("routing_decision renders the 3-line block (session segment always $0, no snapshot access)", () => {
    const lines = collectLines([
      { type: "user_prompt", text: "add tests for the parser" },
      {
        type: "routing_decision",
        kind: "chat",
        decision: {
          tier: "builder",
          model: { provider: "anthropic", model: "claude-sonnet-5" },
          reasons: ["classified task-type=feature complexity=2"],
          estimate: { inputTokens: 1000, estOutputTokens: 500, estCostUsd: 0.01 },
        },
      },
    ]);
    expect(lines[1]).toBe('⑆ router  "add tests for the parser" → builder (claude-sonnet-5)');
    expect(lines[3]).toBe("          est 1k in / ~500 out ≈ $0.01    session $0.000");
  });

  it("replays the full fixture with no ANSI codes anywhere", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const events = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as AgentEvent);
    const lines = collectLines(events);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(ANSI_RE);
    expect(lines).toContain("❯ add input validation to the signup endpoint");
  });
});
