# tui-cli — Design

## Dependencies

- `@cox/tui`: runtime `ink@^5`, `react@^18`; dev `ink-testing-library@^4`,
  `@types/react`. tsconfig adds `"jsx": "react-jsx"` (package-local; still
  extends the base).
- `@cox/cli`: runtime `commander@^12` + (composition root only) every other
  `@cox/*` package. Tests: vitest, temp dirs, no network.
- `@cox/tui` imports **only** `@cox/core`. All engine access flows through
  `SessionController` + `EventBus` + `getSnapshot`.

## @cox/tui

### Files

```
src/index.ts        startTui, createPlainRenderer, renderLedgerTable, re-export format helpers
src/app.tsx         <App> — subscribes bus, owns transcript array + modal + snapshot state
src/components/Transcript.tsx          event list renderer (Ink <Static> for settled entries)
src/components/RoutingAnnouncement.tsx docs/05 block
src/components/StatusLine.tsx
src/components/PermissionPrompt.tsx
src/components/Input.tsx               prompt line, slash parsing/completion, Esc handling
src/components/LedgerPanel.tsx         renders renderLedgerTable output
src/components/ContextPanel.tsx        steering docs + token weights (data via panel event, below)
src/format.ts       formatTokens, formatUsd, formatDuration, budgetBar, cachePct
src/plain.ts        createPlainRenderer(write): EventListener
```

### Public API (exact)

```ts
export interface TuiOptions {
  bus: EventBus;
  controller: SessionController;
  getSnapshot: () => SessionSnapshot;
  readonly?: boolean;            // replay mode: input disabled
}
export function startTui(opts: TuiOptions): { waitUntilExit(): Promise<void>; unmount(): void };
export function createPlainRenderer(write: (line: string) => void): (e: AgentEvent) => void;
export function renderLedgerTable(summary: LedgerSummary, label: string): string;
export { formatTokens, formatUsd, formatDuration, budgetBar } from "./format";
```

Panels: `/context` and `/ledger` data is produced by cli (it owns engines) and
delivered to the TUI as synthetic transcript entries — cli renders the panel
text (via `renderLedgerTable` / its own context formatter) and emits
`{type:"agent_message", text}`-style panel content? **No.** Rule: panels are
plain preformatted text blocks; cli calls tui's pure functions to produce the
string, then emits `{ type: "hook_fired" }`? Neither — keep the event stream
clean: cli prints panels by emitting a dedicated local mechanism:
`controller.submitCommand` handlers compute the panel string and cli emits
`{ type: "agent_message", text: panelString }`. Panels are transcript content;
no new event types are invented. (Accepted trade-off; documented for the
integrator.)

### Event → render mapping (all 17 variants — R1.1)

| AgentEvent.type | Render |
|---|---|
| `session_started` | dim `session <sessionId> · <cwd>` |
| `user_prompt` | bold `❯ <text>` |
| `routing_decision` | RoutingAnnouncement block (below) |
| `model_call_started` | transient spinner `⠋ <tier> <model.model> …` in dynamic region |
| `text_delta` | append to current streaming block (settles at turn end) |
| `thinking_delta` | transient one-line dim preview `∴ <last 60 chars>`; never enters transcript |
| `tool_call_started` | transient `⚙ <name> <summary>` |
| `permission_request` | modal (R3); plain mode: line `? permission: <summary>` |
| `tool_call_finished` | `✓ <name> <summary> · <resultPreview>` (green ✓) / red `✗ …` when isError |
| `model_call_finished` | dim `─ actual: <in> in (<cacheRead> cached) / <out> out · <formatUsd(costUsd)> · <formatDuration>` ; clears spinner |
| `escalation` | yellow `⚠ escalated <from>→<to>: <reasons joined " · ">` |
| `budget_alert` | warn: yellow `▲ budget <spent>/<limit> (<scope>)`; exceeded: red + `type /budget extend <usd>` |
| `spec_event` | `◆ spec <specName> · <phase> · <status>` + ` · task <taskId>` when present |
| `hook_fired` | dim `⚓ <event>: <n> hook(s)`; any `action:"block"` → red line with its stderr |
| `agent_message` | final text block, with the R1.2 dedupe rule (skip if deltas already streamed this turn) |
| `error` | red `✖ <message>` |
| `turn_done` | settles streaming block into `<Static>`; dim separator `· turn <formatUsd(costUsd)>`; resets per-turn dedupe flag |

RoutingAnnouncement (byte format, R1.3):

```
⑆ router  <label> → <tier> (<model.model>)
          <reasons.join(" · ")>
          est <formatTokens(inputTokens)> in / ~<formatTokens(estOutputTokens)> out ≈ <formatUsd(estCostUsd)>    session <formatUsd(spent)>/<formatUsd(limit)> <budgetBar(spent, limit, 10)>
```

