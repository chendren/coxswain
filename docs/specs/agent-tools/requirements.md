# agent-tools — Requirements

Packages: `@cox/agent`, `@cox/tools`. Contracts: `AgentRunner`, `Tool`,
`ToolRegistry` and friends in `packages/core/src/types.ts` (frozen).

## Story 1 — Agent loop
As a cox user, I want a tool-use loop that turns one `AgentTask` into edits,
command runs, and a final answer, so every surface (chat, spec, hooks) shares
one engine.

- **R1.1** WHEN `run(task, onEvent, signal)` is called THE SYSTEM SHALL build a
  `RoutingInput` from the task (kind, prompt text, complexityHint,
  userOverrideTier, sessionId, specName, taskId, contextTokens estimated at
  chars/4 over system+history+prompt), call `Router.route`, and emit a
  `routing_decision` event before the first model call.
- **R1.2** WHEN the model streams `tool_use` events THE SYSTEM SHALL execute
  the named tools sequentially in stream order and continue the loop with
  their results.
- **R1.3** WHEN the model stops with `end_turn` THE SYSTEM SHALL resolve with
  `stopReason: "end_turn"`, `finalText` = accumulated text of the last
  assistant turn, and the full updated `history`.
- **R1.4** WHEN the iteration count reaches `task.maxTurns` (default 40) THE
  SYSTEM SHALL stop with `stopReason: "max_turns"`.
- **R1.5** WHEN the model stops with `max_tokens` or `refusal` THE SYSTEM
  SHALL stop and report that stopReason verbatim.
- **R1.6** WHERE an unknown tool name is requested THE SYSTEM SHALL feed back
  an `isError` tool_result naming the tool and the available tool names, and
  continue the loop.

## Story 2 — Message assembly & cache discipline
As the routing/ledger layer, I need deterministic prompt assembly so prompt
caching pays off.

- **R2.1** THE SYSTEM SHALL send `task.system` verbatim as `ChatRequest.system`
  and never add per-turn content to it.
- **R2.2** WHEN an assistant turn completes THE SYSTEM SHALL append one
  assistant message (one text block with concatenated deltas, then tool_use
  blocks in stream order) and, if tools ran, exactly one user message holding
  all `tool_result` blocks in the same order as their tool_use blocks.
- **R2.3** WHEN issuing a model call after the first THE SYSTEM SHALL set
  `cacheBreakpointMessageIndex` to the last index of the previous call's
  messages array; the first call uses `history.length - 1` (undefined when
  history is empty).

## Story 3 — Events & visibility
As the TUI, I need the full `AgentEvent` lifecycle to render.

- **R3.1** THE SYSTEM SHALL emit, in order per iteration: `model_call_started`,
  `text_delta`/`thinking_delta` as streamed, `tool_call_started` /
  `tool_call_finished` per tool, `model_call_finished` (usage, costUsd via
  `computeCostUsd`+`pricingFor`, stopReason, durationMs from injected `now`).
- **R3.2** WHEN the task resolves THE SYSTEM SHALL emit `agent_message`
  (final text) then `turn_done` with aggregate usage and cost.
- **R3.3** `tool_call_started.summary` SHALL be `"<name>: <input preview>"`
  (preview ≤ 80 chars); `tool_call_finished.resultPreview` SHALL be the first
  line of the result truncated to 120 chars.

## Story 4 — Escalation signals
As the router, I need evidence-based signals mid-task.

- **R4.1** WHEN `config.routing.escalation.toolErrorStreak` consecutive tool
  results are `isError` THE SYSTEM SHALL record a
  `{type:"tool_error_streak"}` signal (streak resets on any success).
- **R4.2** WHEN two consecutive tool calls have the same name and JSON-equal
  input THE SYSTEM SHALL record `{type:"model_stuck", evidence:"<name>"}`.
