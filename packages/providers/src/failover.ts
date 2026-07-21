import type { ChatModel, ChatRequest, StreamEvent } from "@cox/core";
import { isRetryable } from "./errors.js";

/**
 * R4 — wraps an ordered list of candidate models (tier `primary` + configured
 * `fallbacks`) as a single ChatModel. `ref`/`estimateTokens` delegate to the
 * first (primary) model (R4.3).
 */
export function createFailoverChatModel(models: ChatModel[]): ChatModel {
  const primary = models[0];
  if (!primary) {
    throw new Error("createFailoverChatModel: at least one model is required");
  }

  return {
    ref: primary.ref,
    estimateTokens: (text: string) => primary.estimateTokens(text),
    async *stream(req: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        if (!model) continue; // unreachable given the loop bound, keeps noUncheckedIndexedAccess happy
        let yielded = 0;
        try {
          for await (const event of model.stream(req, signal)) {
            yielded++;
            yield event;
          }
          return;
        } catch (err) {
          const hasMore = i < models.length - 1;
          if (yielded === 0 && isRetryable(err) && hasMore) {
            continue; // R4.1: advance to the next candidate and restart
          }
          throw err; // R4.2: yielded already, non-retryable, or exhausted
        }
      }
    },
  };
}
