/**
 * cox explain / cox suggest (R9.1-R9.2): a single tool-less ChatModel.stream
 * call on the tier `router.route({kind:"oneshot", …})` picks, printing the
 * streamed text and writing one LedgerEntry directly — no AgentRunner.
 */
import {
  computeCostUsd,
  pricingFor,
  ZERO_USAGE,
  type ChatModel,
  type Ledger,
  type Router,
  type Tier,
  type TokenUsage,
} from "@cox/core";

export type OneshotKind = "explain" | "suggest";

export interface OneshotDeps {
  router: Router;
  tierModel: (tier: Tier) => ChatModel;
  ledger: Ledger;
  sessionId: string;
  write?: (text: string) => void;
  now?: () => string; // ISO 8601, for the ledger entry's `ts`
}

function oneshotSystem(kind: OneshotKind): string {
  if (kind === "explain") {
    return [
      "You are Coxswain's one-shot explainer. Given a shell command or a",
      "snippet of code, explain concisely what it does and any non-obvious",
      "side effects or risks. Plain prose, no headers, no code fences around",
      "your explanation. Assume an experienced developer audience — skip the",
      "basics, focus on what is not obvious.",
    ].join(" ");
  }
  return [
    "You are Coxswain's one-shot shell-command suggester. Given a plain-",
    "English description of what the user wants to do, respond with at",
    "most one short sentence of rationale if it is useful, then the exact",
    "runnable shell command — no code fences, no leading '$', no prose",
    "after it. Output the command alone on the final line.",
  ].join(" ");
}

export async function runOneshot(
  kind: OneshotKind,
  text: string,
  deps: OneshotDeps,
  signal?: AbortSignal,
): Promise<void> {
  const write = deps.write ?? ((s: string) => process.stdout.write(s));
  const now = deps.now ?? (() => new Date().toISOString());

  const decision = await deps.router.route({
    kind: "oneshot",
    text,
    contextTokens: Math.ceil(text.length / 4),
    sessionId: deps.sessionId,
  });
  const model = deps.tierModel(decision.tier);

  const start = Date.now();
  let usage: TokenUsage = ZERO_USAGE;
  for await (const event of model.stream(
    {
      system: oneshotSystem(kind),
      messages: [{ role: "user", content: [{ type: "text", text }] }],
      tools: [],
      maxTokens: 1024,
    },
    signal,
  )) {
    if (event.type === "text_delta") {
      write(event.text);
    } else if (event.type === "usage") {
      usage = event.usage;
    }
  }
  write("\n");
  const durationMs = Date.now() - start;

  const pricing = pricingFor(model.ref.provider, model.ref.model);
  await deps.ledger.record({
    ts: now(),
    sessionId: deps.sessionId,
    kind: "oneshot",
    tier: decision.tier,
    model: model.ref,
    usage,
    costUsd: pricing ? computeCostUsd(usage, pricing) : null,
    routingReasons: decision.reasons,
    durationMs,
  });
}
