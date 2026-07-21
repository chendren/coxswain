import { describe, expect, it } from "vitest";
import type { AgentEvent, ContentBlock, PermissionDecision, PermissionRequest } from "@cox/core";
import { createAgentRunner } from "../src/runner";
import { fakeTool } from "./helpers/fake-tool";
import { scripted } from "./helpers/scripted-model";
import {
  baseConfig,
  baseTask,
  decisionFor,
  fixedRouter,
  okBudget,
  toolRegistryFrom,
} from "./helpers/fixtures";

function runnerWith(overrides: Partial<Parameters<typeof createAgentRunner>[0]> = {}) {
  return createAgentRunner({
    router: fixedRouter(decisionFor("builder")),
    modelForTier: () => scripted([{ deltas: ["done"] }]),
    tools: toolRegistryFrom([]),
    permissionMode: "default",
    config: baseConfig,
    budgetState: okBudget(),
    requestPermission: async () => {
      throw new Error("unexpected permission request");
    },
    ...overrides,
  });
}

describe("R1.2: sequential tool execution", () => {
  it("executes multiple tool calls in stream order and continues the loop", async () => {
    const order: string[] = [];
    const tools = toolRegistryFrom([
      fakeTool({ name: "a", onExecute: () => order.push("a") }),
      fakeTool({ name: "b", onExecute: () => order.push("b") }),
      fakeTool({ name: "c", onExecute: () => order.push("c") }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          {
            toolUses: [
              { id: "1", name: "a", input: {} },
              { id: "2", name: "b", input: {} },
              { id: "3", name: "c", input: {} },
            ],
          },
          { deltas: ["all done"] },
        ]),
    });

    const result = await runner.run(baseTask(), () => {});
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("all done");
  });

  it("appends exactly one user message with tool_results in call order", async () => {
    const tools = toolRegistryFrom([
      fakeTool({ name: "a", result: { content: "A", isError: false } }),
      fakeTool({ name: "b", result: { content: "B", isError: false } }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          {
            toolUses: [
              { id: "1", name: "a", input: {} },
              { id: "2", name: "b", input: {} },
            ],
          },
          { deltas: ["done"] },
        ]),
    });
    const result = await runner.run(baseTask(), () => {});

    // history: [userPrompt, assistant(tool_use x2), user(tool_result x2), assistant(text)]
    const toolResultMsg = result.history[2];
    expect(toolResultMsg?.role).toBe("user");
    expect(toolResultMsg?.content).toEqual([
      { type: "tool_result", toolUseId: "1", content: "A", isError: false },
      { type: "tool_result", toolUseId: "2", content: "B", isError: false },
    ]);
  });
});

describe("R1.6: unknown tool", () => {
  it("feeds back an isError tool_result naming the tool and available tools, and continues", async () => {
    const tools = toolRegistryFrom([fakeTool({ name: "read" }), fakeTool({ name: "grep" })]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "ghost", input: {} }] },
          { deltas: ["recovered"] },
        ]),
    });
    const result = await runner.run(baseTask(), () => {});

    expect(result.stopReason).toBe("end_turn"); // loop continued past the bad call
    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(true);
    expect(block.content).toContain('unknown tool "ghost"');
    expect(block.content).toContain("read");
    expect(block.content).toContain("grep");
  });
});

describe("R6.1, R6.2: permission deny flow", () => {
  it("deny feeds back an isError 'user denied: <summary>' and never executes", async () => {
    let executed = false;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "write",
        permissionFor: () => ({ toolName: "write", summary: "write a.txt" }),
        onExecute: () => {
          executed = true;
        },
      }),
    ]);
    const events: AgentEvent[] = [];
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["ok"] },
        ]),
      requestPermission: async () => "deny",
    });
    const result = await runner.run(baseTask(), (e) => events.push(e));

    expect(executed).toBe(false);
    const toolResultMsg = result.history[2];
    const block = toolResultMsg?.content[0] as Extract<ContentBlock, { type: "tool_result" }>;
    expect(block.isError).toBe(true);
    expect(block.content).toBe("user denied: write a.txt");

    const permReq = events.find((e) => e.type === "permission_request");
    expect(permReq).toBeDefined();
  });
});

