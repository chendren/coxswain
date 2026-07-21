/**
 * <App> — subscribes to the session EventBus and owns all render state
 * (docs/specs/tui-cli/design.md "App state model"). One `bus.subscribe` on
 * mount; every AgentEvent goes through a reducer-style switch that updates
 * `entries` (settled, Static) / `live` (transient) / `modal` / `snapshot`.
 *
 * Covers all 17 AgentEvent variants (R1.1, R1.2, R1.5, R1.6) per
 * docs/specs/tui-cli/design.md's "Event -> render mapping" table.
 * `permission_request` opens the PermissionPrompt modal (R3.1); its
 * `onDecision` calls `SessionController.resolvePermission` and clears the
 * modal (R3.2). Input.tsx (below the status line) owns
 * submitPrompt/submitCommand/interrupt (R4.*); it is not rendered in
 * `readonly` mode (cox replay).
 */
// Explicit default import (not just the named hooks below): despite this
// package's tsconfig setting `jsx: "react-jsx"`, the esbuild-based runtime
// transforms used by `tsx` and vitest's Vite pipeline emit the classic
// `React.createElement(...)` pragma rather than the automatic
// `react/jsx-runtime` import — confirmed by a `ReferenceError: React is not
// defined` at runtime (tsc itself never catches this since --noEmit
// typechecks against tsconfig's jsx setting, it doesn't execute anything).
// Importing React explicitly works under either transform.
import React, { useLayoutEffect, useRef, useState } from "react";
import { Box, render, Text, type Instance } from "ink";
import type {
  AgentEvent,
  EventBus,
  PermissionRequest,
  SessionController,
  SessionSnapshot,
} from "@cox/core";
import { formatDuration, formatTokens, formatUsd } from "./format";
import { EMPTY_LIVE, Transcript, type LiveState, type TranscriptEntry } from "./components/Transcript";
import { RoutingAnnouncement } from "./components/RoutingAnnouncement";
import { StatusLine } from "./components/StatusLine";
import { PermissionPrompt } from "./components/PermissionPrompt";
import { Input } from "./components/Input";

export interface AppProps {
  bus: EventBus;
  controller: SessionController;
  getSnapshot: () => SessionSnapshot;
  readonly?: boolean;
}