`<label>`: `decision`'s originating prompt/task — take first 40 chars of the
turn's `user_prompt` text (App holds it), or `spec task <taskId>` when the
decision's kind is `spec-task-exec`. Session spent/limit from `getSnapshot()`;
limit absent → `session <spent>` and no bar.

### format.ts rules

- `formatTokens`: `<1000` → `"612"`; `<1M` → `"12.4k"` (1 dp, trailing `.0`
  dropped); else `"1.2M"`.
- `formatUsd(n | null)`: null → `"n/a"`; `≥ 0.01` → 2 dp; else 3 dp; always
  `$` prefix.
- `formatDuration(ms)`: `<1000` → `"450ms"`; else 1-dp seconds `"9.5s"`.
- `budgetBar(spent, limit, width)`: `"█".repeat(filled) + "░".repeat(rest)`,
  filled = clamp(round(width·spent/limit), 0..width).
- `cachePct(u: TokenUsage)`: `round(100·cacheRead/(inputTokens+cacheRead))`,
  0 when denominator 0.

### App state model

`useState`: `entries: TranscriptEntry[]` (settled, rendered in `<Static>`),
`live: { text: string; thinking: string; spinner?: string; tools: Map<id,line> }`,
`modal: PermissionRequest | null`, `snapshot: SessionSnapshot`,
`sawDeltaThisTurn: boolean`. One `bus.subscribe` in a `useEffect` on mount;
every event → reducer-style switch → `setState` + `setSnapshot(getSnapshot())`.

## @cox/cli

### Files

```
src/main.ts        commander program; global flags; command registration; exit codes
src/deps.ts        NotWiredError + async loadDeps(cfg, cwd, bus): EngineDeps (dynamic import + runtime check)
src/wire.ts        buildSession(cfg, cwd, bus): { controller, getSnapshot, budgets } — full graph
src/session.ts     SessionControllerImpl: submitPrompt/submitCommand/resolvePermission/interrupt
src/snapshot.ts    createSnapshotStore({ sessionId, budgets, ledger? }): { onEvent, get }
src/identity.ts    COX_IDENTITY — stable-bytes system prompt head (no dates/ids; cache discipline docs/01)
src/print.ts       runPrint(prompt, flags): plain renderer + auto permission policy + exit code
src/commands/{spec,steer,hook,oneshot,ledger,models,doctor,replay}.ts
test/{args,replay,doctor,oneshot,snapshot,wire}.test.ts
```

### deps.ts — the M1-safe boundary (R8.2)

```ts
export class NotWiredError extends Error {}
export interface EngineDeps {
  registry: ProviderRegistry; router: Router; ledger: Ledger;
  agent: AgentRunner; specs: SpecEngine; steering: SteeringStore;
  hooks: HookEngine; tools: ToolRegistry;
}
export async function loadDeps(cfg: CoxConfig, cwd: string, bus: EventBus): Promise<EngineDeps>
```

Each engine is obtained via `await import("@cox/<pkg>")` followed by a runtime
check that the expected factory exists (`typeof mod.createRouter ===
"function"`), else `throw new NotWiredError("@cox/router not wired")`. This is
the **one** place a cast through `unknown` is permitted (stub modules have no
factory types); comment it. Static imports of engine packages are forbidden
outside this file — keeps `@cox/cli` typechecking green while lanes are stubs.

### wire.ts order (docs/01) and closures

1. `cfg = loadConfig(cwd)`; `bus = new EventBus()`.
2. `registry = createProviderRegistry(cfg)`;
   `tierModel(tier) = createFailoverChatModel([primary, ...fallbacks].map(registry.getModel))`
   (both factories from `@cox/providers`).
3. `ledger = createLedger({ dir: join(cwd, ".cox"), budgets, now })` — `budgets`
   is a **retained mutable object** copied from `cfg.budgets`; `/budget
   extend` mutates it (documented v1 wart).
4. `router = createRouter({ config: cfg, ledger, scoutModel: () => tierModel("scout"), now })`.
5. `tools = createBuiltinTools({ cwd, permissions: cfg.permissions })`;
   `steering = createSteeringStore(cfg.steering)`;
   `hooks = createHookEngine({ cwd, enabled: cfg.hooks.enabled })`.
6. `agent = createAgentRunner({ route, reconsider, modelForTier: tierModel, tools, preToolUse, postToolUse })`
   where `route(input)` = fire `PreModelCall` hooks → merge
   `output.tierOverride` into `input.hookOverrideTier` → `router.route(input)`;
   `preToolUse/postToolUse` wrap `hooks.fire`.
   **Routing-call ownership:** the route closure is injected so the agent
   invokes it per turn/escalation and emits `routing_decision` itself. If the
   delivered `createAgentRunner` deps differ, adapt **only in wire.ts** (fall
   back to routing in `session.ts` before `run()`); record any mismatch in
   `INTEGRATION-NOTES.md`. The M2 test asserts observable order, not
   ownership.
