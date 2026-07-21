/**
 * Transcript — renders settled entries via Ink's <Static> (append-only,
 * never re-painted) plus the live/transient region below it (spinner,
 * in-flight tool lines, streaming text, thinking preview). See
 * docs/specs/tui-cli/design.md "Event -> render mapping" for the full
 * 17-variant table; App.tsx owns the reducer that produces these props.
 */
// Explicit default import: see app.tsx for why (esbuild runtime transforms
// used by tsx/vitest emit the classic React.createElement pragma here).
import React, { type ReactNode } from "react";
import { Box, Static, Text } from "ink";

export interface TranscriptEntry {
  id: number;
  node: ReactNode;
}

export interface LiveToolLine {
  name: string;
  summary: string;
}

export interface LiveState {
  text: string;
  thinking: string;
  spinner?: string;
  tools: Record<string, LiveToolLine>;
}

export const EMPTY_LIVE: LiveState = { text: "", thinking: "", spinner: undefined, tools: {} };

export interface TranscriptProps {
  entries: TranscriptEntry[];
  live: LiveState;
}

export function Transcript({ entries, live }: TranscriptProps): React.JSX.Element {
  const toolLines = Object.entries(live.tools);
  return (
    <Box flexDirection="column">
      <Static items={entries}>{(entry) => <Box key={entry.id}>{entry.node}</Box>}</Static>
      {live.spinner ? <Text>{live.spinner}</Text> : null}
      {toolLines.map(([id, t]) => (
        <Text key={id}>{`⚙ ${t.name} ${t.summary}`}</Text>
      ))}
      {live.text ? <Text>{live.text}</Text> : null}
      {live.thinking ? <Text dimColor>{`∴ ${live.thinking}`}</Text> : null}
    </Box>
  );
}
