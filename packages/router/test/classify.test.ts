import { afterEach, describe, expect, it, vi } from "vitest";
import { configSchema, type ChatRequest, type RoutingInput } from "@cox/core";
import { classify, RUBRIC } from "../src/classify";
import { mapClassifiedTier } from "../src/policy";
import { createRouter } from "../src/index";
import { createClassifyMockModel, createMockModel } from "./helpers/mockModel";
import { createStubLedger } from "./helpers/mockLedger";

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

describe("scout classification — parse failures (R2.4, classify() level)", () => {
  it("R2.4: garbage (non-JSON) text yields parsed: null", async () => {
    const model = createClassifyMockModel("sure, I can help with that!");
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: task_type outside the enum yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"urgent","complexity":2,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: complexity as a wrong-typed value (string) yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":"high","est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: complexity out of 1-5 range yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":9,"est_output_tokens":500}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: non-integer est_output_tokens yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":2,"est_output_tokens":12.5}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: non-positive est_output_tokens yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":2,"est_output_tokens":0}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: missing a required field yields parsed: null", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":2}');
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: parse failure still surfaces usage when a usage event arrived (ledgering happens regardless — task 10)", async () => {
    const model = createClassifyMockModel("not json at all");
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
    expect(outcome.usage).not.toBeNull();
  });

  it("R2.4: a stream error yields parsed: null", async () => {
    const model = createMockModel({
      events: [{ type: "text_delta", text: "partial" }],
      throwError: new Error("connection reset"),
    });
    const outcome = await classify(model, "some task");
    expect(outcome.parsed).toBeNull();
  });

  it("R2.4: a stream error with no usage event yields usage: null (caller must skip ledgering)", async () => {
    const model = createMockModel({
      events: [{ type: "text_delta", text: "partial" }], // no usage event before the throw
      throwError: new Error("connection reset"),
    });
    const outcome = await classify(model, "some task");
    expect(outcome.usage).toBeNull();
  });
});

describe("scout classification — timeout (R2.4)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("R2.4: a call exceeding 3000ms aborts via AbortSignal and yields parsed: null, usage: null", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const model = createMockModel({
      hang: true,
      onRequest: (_req, signal) => {
        capturedSignal = signal;
      },
    });

    const outcomePromise = classify(model, "this call hangs");
    await vi.advanceTimersByTimeAsync(3100);
    const outcome = await outcomePromise;

    expect(outcome.parsed).toBeNull();
    expect(outcome.usage).toBeNull();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("R2.4: does not resolve early — a hang just under 3000ms is still pending", async () => {
    vi.useFakeTimers();
    const model = createMockModel({ hang: true });
    let settled = false;
    void classify(model, "this call hangs").then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(2900);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200); // cross the 3000ms line
    expect(settled).toBe(true);
  });
});

describe("router fallback on classification failure (R2.4, route() level)", () => {
  const base: RoutingInput = {
    kind: "chat",
    text: "some ambiguous prompt",
    contextTokens: 1000,
    sessionId: "s1",
  };
  const config = configSchema.parse({});

  afterEach(() => {
    vi.useRealTimers();
  });

  async function routeWith(model: ReturnType<typeof createMockModel>) {
    const router = createRouter({
      config,
      ledger: createStubLedger(),
      classifyModel: () => model,
      now: () => "2026-07-20T12:00:00.000Z",
    });
    return router.route(base);
  }

  it("R2.4: garbage JSON falls back to defaultTier with reason 'classification failed'", async () => {
    const model = createClassifyMockModel("not json");
    const decision = await routeWith(model);
    expect(decision.tier).toBe(config.routing.defaultTier);
    expect(decision.reasons).toEqual(["classification failed"]);
  });

  it("R2.4: wrong field types fall back to defaultTier with reason 'classification failed'", async () => {
    const model = createClassifyMockModel('{"task_type":"feature","complexity":"nope","est_output_tokens":500}');
    const decision = await routeWith(model);
    expect(decision.tier).toBe(config.routing.defaultTier);
    expect(decision.reasons).toEqual(["classification failed"]);
  });

  it("R2.4: a stream error falls back to defaultTier with reason 'classification failed'", async () => {
    const model = createMockModel({ throwError: new Error("boom") });
    const decision = await routeWith(model);
    expect(decision.tier).toBe(config.routing.defaultTier);
    expect(decision.reasons).toEqual(["classification failed"]);
  });

  it("R2.4: a >3000ms hang falls back to defaultTier with reason 'classification failed', no retry", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const model = createMockModel({
      hang: true,
      onRequest: () => {
        calls++;
      },
    });
    const decisionPromise = routeWith(model);
    await vi.advanceTimersByTimeAsync(3100);
    const decision = await decisionPromise;

    expect(decision.tier).toBe(config.routing.defaultTier);
    expect(decision.reasons).toEqual(["classification failed"]);
    expect(calls).toBe(1); // no retry
  });

  it("R2.4: no retries — stream() is called exactly once even on parse failure", async () => {
    let calls = 0;
    const model = createClassifyMockModel("garbage", undefined, {
      onRequest: () => {
        calls++;
      },
    });
    await routeWith(model);
    expect(calls).toBe(1);
  });
});
