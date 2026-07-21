import { describe, expect, it } from "vitest";
import type { ChatRequest } from "@cox/core";
import { classify, RUBRIC } from "../src/classify";
import { mapClassifiedTier } from "../src/policy";
import { createClassifyMockModel, createMockModel } from "./helpers/mockModel";

describe("scout classification — request shape (R2.1)", () => {
  it("R2.1: issues exactly one ChatModel.stream call", async () => {
    let calls = 0;
    const model = createClassifyMockModel('{"task_type":"question","complexity":1,"est_output_tokens":100}', undefined, {
      onRequest: () => {
        calls++;
      },
    });
    await classify(model, "what does this function do?");
    expect(calls).toBe(1);
  });

  it("R2.1: request is { system: RUBRIC, one user message, tools: [], maxTokens: 128, effort: 'low' }", async () => {
    let captured: ChatRequest | undefined;
    const model = createClassifyMockModel('{"task_type":"question","complexity":1,"est_output_tokens":100}', undefined, {
      onRequest: (req) => {
        captured = req;
      },
    });
    await classify(model, "rename this variable");

    expect(captured).toBeDefined();
    expect(captured!.system).toBe(RUBRIC);
    expect(captured!.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "rename this variable" }] },
    ]);
    expect(captured!.tools).toEqual([]);
    expect(captured!.maxTokens).toBe(128);
    expect(captured!.effort).toBe("low");
  });

  it("R2.1: the task text is passed verbatim as the sole user message", async () => {
    let captured: ChatRequest | undefined;
    const model = createClassifyMockModel('{"task_type":"debug","complexity":3,"est_output_tokens":500}', undefined, {
      onRequest: (req) => {
        captured = req;
      },
    });
    const text = "the login flow throws a 500 intermittently";
    await classify(model, text);
    expect(captured!.messages[0]!.content[0]).toEqual({ type: "text", text });
  });
});

describe("scout classification — rubric stability (R2.2)", () => {
  it("R2.2: RUBRIC is sent identically (same value) across separate calls", async () => {
    const seen: string[] = [];
    const model = createClassifyMockModel('{"task_type":"question","complexity":1,"est_output_tokens":100}', undefined, {
      onRequest: (req) => {
        seen.push(req.system);
      },
    });
    await classify(model, "first call");
    await classify(model, "a completely different second call");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toBe(RUBRIC);
  });

  it("R2.2: RUBRIC is a module-level constant carrying the strict-JSON shape the model must echo", () => {
    expect(RUBRIC).toContain(
      '{"task_type":"question|mechanical-edit|feature|debug|architecture","complexity":1,"est_output_tokens":800}',
    );
    expect(RUBRIC).toContain("ONLY strict JSON");
    expect(RUBRIC).toContain("no markdown fences");
  });
});

describe("scout classification — parse + tier mapping (R2.3)", () => {
  it("R2.3: parses a well-formed response into taskType/complexity/estOutputTokens", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":2,"est_output_tokens":900}');
    const outcome = await classify(model, "add a retry button");
    expect(outcome.parsed).toEqual({
      taskType: "feature",
      complexity: 2,
      estOutputTokens: 900,
    });
    expect(outcome.usage).not.toBeNull();
  });

  it("R2.3: strips a single ```json fenced wrapper before parsing", async () => {
    const model = createClassifyMockModel(
      '```json\n{"task_type":"debug","complexity":3,"est_output_tokens":700}\n```',
    );
    const outcome = await classify(model, "why does the build fail");
    expect(outcome.parsed).toEqual({ taskType: "debug", complexity: 3, estOutputTokens: 700 });
  });

  const MAPPING_CASES: [string, number, string][] = [
    ["question", 1, "scout"],
    ["mechanical-edit", 2, "scout"],
    ["feature", 2, "builder"],
    ["debug", 3, "builder"],
    ["architecture", 1, "architect"],
  ];

  it.each(MAPPING_CASES)(
    "R2.3: task_type=%s complexity=%i -> tier %s",
    async (taskType, complexity, expectedTier) => {
      const model = createClassifyMockModel(
        `{"task_type":"${taskType}","complexity":${complexity},"est_output_tokens":500}`,
      );
      const outcome = await classify(model, "some task");
      expect(outcome.parsed).not.toBeNull();
      const mapped = mapClassifiedTier(outcome.parsed!);
      expect(mapped.tier).toBe(expectedTier);
    },
  );

  it("R2.3: complexity >= 4 bumps the mapped tier one step", async () => {
    const model = createClassifyMockModel('{"task_type":"question","complexity":4,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    const mapped = mapClassifiedTier(outcome.parsed!);
    expect(mapped.tier).toBe("builder"); // question -> scout, bumped by complexity 4
  });

  it("R2.3: complexity bump is capped at architect (already-architect stays architect)", async () => {
    const model = createClassifyMockModel('{"task_type":"architecture","complexity":5,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    const mapped = mapClassifiedTier(outcome.parsed!);
    expect(mapped.tier).toBe("architect");
  });

  it("R2.3: reasons are 'classified task-type=<t> complexity=<n>' then 'tier <tier> per routing table'", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":2,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    const mapped = mapClassifiedTier(outcome.parsed!);
    expect(mapped.reasons).toEqual([
      "classified task-type=feature complexity=2",
      "tier builder per routing table",
    ]);
  });

  it("R2.3: a bumped tier is reflected in the 'tier <tier> per routing table' reason", async () => {
    const model = createClassifyMockModel('{"task_type":"debug","complexity":4,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    const mapped = mapClassifiedTier(outcome.parsed!);
    expect(mapped.tier).toBe("architect"); // debug -> builder, bumped by complexity 4
    expect(mapped.reasons).toEqual([
      "classified task-type=debug complexity=4",
      "tier architect per routing table",
    ]);
  });
});

describe("scout classification — sanity: mock model plumbing", () => {
  it("createMockModel's estimateTokens is a chars/4 heuristic (sanity check for other suites)", () => {
    const model = createMockModel();
    expect(model.estimateTokens("12345678")).toBe(2);
  });
});