export function App({ bus, controller, getSnapshot, readonly }: AppProps): React.JSX.Element {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [modal, setModal] = useState<PermissionRequest | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(getSnapshot);
  // R4.3: Esc only interrupts while a turn is actually running. Tracked
  // from user_prompt (start) to turn_done/error (end) — the agent loop's
  // other terminal stopReasons (aborted/max_turns/budget_stop) don't emit
  // a dedicated event, so this can under-reset in those cases; interrupt()
  // on an already-finished turn is expected to be a harmless no-op.
  const [turnRunning, setTurnRunning] = useState(false);

  // Refs mirror the state above so the event handler (subscribed once,
  // below) always reads the current value instead of a stale closure over
  // the render that first registered it.
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const liveRef = useRef<LiveState>(EMPTY_LIVE);
  const sawDeltaThisTurn = useRef(false);
  const nextId = useRef(0);
  const lastUserPromptText = useRef("");
  // routing_decision carries no taskId (AgentEvent's shape has none); the
  // closest available signal is the most recent spec_event's taskId, which
  // spec-engine's runTask flow emits immediately before the agent.run(...)
  // call that produces the matching routing_decision. See
  // INTEGRATION-NOTES.md (task 6) — genuine contract gap, this is a
  // best-effort inference, not a documented guarantee.
  const lastSpecTaskId = useRef<string | undefined>(undefined);
  const thinkingAccum = useRef("");

  function pushEntry(node: React.ReactNode): void {
    const entry = { id: nextId.current++, node };
    entriesRef.current = [...entriesRef.current, entry];
    setEntries(entriesRef.current);
  }

  function setLiveBoth(next: LiveState): void {
    liveRef.current = next;
    setLive(next);
  }

  // useLayoutEffect (not useEffect): the subscription must be active
  // before this function returns control to the caller of startTui/render
  // — callers (replay.ts, print.ts) may start emitting events immediately
  // after mounting, and a passive effect's deferred timing would drop
  // whatever is emitted before it gets a chance to run.
  useLayoutEffect(() => {
    const handleEvent = (e: AgentEvent): void => {
      switch (e.type) {
        case "session_started": {
          pushEntry(<Text dimColor>{`session ${e.sessionId} · ${e.cwd}`}</Text>);
          break;
        }
        case "user_prompt": {
          lastUserPromptText.current = e.text;
          pushEntry(<Text bold>{`❯ ${e.text}`}</Text>);
          setTurnRunning(true);
          break;
        }
        case "routing_decision": {
          const label =
            e.kind === "spec-task-exec"
              ? `spec task ${lastSpecTaskId.current ?? "?"}`
              : `"${lastUserPromptText.current.slice(0, 40)}"`;
          const snapshot = getSnapshot();
          pushEntry(
            <RoutingAnnouncement
              decision={e.decision}
              label={label}
              spentUsd={snapshot.budget.spentUsd}
              limitUsd={snapshot.budget.limitUsd}
            />,
          );
          break;
        }
        case "model_call_started": {
          setLiveBoth({ ...liveRef.current, spinner: `⠋ ${e.tier} ${e.model.model} …` });
          break;
        }
        case "text_delta": {
          sawDeltaThisTurn.current = true;
          setLiveBoth({ ...liveRef.current, text: liveRef.current.text + e.text });
          break;
        }
        case "thinking_delta": {
          thinkingAccum.current = (thinkingAccum.current + e.text).slice(-200);
          setLiveBoth({ ...liveRef.current, thinking: thinkingAccum.current.slice(-60) });
          break;
        }
        case "tool_call_started": {
          setLiveBoth({
            ...liveRef.current,
            tools: { ...liveRef.current.tools, [e.id]: { name: e.name, summary: e.summary } },
          });
          break;
        }
        case "permission_request": {
          setModal(e.request);
          break;
        }
        case "tool_call_finished": {
          const started = liveRef.current.tools[e.id];
          const summary = started?.summary ?? "";
          const name = started?.name ?? e.name;
          const line = `${e.isError ? "✗" : "✓"} ${name} ${summary} · ${e.resultPreview}`;
          pushEntry(<Text color={e.isError ? "red" : "green"}>{line}</Text>);
          const remainingTools = { ...liveRef.current.tools };
          delete remainingTools[e.id];
          setLiveBoth({ ...liveRef.current, tools: remainingTools });
          break;
        }
        case "model_call_finished": {
          const line = `─ actual: ${formatTokens(e.usage.inputTokens)} in (${formatTokens(
            e.usage.cacheReadTokens,
          )} cached) / ${formatTokens(e.usage.outputTokens)} out · ${formatUsd(e.costUsd)} · ${formatDuration(
            e.durationMs,
          )}`;
          pushEntry(<Text dimColor>{line}</Text>);
          setLiveBoth({ ...liveRef.current, spinner: undefined });
          break;
        }
        case "escalation": {
          pushEntry(
            <Text color="yellow">{`⚠ escalated ${e.from}→${e.to}: ${e.reasons.join(" · ")}`}</Text>,
          );
          break;
        }
        case "budget_alert": {
          const limit = e.state.limitUsd === undefined ? "∞" : formatUsd(e.state.limitUsd);
          const scope = e.state.scope ?? "session";
          const headline = `▲ budget ${formatUsd(e.state.spentUsd)}/${limit} (${scope})`;
          if (e.state.level === "exceeded") {
            pushEntry(
              <Box flexDirection="column">
                <Text color="red">{headline}</Text>
                <Text color="red">{"type /budget extend <usd>"}</Text>
              </Box>,
            );
          } else {
            pushEntry(<Text color="yellow">{headline}</Text>);
          }
          break;
        }
        case "spec_event": {
          if (e.taskId) lastSpecTaskId.current = e.taskId;
          const taskSuffix = e.taskId ? ` · task ${e.taskId}` : "";
          pushEntry(<Text>{`◆ spec ${e.specName} · ${e.phase} · ${e.status}${taskSuffix}`}</Text>);
          break;
        }
        case "hook_fired": {
          const blocked = e.outcomes.filter((o) => o.action === "block");
          pushEntry(
            <Box flexDirection="column">
              <Text dimColor>{`⚓ ${e.event}: ${e.outcomes.length} hook(s)`}</Text>
              {blocked.map((o, i) => (
                <Text key={i} color="red">{`✗ ${o.hook}: ${o.stderr ?? "blocked"}`}</Text>
              ))}
            </Box>,
          );
          break;
        }
        case "agent_message": {
          // R1.2: only render agent_message text when no delta streamed it already this turn.
          if (!sawDeltaThisTurn.current) {
            setLiveBoth({ ...liveRef.current, text: e.text });
          }
          break;
        }
        case "error": {
          pushEntry(<Text color="red">{`✖ ${e.message}`}</Text>);
          setTurnRunning(false);
          break;
        }
        case "turn_done": {
          if (liveRef.current.text.length > 0) {
            pushEntry(<Text>{liveRef.current.text}</Text>);
          }
          pushEntry(<Text dimColor>{`· turn ${formatUsd(e.costUsd)}`}</Text>);
          setLiveBoth(EMPTY_LIVE);
          sawDeltaThisTurn.current = false;
          thinkingAccum.current = "";
          setTurnRunning(false);
          break;
        }
        default: {
          const _exhaustive: never = e;
          void _exhaustive;
          break;
        }
      }
      setSnapshot(getSnapshot());
    };
    const unsubscribe = bus.subscribe(handleEvent);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, getSnapshot]);

  return (
    <Box flexDirection="column">
      <Transcript entries={entries} live={live} />
      {modal ? (
        <PermissionPrompt
          request={modal}
          readonly={readonly}
          onDecision={(decision) => {
            controller.resolvePermission(decision);
            setModal(null);
          }}
        />
      ) : null}
      <StatusLine snapshot={snapshot} />
      {!readonly ? (
        <Input
          controller={controller}
          disabled={modal !== null}
          turnRunning={turnRunning}
          onLocalError={(message) => pushEntry(<Text color="red">{`✖ ${message}`}</Text>)}
        />
      ) : null}
    </Box>
  );
}

export interface TuiHandle {
  waitUntilExit(): Promise<void>;
  unmount(): void;
}

export interface TuiOptions {
  bus: EventBus;
  controller: SessionController;
  getSnapshot: () => SessionSnapshot;
  readonly?: boolean;
}

/** Mounts <App> with Ink. Implemented here (not index.ts) because index.ts
 * stays a plain .ts re-export barrel — JSX requires a .tsx file. */
export function startTui(opts: TuiOptions): TuiHandle {
  const instance: Instance = render(
    <App
      bus={opts.bus}
      controller={opts.controller}
      getSnapshot={opts.getSnapshot}
      readonly={opts.readonly}
    />,
  );
  return {
    waitUntilExit: () => instance.waitUntilExit(),
    unmount: () => instance.unmount(),
  };
}
