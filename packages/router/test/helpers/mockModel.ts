/**
 * Local scripted ChatModel for router tests. Never import @cox/providers —
 * this stands in for any real provider adapter.
 */
import type { ChatRequest, ChatModel, ModelRef, StreamEvent, TokenUsage } from "@cox/core";

export interface MockModelOptions {
  ref?: ModelRef;
  /** Static list of events to yield, in order. */
  events?: StreamEvent[];
  /** Never yields; only settles (by rejecting) if the passed signal aborts. */
  hang?: boolean;
  /** Thrown after yielding `events` (simulates a stream error). */
  throwError?: Error;
  /** Observe the request/signal passed to stream(), e.g. to assert shape. */
  onRequest?: (req: ChatRequest, signal?: AbortSignal) => void;
}

export function createMockModel(opts: MockModelOptions = {}): ChatModel {
  const ref = opts.ref ?? { provider: "anthropic", model: "claude-haiku-4-5" };
  return {
    ref,
    estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
    async *stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
      opts.onRequest?.(req, signal);

      if (opts.hang) {
        await new Promise<void>((_resolve, reject) => {
          if (!signal) return; // no way to ever settle — intentional hang
          if (signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
        return;
      }

      for (const event of opts.events ?? []) {
        yield event;
      }
      if (opts.throwError) {
        throw opts.throwError;
      }
    },
  };
}

const DEFAULT_USAGE: TokenUsage = {
  inputTokens: 50,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * A model that replies to a classification call with `responseText` as a
 * single text_delta, then a usage event, then done.
 */
export function createClassifyMockModel(
  responseText: string,
  usage: TokenUsage = DEFAULT_USAGE,
  opts: Omit<MockModelOptions, "events"> = {},
): ChatModel {
  return createMockModel({
    ...opts,
    events: [
      { type: "text_delta", text: responseText },
      { type: "usage", usage },
      { type: "done", stopReason: "end_turn" },
    ],
  });
}
