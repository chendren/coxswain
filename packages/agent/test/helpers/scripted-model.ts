import type { ChatModel, ChatRequest, ModelRef, StopReason, StreamEvent, TokenUsage } from "@cox/core";
import { ZERO_USAGE } from "@cox/core";

export interface ScriptedTurn {
  deltas?: string[];
  toolUses?: { id: string; name: string; input: unknown }[];
  usage?: Partial<TokenUsage>;
  /** Default: "tool_use" when toolUses is non-empty, else "end_turn". */
  stopReason?: StopReason;
  /** Throw this mid-stream instead of finishing the turn normally. */
  failWith?: Error;
}

const DEFAULT_REF: ModelRef = { provider: "test", model: "scripted-1" };

async function* generate(turn: ScriptedTurn, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  for (const text of turn.deltas ?? []) {
    if (signal?.aborted) throw abortError();
    yield { type: "text_delta", text };
  }
  if (turn.failWith) throw turn.failWith;
  for (const tu of turn.toolUses ?? []) {
    if (signal?.aborted) throw abortError();
    yield { type: "tool_use", id: tu.id, name: tu.name, input: tu.input };
  }
  if (signal?.aborted) throw abortError();
  yield { type: "usage", usage: { ...ZERO_USAGE, ...turn.usage } };
  const stopReason: StopReason = turn.stopReason ?? (turn.toolUses?.length ? "tool_use" : "end_turn");
  yield { type: "done", stopReason };
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

/**
 * R9.1: local ChatModel test double — no @cox/providers import, no network.
 * Each call to `.stream()` consumes the next configured turn (the last turn
 * repeats once the script is exhausted, so open-ended loop tests — e.g.
 * max_turns — don't need to enumerate every iteration). Every ChatRequest
 * passed in is recorded, in order, on `.requests`.
 */
export function scripted(
  turns: ScriptedTurn[],
  ref: ModelRef = DEFAULT_REF,
): ChatModel & { requests: ChatRequest[] } {
  if (turns.length === 0) throw new Error("scripted: at least one turn is required");
  const requests: ChatRequest[] = [];
  let cursor = 0;

  return {
    ref,
    requests,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
      requests.push(req);
      const turn = turns[Math.min(cursor, turns.length - 1)] as ScriptedTurn;
      cursor++;
      return generate(turn, signal);
    },
  };
}