describe("R6.3: allowAlways memory", () => {
  it("skips the second prompt for an identical call within the same session", async () => {
    let askCount = 0;
    let execCount = 0;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "write",
        permissionFor: () => ({ toolName: "write", summary: "write a.txt" }),
        onExecute: () => {
          execCount++;
        },
      }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "write", input: { path: "a.txt" } }] },
          { toolUses: [{ id: "2", name: "write", input: { path: "a.txt" } }] },
          { deltas: ["done"] },
        ]),
      requestPermission: async () => {
        askCount++;
        return "allowAlways" as PermissionDecision;
      },
    });
    await runner.run(baseTask(), () => {});

    expect(askCount).toBe(1);
    expect(execCount).toBe(2);
  });

  it("bash-style calls are keyed by the first whitespace token, not the full command", async () => {
    const askedFor: string[] = [];
    const tools = toolRegistryFrom([
      fakeTool({
        name: "bash",
        permissionFor: (input) => ({
          toolName: "bash",
          summary: `bash: ${(input as { command: string }).command}`,
        }),
        onExecute: (input) => askedFor.push((input as { command: string }).command),
      }),
    ]);
    let askCount = 0;
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "bash", input: { command: "git status" } }] },
          { toolUses: [{ id: "2", name: "bash", input: { command: "git log" } }] },
          { deltas: ["done"] },
        ]),
      requestPermission: async () => {
        askCount++;
        return "allowAlways" as PermissionDecision;
      },
    });
    await runner.run(baseTask(), () => {});

    expect(askCount).toBe(1); // "git status" and "git log" share the "git" key
    expect(askedFor).toEqual(["git status", "git log"]);
  });

  it("different tool keys each prompt independently", async () => {
    let askCount = 0;
    const tools = toolRegistryFrom([
      fakeTool({
        name: "bash",
        permissionFor: (input) => ({
          toolName: "bash",
          summary: `bash: ${(input as { command: string }).command}`,
        }),
      }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          { toolUses: [{ id: "1", name: "bash", input: { command: "git status" } }] },
          { toolUses: [{ id: "2", name: "bash", input: { command: "npm install" } }] },
          { deltas: ["done"] },
        ]),
      requestPermission: async () => {
        askCount++;
        return "allowAlways" as PermissionDecision;
      },
    });
    await runner.run(baseTask(), () => {});
    expect(askCount).toBe(2); // "git" and "npm" are different keys
  });
});

describe("R3.1, R3.3: tool_call_started/finished wrap each call", () => {
  it("emits started before finished, per call, with correct fields", async () => {
    const events: AgentEvent[] = [];
    const tools = toolRegistryFrom([
      fakeTool({ name: "a", result: { content: "A-result\nsecond line", isError: false } }),
      fakeTool({ name: "b", result: { content: "B-fails", isError: true } }),
    ]);
    const runner = runnerWith({
      tools,
      modelForTier: () =>
        scripted([
          {
            toolUses: [
              { id: "1", name: "a", input: { x: 1 } },
              { id: "2", name: "b", input: { y: 2 } },
            ],
          },
          { deltas: ["done"] },
        ]),
    });
    await runner.run(baseTask(), (e) => events.push(e));

    const relevant = events.filter(
      (e) => e.type === "tool_call_started" || e.type === "tool_call_finished",
    );
    expect(relevant.map((e) => e.type)).toEqual([
      "tool_call_started",
      "tool_call_finished",
      "tool_call_started",
      "tool_call_finished",
    ]);

    const started1 = relevant[0] as Extract<AgentEvent, { type: "tool_call_started" }>;
    expect(started1.id).toBe("1");
    expect(started1.name).toBe("a");
    expect(started1.summary).toContain("a:");

    const finished1 = relevant[1] as Extract<AgentEvent, { type: "tool_call_finished" }>;
    expect(finished1.id).toBe("1");
    expect(finished1.isError).toBe(false);
    expect(finished1.resultPreview).toBe("A-result"); // first line only

    const finished2 = relevant[3] as Extract<AgentEvent, { type: "tool_call_finished" }>;
    expect(finished2.id).toBe("2");
    expect(finished2.isError).toBe(true);
  });
});
