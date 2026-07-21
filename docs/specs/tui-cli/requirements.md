# tui-cli — Requirements

Packages: `@cox/tui`, `@cox/cli`. Contracts: `packages/core/src/types.ts`
(`AgentEvent`, `EventBus`, `SessionController`, `SessionSnapshot`,
`PermissionRequest/Decision`, `LedgerSummary`, `CoxConfig`). Render formats in
`docs/05-ROUTING-AND-LEDGER.md` §2 are authoritative for R1.3, R2.1, R11.2.

## Story 1 — Transcript rendering (tui)

As a user, I watch the agent work in a readable, append-only transcript.

- **R1.1** WHEN any `AgentEvent` is emitted on the session `EventBus`, THE TUI
  SHALL render it per the event→render mapping table in design.md, covering
  all 17 event variants.
- **R1.2** WHEN `text_delta` events stream, THE TUI SHALL append them to one
  growing text block; WHEN `agent_message` arrives after deltas were rendered
  for the same turn, THE TUI SHALL NOT render the text a second time; WHEN
  `agent_message` arrives with no prior deltas that turn (replay, non-streaming
  models), THE TUI SHALL render it.
- **R1.3** WHEN a `routing_decision` event arrives, THE TUI SHALL render the
  3-line announcement block byte-compatible with the docs/05 §2 mockup
  (⑆ prefix, target quote → tier (model), reasons line joined with " · ",
  estimate line with 10-char budget bar).
- **R1.4** WHEN `model_call_finished` arrives, THE TUI SHALL render a dim
  receipt line `─ actual: <in> in (<cached> cached) / <out> out · <cost> · <dur>`
  using `formatTokens`/`formatUsd`/`formatDuration`.
- **R1.5** WHEN `tool_call_finished` has `isError: true`, THE TUI SHALL render
  the tool line with `✗` in red; otherwise `✓`.
- **R1.6** WHILE a listener render throws, THE session SHALL continue (core
  `EventBus` guarantees this; the TUI SHALL NOT rely on render errors
  propagating).

## Story 2 — Status line (tui)

- **R2.1** THE TUI SHALL render a persistent bottom status line from
  `SessionSnapshot` matching the docs/05 §2 mockup:
  `⛵ <tier> <model> │ ▲<in> ▼<out> │ $<spent>/$<limit|∞> │ cache <pct>% │ spec <name> <done>/<total>`
  (spec segment omitted when `activeSpec` is undefined).
- **R2.2** WHEN any event arrives, THE TUI SHALL refresh the status line by
  calling `TuiOptions.getSnapshot()` (pull model; the TUI computes nothing).
- **R2.3** WHEN `budget.level` is `"warn"` THE status line cost segment SHALL
  render yellow; WHEN `"exceeded"`, red.

## Story 3 — Permission prompts (tui)

- **R3.1** WHEN a `permission_request` event arrives, THE TUI SHALL display a
  modal with `request.summary` and scrollable `request.detail`, disable the
  input line, and map keys y→`"allow"`, a→`"allowAlways"`, n/Esc→`"deny"`.
- **R3.2** WHEN the user answers, THE TUI SHALL call
  `SessionController.resolvePermission(decision)` exactly once and close the
  modal.

## Story 4 — Input & slash commands (tui)

- **R4.1** WHEN the user submits text not starting with `/`, THE TUI SHALL
  call `controller.submitPrompt(text)`.
- **R4.2** WHEN the user submits `/cmd a b…`, THE TUI SHALL call
  `controller.submitCommand("cmd", ["a","b",…])` after validating `cmd`
  against the grammar in design.md; unknown commands render a local error
  line without calling the controller.
- **R4.3** WHEN Esc is pressed outside a modal while a turn is running, THE
  TUI SHALL call `controller.interrupt()`.
- **R4.4** WHEN Tab is pressed on a line starting with `/`, THE TUI SHALL
  complete top-level command names (`/spec /steer /model /context /ledger /budget`).

## Story 5 — Fixture replay (tui + cli)

- **R5.1** WHEN `cox replay <file.jsonl>` runs, THE CLI SHALL stream each
  line, parsed as an `AgentEvent`, into a real `EventBus` rendered by the
  real TUI at 30 events/second, with a read-only stub `SessionController`.
- **R5.2** THE replay command SHALL work with only `@cox/core` and `@cox/tui`
  implemented (M1 — no engines, no network).
- **R5.3** WHEN `fixtures/events-sample.jsonl` is replayed, THE snapshot fold
  in the replay command SHALL produce cumulative usage/cost from
  `model_call_finished` events for the status line.

