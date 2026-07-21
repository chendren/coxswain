/**
 * <App> — subscribes to the session EventBus and owns all render state
 * (docs/specs/tui-cli/design.md "App state model"). One `bus.subscribe` on
 * mount; every AgentEvent goes through a reducer-style switch that updates
 * `entries` (settled, Static) / `live` (transient) / `modal` / `snapshot`.
 *
 * Event handling here covers R1.1 (partial — user_prompt, text_delta,
 * agent_message, error, turn_done), R1.2 (streaming dedupe), R1.6 (a
 * throwing render never reaches here — core's EventBus already swallows
 * listener errors, so this component doesn't need its own try/catch). The
 * remaining 12 AgentEvent variants are added in task 6.
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
import type { AgentEvent, EventBus, SessionController, SessionSnapshot } from "@cox/core";
import { formatUsd } from "./format";
import { EMPTY_LIVE, Transcript, type LiveState, type TranscriptEntry } from "./components/Transcript";

export interface AppProps {
  bus: EventBus;
  controller: SessionController;
  getSnapshot: () => SessionSnapshot;
  readonly?: boolean;
}

// `controller` is unused until Input (task 10) / PermissionPrompt (task 9)
// wire it up for submitPrompt/submitCommand/resolvePermission/interrupt.
export function App({ bus, getSnapshot }: AppProps): React.JSX.Element {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [, setSnapshot] = useState<SessionSnapshot>(getSnapshot);

  // Refs mirror the state above so the event handler (subscribed once,
  // below) always reads the current value instead of a stale closure over
  // the render that first registered it.
  const entriesRef = useRef<TranscriptEntry[]>([]);
  const liveRef = useRef<LiveState>(EMPTY_LIVE);
  const sawDeltaThisTurn = useRef(false);
  const nextId = useRef(0);

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
        case "user_prompt": {
          pushEntry(<Text bold>{`❯ ${e.text}`}</Text>);
          break;
        }
        case "text_delta": {
          sawDeltaThisTurn.current = true;
          setLiveBoth({ ...liveRef.current, text: liveRef.current.text + e.text });
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
          break;
        }
        case "turn_done": {
          if (liveRef.current.text.length > 0) {
            pushEntry(<Text>{liveRef.current.text}</Text>);
          }
          pushEntry(<Text dimColor>{`· turn ${formatUsd(e.costUsd)}`}</Text>);
          setLiveBoth(EMPTY_LIVE);
          sawDeltaThisTurn.current = false;
          break;
        }
        default:
          break; // remaining AgentEvent variants: task 6
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
