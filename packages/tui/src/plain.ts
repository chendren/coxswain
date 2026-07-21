/**
 * createPlainRenderer — R6.1: the same transcript content as <App>, but as
 * plain lines (no Ink, no ANSI cursor control) for non-TTY stdout or
 * --print mode. Mirrors app.tsx's event -> render mapping, minus color and
 * the transient/live-region concept — nothing here is erased or redrawn:
 * text_delta/agent_message buffer silently and flush as one line at
 * turn_done (same R1.2 dedupe rule); thinking_delta produces no output at
 * all, matching "never enters transcript" (app.tsx doesn't put it in the
 * settled transcript either, only a live preview that plain mode has no
 * equivalent of); model_call_started/tool_call_started, which are
 * "transient" in the Ink UI, are written immediately as their own line
 * since there is no redraw to make them disappear.
 *
 * `write`'s signature (`(line: string) => void`, no snapshot accessor) is
 * design.md's exact public API — it means the routing_decision block's
 * session-spend segment cannot reflect live budget state here the way
 * app.tsx's does via getSnapshot(); it always renders spent $0 / no limit.
 * See packages/tui/NOTES.md.
 */
import type { AgentEvent } from "@cox/core";
import { formatDuration, formatTokens, formatUsd } from "./format";
import { routingAnnouncementLines } from "./components/RoutingAnnouncement";

export type EventListener = (e: AgentEvent) => void;

export function createPlainRenderer(write: (line: string) => void): EventListener {
  let text = "";
  let sawDeltaThisTurn = false;
  let lastUserPromptText = "";
  let lastSpecTaskId: string | undefined;
  const tools = new Map<string, { name: string; summary: string }>();

  return (e: AgentEvent): void => {
    switch (e.type) {
      case "session_started": {
        write(`session ${e.sessionId} · ${e.cwd}`);
        break;
      }
      case "user_prompt": {
        lastUserPromptText = e.text;
        write(`❯ ${e.text}`);
        break;
      }
      case "routing_decision": {
        const label =
          e.kind === "spec-task-exec"
            ? `spec task ${lastSpecTaskId ?? "?"}`
            : `"${lastUserPromptText.slice(0, 40)}"`;
        for (const line of routingAnnouncementLines(e.decision, label, 0, undefined)) {
          write(line);
        }
        break;
      }
      case "model_call_started": {
        write(`⠋ ${e.tier} ${e.model.model} …`);
        break;
      }
      case "text_delta": {
        sawDeltaThisTurn = true;
        text += e.text;
        break;
      }
      case "thinking_delta": {
        break; // never enters the transcript, plain mode included
      }
      case "tool_call_started": {
        tools.set(e.id, { name: e.name, summary: e.summary });
        write(`⚙ ${e.name} ${e.summary}`);
        break;
      }
      case "permission_request": {
        write(`? permission: ${e.request.summary}`);
        break;
      }
      case "tool_call_finished": {
        const started = tools.get(e.id);
        const summary = started?.summary ?? "";
        const name = started?.name ?? e.name;
        write(`${e.isError ? "✗" : "✓"} ${name} ${summary} · ${e.resultPreview}`);
        tools.delete(e.id);
        break;
      }
      case "model_call_finished": {
        write(
          `─ actual: ${formatTokens(e.usage.inputTokens)} in (${formatTokens(
            e.usage.cacheReadTokens,
          )} cached) / ${formatTokens(e.usage.outputTokens)} out · ${formatUsd(e.costUsd)} · ${formatDuration(
            e.durationMs,
          )}`,
        );
        break;
      }
      case "escalation": {
        write(`⚠ escalated ${e.from}→${e.to}: ${e.reasons.join(" · ")}`);
        break;
      }
      case "budget_alert": {
        const limit = e.state.limitUsd === undefined ? "∞" : formatUsd(e.state.limitUsd);
        const scope = e.state.scope ?? "session";
        write(`▲ budget ${formatUsd(e.state.spentUsd)}/${limit} (${scope})`);
        if (e.state.level === "exceeded") {
          write("type /budget extend <usd>");
        }
        break;
      }
      case "spec_event": {
        if (e.taskId) lastSpecTaskId = e.taskId;
        const taskSuffix = e.taskId ? ` · task ${e.taskId}` : "";
        write(`◆ spec ${e.specName} · ${e.phase} · ${e.status}${taskSuffix}`);
        break;
      }
      case "hook_fired": {
        write(`⚓ ${e.event}: ${e.outcomes.length} hook(s)`);
        for (const o of e.outcomes) {
          if (o.action === "block") write(`✗ ${o.hook}: ${o.stderr ?? "blocked"}`);
        }
        break;
      }
      case "agent_message": {
        if (!sawDeltaThisTurn) text = e.text;
        break;
      }
      case "error": {
        write(`✖ ${e.message}`);
        break;
      }
      case "turn_done": {
        if (text.length > 0) write(text);
        write(`· turn ${formatUsd(e.costUsd)}`);
        text = "";
        sawDeltaThisTurn = false;
        break;
      }
      default: {
        const _exhaustive: never = e;
        void _exhaustive;
        break;
      }
    }
  };
}