## Story 6 — Plain / --print mode (tui + cli)

- **R6.1** WHEN stdout is not a TTY or `--print <prompt>` is used, THE CLI
  SHALL use `createPlainRenderer` (no Ink, no ANSI cursor control) emitting
  the same transcript content line-by-line.
- **R6.2** WHEN a permission is requested in `--print` mode, THE CLI SHALL
  auto-deny unless `--yolo` was passed (then auto-allow), and the renderer
  SHALL print the decision line.
- **R6.3** `--print` SHALL exit 0 when the turn ends with `end_turn`, 1
  otherwise.

## Story 7 — Command surface (cli)

- **R7.1** THE CLI SHALL expose exactly the docs/00 surface:
  default (interactive), `spec new|approve|design|tasks|run|status`,
  `steer init`, `hook run <name>`, `explain`, `suggest`, `ledger`, `models`,
  `doctor`, `replay`; global flags `-m/--model <tier>`, `--print <prompt>`,
  `--cwd <dir>`, `--yolo`.
- **R7.2** WHEN `-m <tier>` is given an invalid tier, THE CLI SHALL exit 2
  with the valid values listed. Usage errors exit 2, runtime errors exit 1,
  success exits 0.

## Story 8 — Composition root (cli)

- **R8.1** THE CLI SHALL build the session in `wire.ts` in the docs/01 order,
  passing dependencies only through core interfaces; `@cox/cli` is the only
  package importing other `@cox/*` packages.
- **R8.2** WHILE any engine package is still a stub, `cox replay`, `cox
  doctor --offline`, `--help`, and arg parsing SHALL still work; commands
  needing engines SHALL fail with `NotWiredError: @cox/<pkg> not wired`
  (dynamic-import runtime check in `deps.ts`).
- **R8.3** WHEN a `model_call_finished` event follows a `routing_decision`
  event, THE ledger-writer subscriber SHALL append one `LedgerEntry`
  combining both (usage/cost/model from the finish; kind/tier/reasons from
  the most recent decision).
- **R8.4** WHEN `submitPrompt` runs, THE session SHALL: fire
  `UserPromptSubmit` hooks (a `block` outcome aborts the turn), assemble the
  system prompt stable-first (identity constant + always-steering docs sorted
  by name), then run the agent with an `AbortSignal` tied to
  `interrupt()`.
- **R8.5** WHEN `/model <tier|auto>` is issued, THE session SHALL set/clear
  `userOverrideTier` for subsequent turns; `/budget extend <usd>` SHALL raise
  the effective session budget; `/context` SHALL render steering docs with
  token weights and system prompt size; `/ledger` SHALL render the docs/05
  table for the current session.

## Story 9 — One-shots (cli)

- **R9.1** WHEN `cox explain "…"`/`cox suggest "…"` runs, THE CLI SHALL make
  a single tool-less `ChatModel.stream` call on the tier chosen by
  `router.route({kind: "oneshot", …})`, print the text, and write a ledger
  entry — without invoking `AgentRunner`.
- **R9.2** `suggest` SHALL print the runnable command alone on the final line.

## Story 10 — Doctor (cli)

- **R10.1** `cox doctor` SHALL check: node ≥ 20, config parses, each
  configured provider's `apiKeyEnv` is set (when required), `.cox/`
  writability, and (unless `--offline`) provider reachability; it SHALL print
  ✓/✗ per check and exit 1 if any fail.

## Story 11 — Reports (cli)

- **R11.1** `cox models` SHALL print configured tiers, their
  primary/fallback models, and pricing (`pricingFor`), marking unknown
  pricing `n/a`.
- **R11.2** `cox ledger [--spec X] [--since ISO]` SHALL print the docs/05 §2
  table via the shared `renderLedgerTable` from `@cox/tui`, including
  savings-vs-baseline and cache-savings lines.

## Story 12 — Steering bootstrap (cli)

- **R12.1** `cox steer init` SHALL write the three steering templates
  (constants exported by `@cox/steering`) into `.cox/steering/`, skipping
  files that already exist, then — only in interactive TTY mode — offer an
  architect-tier fill-in via the agent after explicit y/N confirmation.

## Story 13 — Integration (M2 exit criteria)

- **R13.1** WITH all lanes wired and a `MockChatModel`-backed registry, WHEN a
  prompt is submitted, THE session SHALL produce in order:
  `routing_decision` → `model_call_started` → … → `model_call_finished` →
  `turn_done`, one ledger line in `.cox/ledger.jsonl`, and a snapshot whose
  usage/cost reflect the mock's reported usage. (Test skips with a visible
  notice while `NotWiredError` is thrown.)
