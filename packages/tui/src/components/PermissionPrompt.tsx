/**
 * PermissionPrompt — modal for `permission_request` (R3.1). Shows
 * `request.summary` plus a scrollable window over `request.detail` (↑/↓),
 * maps y -> "allow", a -> "allowAlways", n/Esc -> "deny". Calls
 * `onDecision` exactly once (R3.2 — guarded by a ref so a stray extra
 * keystroke racing the parent's unmount can't double-fire it); the parent
 * (App) is responsible for calling `SessionController.resolvePermission`
 * and clearing modal state from that callback.
 *
 * `readonly` (App passes its own `readonly` prop through) sets
 * `isActive: false` on useInput, which skips Ink's raw-mode setup
 * entirely — `cox replay` mounts this same modal for a `permission_request`
 * event in the recorded stream (fixtures/events-sample.jsonl has one), but
 * there is no real terminal user to answer it and no live consequence to
 * `resolvePermission` on the read-only stub controller, so it must not try
 * to enable raw mode on whatever stdin the host process happens to have.
 */
import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PermissionDecision, PermissionRequest } from "@cox/core";

export interface PermissionPromptProps {
  request: PermissionRequest;
  onDecision: (decision: PermissionDecision) => void;
  readonly?: boolean;
}

const VISIBLE_DETAIL_LINES = 10;

export function PermissionPrompt({
  request,
  onDecision,
  readonly,
}: PermissionPromptProps): React.JSX.Element {
  const [scroll, setScroll] = useState(0);
  const decided = useRef(false);
  const detailLines = request.detail ? request.detail.split("\n") : [];
  const maxScroll = Math.max(0, detailLines.length - VISIBLE_DETAIL_LINES);
  const visible = detailLines.slice(scroll, scroll + VISIBLE_DETAIL_LINES);

  function decide(decision: PermissionDecision): void {
    if (decided.current) return;
    decided.current = true;
    onDecision(decision);
  }

  useInput(
    (input, key) => {
      if (input === "y") {
        decide("allow");
      } else if (input === "a") {
        decide("allowAlways");
      } else if (input === "n" || key.escape) {
        decide("deny");
      } else if (key.downArrow) {
        setScroll((s) => Math.min(maxScroll, s + 1));
      } else if (key.upArrow) {
        setScroll((s) => Math.max(0, s - 1));
      }
    },
    { isActive: !readonly },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow">
      <Text bold color="yellow">{`permission: ${request.summary}`}</Text>
      {visible.map((line, i) => (
        <Text key={i} dimColor>
          {line}
        </Text>
      ))}
      {detailLines.length > VISIBLE_DETAIL_LINES ? (
        <Text dimColor>
          {`(${scroll + 1}-${Math.min(scroll + VISIBLE_DETAIL_LINES, detailLines.length)} of ${
            detailLines.length
          } — ↑/↓ to scroll)`}
        </Text>
      ) : null}
      <Text>y allow · a allow always · n/Esc deny</Text>
    </Box>
  );
}