7. `specs = createSpecEngine({ cwd, agent, emit: bus.emit, onPhaseChange, onTaskComplete })`
   (hook-firing wrappers).
8. Subscribers: snapshot store; ledger writer (below); TUI attaches in main.

Ledger-writer subscriber (R8.3): holds `lastDecision: {decision, kind} | null`
updated on `routing_decision`; on `model_call_finished` appends
`LedgerEntry{ ts: now(), sessionId, kind, tier: decision.tier, model: e.model,
usage: e.usage, costUsd: e.costUsd, routingReasons: decision.reasons,
escalatedFrom: decision.escalatedFrom, durationMs: e.durationMs }` then pulls
`ledger.budgetState` and emits `budget_alert` when level ≠ ok. Safe because v1
is strictly sequential per session (assumption documented; revisit for
parallel subagents).

### session.ts (R8.4, R8.5)

`createSessionController({ deps, bus, cfg, cwd, snapshot, budgets })` returns
`SessionController` + internal state: `history: ChatMessage[]`,
`modelOverride: Tier | null`, `manualSteering: string[]`,
`abort: AbortController | null`, `pendingPermission: resolve fn | null`.

`submitPrompt(text)`:
1. `hooks.fire({event:"UserPromptSubmit", …})` → any block: emit `hook_fired`
   + abort.
2. `docs = steering.loadAll(cwd)`; `sel = steering.select(docs, [], manualSteering)`.
3. `system = COX_IDENTITY + "\n\n" + sel.systemDocs.map(d=>d.body).join("\n\n")`
   (loadAll returns stable order; do not append volatile data — docs/01).
   `sel.contextDocs` are prefixed to the user content as
   `<steering name="…">body</steering>` blocks.
4. `agent.run({ kind:"chat", prompt, system, history, cwd, sessionId,
   userOverrideTier: modelOverride ?? cliFlagTier, maxTurns: 40 }, bus.emit, abort.signal)`
   → on resolve, adopt returned `history`.

`resolvePermission(d)` resolves the promise created by the wired
`ToolContext.requestPermission` (cli supplies that function when constructing
tools/agent: interactive → emit `permission_request` + park a resolver;
print/replay → policy auto-deny/allow per R6.2).

`submitCommand(cmd, args)` dispatch table → spec/steer/model/context/ledger/
budget handlers; unknown → error event. `/context` and `/ledger` build their
panel strings (context: `sel` docs with `tokens` + system size; ledger:
`renderLedgerTable(await ledger.summary({sessionId}), label)`) and emit as
`agent_message` panel blocks. `hook run <name>` (CLI + `/hook run`): find in
`hooks.agentHooks()`, run `agent.run({kind:"hook", prompt: hook.prompt, …})`
with the hook's tier injected as `hookOverrideTier` via a per-run context slot
the route closure reads.

### Slash grammar

```
/spec new <name> <idea…> | approve <name> [phase] | design <name> | tasks <name> | run <name> [taskId] | status [name]
/steer init | list | use <name>
/model scout|builder|architect|auto
/context            /ledger [spec <name>]           /budget extend <usd>
```

### One-shots (R9) — no AgentRunner

`commands/oneshot.ts`: `decision = router.route({kind:"oneshot", text, contextTokens: est, sessionId})`
→ `tierModel(decision.tier).stream({ system: ONESHOT_SYSTEM(kind), messages:[user], tools: [], maxTokens: 1024 })`
→ print text deltas; on `usage`/`done` write the ledger entry directly.
`suggest` system prompt ends: "Output the command alone on the final line."

### doctor / models / ledger / steer init / replay

Per R10–R12. `replay`: parse JSONL → validate `type` is a known variant
(unknown → warn+skip) → emit at 33 ms intervals into a bus running
`startTui({ readonly: true, controller: stubController, getSnapshot: fold.get })`;
fold (`snapshot.ts` reused) accumulates `model_call_finished`. Exit when file
drained + 500 ms grace. `doctor` exits 1 on any ✗; reachability check is a
1-token scout call (skipped `--offline`).

### Exit codes

0 success · 1 runtime/config/NotWired errors (message on stderr) · 2 usage
errors (commander `exitOverride` mapped).

### Test plan

- tui: ink-testing-library `render(<App…>)` + emit fixture events → snapshot
  the frame (R1.x, R2.x, R3.x); `format.test.ts` table-driven (R1.4 formats).
- cli M1-green tests: args (R7), replay fold + full fixture pump through real
  `<App>` (R5), doctor --offline (R10), oneshot with an **inline fake
  ChatModel** (R9 — no `@cox/providers` import in tests), snapshot store.
- `wire.test.ts` (R13): `loadDeps` inside `try` — on `NotWiredError` mark
  skipped with a printed notice; once lanes land it runs the M2 assertion
  (event order, ledger line parsed from temp `.cox/ledger.jsonl`, snapshot
  totals) using `MockChatModel` via a config pointing providers at the mock
  adapter (see providers spec pack).
