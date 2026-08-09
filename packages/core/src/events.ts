import type { AgentEvent } from "./types.js";
import { createLogger } from "./logger.js";

export type EventListener = (event: AgentEvent) => void;

const log = createLogger("eventbus");

/**
 * Minimal synchronous event bus. One bus per session; the TUI, ledger, and
 * hooks engine subscribe; the agent loop, router, and spec engine emit.
 * Listener errors are swallowed (a broken renderer must not kill the agent).
 */
export class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        try {
          log.error({ err, eventType: event.type }, "EventBus listener error");
        } catch {
          // logger must never throw into agent loop
        }
      }
    }
  }
}
