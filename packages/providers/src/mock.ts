import type { ChatModel, ChatRequest, ModelRef, StopReason, StreamEvent, TokenUsage } from "@cox/core";
import { providerError } from "./errors.js";
import { estimateTokens } from "./estimate.js";

/**
 * One scripted `stream()` call: yields `textDeltas` then `toolUses`, then one
 * `usage` event, then one `done` event — or, if `failWith` is set, throws
 * instead of yielding anything.
 */
export interface MockTurn {
  textDeltas?: string[];
  toolUses?: { id: string; name: string; input: unknown }[];
  usage?: Partial<TokenUsage>;
  /** Default "end_turn", or "tool_use" when `toolUses` is non-empty. */
  stopReason?: StopReason;
  failWith?: { message: string; retryable: boolean };
}

const DEFAULT_REF: ModelRef = { provider: "mock", model: "mock-model" };

function toUsage(partial: Partial<TokenUsage> | undefined): TokenUsage {
  return {
    inputTokens: partial?.inputTokens ?? 0,
    outputTokens: partial?.outputTokens ?? 0,
    cacheReadTokens: partial?.cacheReadTokens ?? 0,
    cacheWriteTokens: partial?.cacheWriteTokens ?? 0,
  };
}

/**
 * Scripted `ChatModel` for zero-network integration tests (R6). Each call to
 * `stream()` consumes the next turn from `script`, in order.
 */
export function createMockModel(script: MockTurn[], ref: ModelRef = DEFAULT_REF): ChatModel {
  let cursor = 0;

  return {
    ref,
    estimateTokens,
    async *stream(_req: ChatRequest, _signal?: AbortSignal): AsyncIterable<StreamEvent> {
      const turn = script[cursor];
      if (!turn) {
        throw new Error(
          `mock model "${ref.provider}/${ref.model}": script exhausted after ${cursor} turn(s) — stream() was called again`,
        );
      }
      cursor++;

      if (turn.failWith) {
        throw providerError(turn.failWith.message, turn.failWith.retryable);
      }

      for (const text of turn.textDeltas ?? []) {
        yield { type: "text_delta", text };
      }
      for (const toolUse of turn.toolUses ?? []) {
        yield { type: "tool_use", id: toolUse.id, name: toolUse.name, input: toolUse.input };
      }
      yield { type: "usage", usage: toUsage(turn.usage) };
      const stopReason: StopReason =
        turn.stopReason ?? ((turn.toolUses?.length ?? 0) > 0 ? "tool_use" : "end_turn");
      yield { type: "done", stopReason };
    },
  };
}
