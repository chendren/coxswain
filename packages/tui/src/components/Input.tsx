/**
 * Input — the prompt line: free text -> submitPrompt (R4.1), `/cmd a b…` ->
 * submitCommand("cmd", ["a","b",…]) after validating `cmd` against the six
 * top-level slash commands (R4.2; unknown commands render a local error
 * without touching the controller), Tab completes those six names on a
 * line starting with `/` (R4.4), Esc calls controller.interrupt() while a
 * turn is running and no modal is open (R4.3). `disabled` (App passes
 * `modal !== null`) sets `isActive: false` on useInput so keystrokes never
 * reach this component while PermissionPrompt owns them (R3.1).
 *
 * The useInput callback is wrapped in useCallback with an empty dep array
 * and reads everything through refs (`latest`, `lineRef`), never the
 * render closure directly. Ink's own useInput re-subscribes in a passive
 * `useEffect` whenever the callback's identity changes (it's in that
 * effect's dependency array) — an inline non-memoized handler is a fresh
 * function every render, so there is a window after each keystroke where
 * the *previous* render's handler (with `line` captured before that
 * keystroke) is still the one attached. Confirmed by a repro: typing
 * "add tests" then Enter as separate stdin.write calls called
 * submitPrompt 0 times, and a slash command followed by more typed
 * characters submitted with the args from *before* those characters were
 * typed. A stable callback + refs removes the whole class of bug rather
 * than chasing one instance of it.
 */
import React, { useCallback, useRef, useState } from "react";
import { Box, Text, useInput, type Key } from "ink";
import type { SessionController } from "@cox/core";

export interface InputProps {
  controller: SessionController;
  disabled?: boolean;
  turnRunning?: boolean;
  onLocalError: (message: string) => void;
}

export const TOP_LEVEL_COMMANDS = ["spec", "steer", "model", "context", "ledger", "budget"] as const;

function longestCommonPrefix(strings: readonly string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0] ?? "";
  for (const s of strings.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

function completeSlash(current: string): string {
  const match = /^\/(\w*)$/.exec(current);
  if (!match) return current;
  const partial = match[1] ?? "";
  const candidates = TOP_LEVEL_COMMANDS.filter((c) => c.startsWith(partial));
  if (candidates.length === 1) return `/${candidates[0]} `;
  if (candidates.length > 1) {
    const commonPrefix = longestCommonPrefix(candidates);
    return commonPrefix.length > partial.length ? `/${commonPrefix}` : current;
  }
  return current;
}

export function Input({ controller, disabled, turnRunning, onLocalError }: InputProps): React.JSX.Element {
  const [line, setLine] = useState("");
  const lineRef = useRef("");
  const latest = useRef({ controller, disabled, turnRunning, onLocalError });
  latest.current = { controller, disabled, turnRunning, onLocalError };

  function setLineBoth(next: string): void {
    lineRef.current = next;
    setLine(next);
  }

  function submit(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (!trimmed.startsWith("/")) {
      latest.current.controller.submitPrompt(trimmed);
      return;
    }
    const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
    if (cmd && (TOP_LEVEL_COMMANDS as readonly string[]).includes(cmd)) {
      latest.current.controller.submitCommand(cmd, args);
    } else {
      latest.current.onLocalError(`unknown command: /${cmd ?? ""}`);
    }
  }

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.escape) {
      if (latest.current.turnRunning) latest.current.controller.interrupt();
      return;
    }
    if (key.return) {
      submit(lineRef.current);
      setLineBoth("");
      return;
    }
    if (key.tab) {
      setLineBoth(completeSlash(lineRef.current));
      return;
    }
    if (key.backspace || key.delete) {
      setLineBoth(lineRef.current.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return; // not handled in v1
    }
    if (input) setLineBoth(lineRef.current + input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput(handleInput, { isActive: !disabled });

  return (
    <Box>
      <Text dimColor={disabled}>{`❯ ${line}`}</Text>
    </Box>
  );
}
