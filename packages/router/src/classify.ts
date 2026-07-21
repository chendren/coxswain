import type { ChatModel, ChatRequest, TokenUsage } from "@cox/core";

export type ClassifyTaskType =
  | "question"
  | "mechanical-edit"
  | "feature"
  | "debug"
  | "architecture";

export interface ClassifyParsed {
  taskType: ClassifyTaskType;
  complexity: number;
  estOutputTokens: number;
}

export interface ClassifyOutcome {
  /** null on parse/validation failure (R2.4) — caller falls back to defaultTier. */
  parsed: ClassifyParsed | null;
  /**
   * null when no usage event arrived (timeout, or the stream errored before
   * any usage event) — caller must skip ledgering in that case (R2.5).
   */
  usage: TokenUsage | null;
}

const TASK_TYPES: readonly ClassifyTaskType[] = [
  "question",
  "mechanical-edit",
  "feature",
  "debug",
  "architecture",
];

const TIMEOUT_MS = 3000;

/** Verbatim, byte-stable rubric (R2.2) — prompt-cache friendliness depends on it never changing. */
export const RUBRIC = `You classify coding-agent tasks for model routing. Reply with ONLY strict JSON, no prose, no markdown fences, exactly this shape:
{"task_type":"question|mechanical-edit|feature|debug|architecture","complexity":1,"est_output_tokens":800}
Field rules: task_type is one of the five literals; complexity is an integer 1-5 (1 trivial .. 5 novel/architectural); est_output_tokens is a positive integer estimate of assistant output size.
Definitions: question = explain/answer, no edits expected. mechanical-edit = rename/small tweak/single obvious change. feature = implement or modify behavior in one or a few files. debug = diagnose a failure, may iterate. architecture = design decisions, cross-cutting refactors, new subsystems.`;

/**
 * Parsing (R2.3): concatenate text_deltas, trim, strip a single optional
 * ```json ... ``` fence, JSON.parse, then hand-validate fields. Any failure
 * (parse error, missing/wrong-typed field, out-of-range value) -> null.
 */
function parseClassification(raw: string): ClassifyParsed | null {
  let text = raw.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenceMatch) text = fenceMatch[1]!.trim();

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const taskType = o.task_type;
  if (typeof taskType !== "string" || !TASK_TYPES.includes(taskType as ClassifyTaskType)) {
    return null;
  }

  const complexity = o.complexity;
  if (
    typeof complexity !== "number" ||
    !Number.isInteger(complexity) ||
    complexity < 1 ||
    complexity > 5
  ) {
    return null;
  }

  const estOutputTokens = o.est_output_tokens;
  if (
    typeof estOutputTokens !== "number" ||
    !Number.isInteger(estOutputTokens) ||
    estOutputTokens <= 0
  ) {
    return null;
  }

  return { taskType: taskType as ClassifyTaskType, complexity, estOutputTokens };
}

/**
 * Exactly one ChatModel.stream call (R2.1): fixed RUBRIC as system, the task
 * text as the sole user message, tools: [], maxTokens: 128, effort: "low".
 * Races the stream against a 3000ms timeout, aborting via AbortSignal on
 * expiry (R2.4). Never retries. Returns { parsed: null, usage: null } on
 * timeout — the caller skips ledgering and falls back to defaultTier.
 */
export async function classify(model: ChatModel, text: string): Promise<ClassifyOutcome> {
  const controller = new AbortController();
  let usage: TokenUsage | null = null;
  let textOut = "";

  const req: ChatRequest = {
    system: RUBRIC,
    messages: [{ role: "user", content: [{ type: "text", text }] }],
    tools: [],
    maxTokens: 128,
    effort: "low",
  };

  const consume = (async () => {
    try {
      for await (const event of model.stream(req, controller.signal)) {
        if (event.type === "text_delta") textOut += event.text;
        else if (event.type === "usage") usage = event.usage;
      }
    } catch {
      // Stream error (R2.4): usage may already be set from an earlier event;
      // textOut parsing below will fail closed if nothing usable arrived.
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    consume.then(() => false as const),
    new Promise<true>((resolve) => {
      timer = setTimeout(() => resolve(true), TIMEOUT_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);

  if (timedOut) {
    controller.abort();
    return { parsed: null, usage: null };
  }

  return { parsed: parseClassification(textOut), usage };
}