- **R4.3** WHEN signals exist after appending tool results THE SYSTEM SHALL
  call `Router.reconsider(current, input, signals)`; IF a decision returns
  THE SYSTEM SHALL emit `escalation{from,to,reasons}`, swap to
  `modelForTier(decision.tier)` keeping history, and emit `routing_decision`
  for the new decision.

## Story 5 — Hooks at the tool boundary
As the hooks engine (wired by cli, never imported), I need pre/post callbacks.

- **R5.1** WHEN `preToolUse` is provided THE SYSTEM SHALL call it before each
  tool with a `HookPayload{event:"PreToolUse", data:{tool, input}}`; IF any
  outcome is `block` THE SYSTEM SHALL skip execution and feed the outcome's
  stderr back as an `isError` tool_result.
- **R5.2** WHEN `postToolUse` is provided THE SYSTEM SHALL call it after each
  execution with the tool name, input, and result; block outcomes append
  stderr to the result content (marked `[hook]`), not retroactively cancel.

## Story 6 — Permissions
As a safety layer, tool execution respects the `PermissionMode`.

- **R6.1** WHEN `Tool.permissionFor(input, mode)` returns null THE SYSTEM
  SHALL execute without prompting; otherwise it SHALL emit
  `permission_request` and await `ToolContext.requestPermission`.
- **R6.2** WHEN the decision is `deny` THE SYSTEM SHALL feed back an
  `isError` result `"user denied: <summary>"`.
- **R6.3** WHEN the decision is `allowAlways` THE SYSTEM SHALL not prompt
  again this session for the same tool key (bash: first word of the command;
  other tools: tool name).
- **R6.4** WHILE mode is `plan` THE SYSTEM SHALL auto-deny (without
  prompting) every tool whose `permissionFor` returned a request, with result
  `"denied: plan mode"`. Read-only tools (read, glob, grep) return null in
  every mode and still run.

## Story 7 — Budget & abort
- **R7.1** WHEN `budgetState()` reports `exceeded` and `config.budgets.hardStop`
  before a model call THE SYSTEM SHALL emit `budget_alert` and stop with
  `stopReason: "budget_stop"`.
- **R7.2** WHEN the budget level changes to `warn` THE SYSTEM SHALL emit
  `budget_alert` once per level change.
- **R7.3** WHEN `signal` aborts THE SYSTEM SHALL stop with
  `stopReason: "aborted"` before the next model call, and pass the signal
  into `ChatModel.stream`.

## Story 8 — Built-in tools
- **R8.1** `read` SHALL return numbered lines (`N\t<text>`), support
  offset/limit, and cap at 2000 lines with a truncation marker.
- **R8.2** `write` SHALL create parent directories; WHEN the resolved path
  escapes `cwd` its PermissionRequest summary SHALL start with
  `"OUTSIDE PROJECT"` (and this request is prompted even in acceptEdits).
- **R8.3** `edit` SHALL replace `old_string` only when it matches exactly
  once; zero or multiple matches SHALL error naming the count and file; the
  PermissionRequest `detail` SHALL contain a unified-style diff.
- **R8.4** `bash` SHALL check `permissions.denyBash` (immediate isError, no
  prompt) then `permissions.allowBash` (no prompt) prefix rules BEFORE any
  permission prompt; run via `$SHELL -c` with a default 120s timeout
  (input-overridable); capture combined stdout+stderr truncated to 30k chars.
- **R8.5** `glob` SHALL match `**`, `*`, `?`, `{a,b}` patterns relative to
  cwd, skipping `node_modules` and `.git`, sorted by mtime descending.
- **R8.6** `grep` SHALL support regex search with optional file-glob filter
  and `content | files | count` output modes, skip binary files (null-byte
  sniff), and cap at 1000 matches with a marker.

## Story 9 — Testability
- **R9.1** All loop tests SHALL use a local `ScriptedChatModel` implementing
  `ChatModel` from core (no `@cox/providers` import, no network).
- **R9.2** All tool tests SHALL run inside `fs.mkdtemp` sandboxes and pass
  with zero environment variables set.
