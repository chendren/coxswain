/**
 * `cox replay <file.jsonl>` (R5.1-R5.3). Streams a recorded AgentEvent
 * stream through the real @cox/tui App at ~30 events/second with a
 * read-only stub SessionController — works with only @cox/core + @cox/tui
 * implemented (R5.2, M1 — no engines, no network: this file imports
 * neither).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EventBus, type AgentEvent, type SessionController } from "@cox/core";
import { startTui } from "@cox/tui";
import { createSnapshotStore, type SnapshotStore } from "../snapshot";

const KNOWN_EVENT_TYPES: ReadonlySet<AgentEvent["type"]> = new Set([
  "session_started",
  "user_prompt",
  "routing_decision",
  "model_call_started",
  "text_delta",
  "thinking_delta",
  "tool_call_started",
  "permission_request",
  "tool_call_finished",
  "model_call_finished",
  "escalation",
  "budget_alert",
  "spec_event",
  "hook_fired",
  "agent_message",
  "error",
  "turn_done",
]);

function isKnownEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const type = (value as { type: unknown }).type;
  return typeof type === "string" && KNOWN_EVENT_TYPES.has(type as AgentEvent["type"]);
}

function readonlyStubController(sessionId: string): SessionController {
  return {
    sessionId,
    submitPrompt: () => {},
    submitCommand: () => {},
    resolvePermission: () => {},
    interrupt: () => {},
  };
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

export interface ReplayOptions {
  cwd: string;
  /** Emission cadence; default 33ms (~30/s, R5.1). Tests pass 0. */
  intervalMs?: number;
  /** Grace period after the last event before unmounting; default 500ms. */
  graceMs?: number;
  warn?: (message: string) => void;
}

export interface ReplayResult {
  eventsPlayed: number;
  skipped: number;
  fold: SnapshotStore;
}

/** Parses `raw` (JSONL) into known AgentEvents, warning+skipping the rest. */
export function parseEventLines(
  raw: string,
  warn: (message: string) => void,
): { events: AgentEvent[]; skipped: number } {
  const events: AgentEvent[] = [];
  let skipped = 0;
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      warn(`line ${i + 1}: invalid JSON — skipping`);
      skipped++;
      continue;
    }
    if (!isKnownEvent(parsed)) {
      const type = (parsed as { type?: unknown } | null)?.type;
      warn(`line ${i + 1}: unknown event type ${JSON.stringify(type)} — skipping`);
      skipped++;
      continue;
    }
    events.push(parsed);
  }
  return { events, skipped };
}

export async function runReplay(file: string, opts: ReplayOptions): Promise<ReplayResult> {
  const path = resolve(opts.cwd, file);
  const raw = await readFile(path, "utf8");
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`cox replay: ${m}\n`));
  const intervalMs = opts.intervalMs ?? 33;
  const graceMs = opts.graceMs ?? 500;

  const { events, skipped } = parseEventLines(raw, warn);

  const started = events.find((e) => e.type === "session_started");
  const sessionId = started && started.type === "session_started" ? started.sessionId : "replay";

  const bus = new EventBus();
  const fold = createSnapshotStore({ sessionId, budgets: { warnAt: 0.8, hardStop: true } });
  // Subscribed before the TUI mounts so getSnapshot() reflects each event
  // by the time the TUI's own listener reads it for the same event.
  bus.subscribe(fold.onEvent);

  const tui = startTui({
    bus,
    controller: readonlyStubController(sessionId),
    getSnapshot: fold.get,
    readonly: true,
  });

  for (const event of events) {
    bus.emit(event);
    await sleep(intervalMs);
  }
  await sleep(graceMs);
  tui.unmount();

  return { eventsPlayed: events.length, skipped, fold };
}
