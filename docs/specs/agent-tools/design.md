# agent-tools — Design

Two packages. `@cox/tools` has no knowledge of models; `@cox/agent` has no
knowledge of concrete tools, providers, hooks, or the TUI — everything
arrives through `@cox/core` types via the factory deps.

## Files

```
packages/tools/src/
  index.ts        exports createBuiltinTools, createToolRegistry, individual factories
  registry.ts     createToolRegistry(tools: Tool[]): ToolRegistry
  validate.ts     expectString/expectOptionalNumber(...) — manual input validation (no zod)
  paths.ts        resolveWithin(cwd, p): { abs: string; outside: boolean }
  walk.ts         async file walker; skips node_modules/.git; yields {path, mtimeMs}
  globmatch.ts    globToRegExp(pattern) supporting ** * ? {a,b}
  diff.ts         unifiedDiff(path, before, after, context=3): string
  read.ts write.ts edit.ts bash.ts glob.ts grep.ts
packages/tools/test/
  read.test.ts write.test.ts edit.test.ts bash.test.ts globgrep.test.ts
  permissions.test.ts        table-driven permissionFor matrix
  helpers/tmp.ts             mkdtemp sandbox helper

packages/agent/src/
  index.ts        exports createAgentRunner
  runner.ts       the loop (algorithm below)
  assemble.ts     ChatRequest construction + cache breakpoint rule (R2.*)
  escalation.ts   SignalTracker: record results/calls → EscalationSignal[]
  allowlist.ts    per-session allowAlways memory (Map keyed sessionId→toolKey)
  preview.ts      inputPreview(80) / resultPreview(120) helpers
packages/agent/test/
  runner.test.ts escalation.test.ts permissions-flow.test.ts termination.test.ts
  helpers/scripted-model.ts  ScriptedChatModel (local; implements ChatModel)
```

## Factory signatures (public API — exactly these)

```ts
// @cox/tools
export function createBuiltinTools(opts: { cwd: string; config: CoxConfig }): ToolRegistry;
export function createToolRegistry(tools: Tool[]): ToolRegistry;

// @cox/agent
export function createAgentRunner(deps: {
  router: Router;
  modelForTier: (t: Tier) => ChatModel;      // cli wires registry + tier map + failover
  tools: ToolRegistry;
  permissionMode: PermissionMode;
  config: CoxConfig;
  budgetState: () => Promise<BudgetState>;
  preToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  postToolUse?: (p: HookPayload) => Promise<HookOutcome[]>;
  now?: () => number;                        // default Date.now; inject in tests
}): AgentRunner;
```

No other runtime exports. Dependencies: `@cox/core` + node builtins only,
both packages.

## Loop algorithm (runner.ts)

```
run(task, onEvent, signal):
 1. decision = await router.route(routingInputFrom(task))       // R1.1
    emit routing_decision; model = modelForTier(decision.tier)
 2. messages = [...task.history, userMessage(task.prompt)]
 3. for turn = 1..maxTurns(40):                                 // R1.4
    a. if signal?.aborted → return {stopReason:"aborted", ...}  // R7.3
    b. bs = await budgetState()
       - exceeded && hardStop → emit budget_alert → "budget_stop"  // R7.1
       - level changed to warn → emit budget_alert once            // R7.2
    c. req = assemble(task.system, messages, tools, prevLen)    // R2.1, R2.3
       emit model_call_started; t0 = now()
    d. consume model.stream(req, signal):
       text_delta/thinking_delta → emit passthrough; accumulate text
       tool_use → collect [{id,name,input}] in order
       usage → capture; done → capture stopReason
    e. emit model_call_finished{usage, costUsd: cost(decision.model, usage),
       stopReason, durationMs: now()-t0}; aggregate usage/cost
    f. append assistant message (text block + tool_use blocks)  // R2.2
    g. if stopReason == end_turn | max_tokens | refusal →
       emit agent_message + turn_done → return                  // R1.3, R1.5
    h. results = []; for each call in order:                    // R1.2
         unknown tool → isError result listing registry names   // R1.6
         hooks preToolUse → any block → isError(stderr) result  // R5.1
         permission gate (below)                                // R6.*
         execute with ToolContext{cwd, sessionId, requestPermission, emit:onEvent}
         hooks postToolUse → block → append "[hook] stderr"     // R5.2
         emit tool_call_started/finished around the above       // R3.1, R3.3
         tracker.record(call, result)                           // R4.1, R4.2
       append ONE user message with all tool_results in order   // R2.2
    i. signals = tracker.drainNew()
       if signals.length:
         next = await router.reconsider(decision, input, signals)  // R4.3
         if next: emit escalation + routing_decision; decision = next
                  model = modelForTier(next.tier)
 4. loop exit → {stopReason:"max_turns", ...}
```

`costUsd`: `pricingFor(model.provider, model.model)` → `computeCostUsd`, else
null; aggregate sums non-null (result costUsd is a number; unknown-price
calls contribute 0 and NOTES.md records the caveat).

## Permission gate (runner-side, R6)

```
req = tool.permissionFor(input, mode)
if req == null                    → execute
else if mode == "plan"            → deny "denied: plan mode" (no prompt)   R6.4
else if allowlist.has(sessionId, key(tool,input)) → execute                R6.3
else emit permission_request; d = await ctx.requestPermission(req)
     allow → execute; allowAlways → remember + execute; deny → isError     R6.1-3
```

`key`: bash → first whitespace-separated token of `command`; others → tool
name.

## permissionFor matrix (tools-side)

| tool | default | acceptEdits | plan | yolo |
|---|---|---|---|---|
| read/glob/grep | null | null | null | null |
| write/edit (inside cwd) | request (edit: diff detail) | null | request (runner auto-denies) | null |
| write/edit (outside cwd) | request "OUTSIDE PROJECT …" | request | request | request |
| bash (denyBash prefix) | — execute() returns isError immediately, all modes |
| bash (allowBash prefix) | null | null | request | null |
| bash (other) | request | request | request | null |

Prefix rules compare the trimmed command against each configured prefix with
`command.startsWith(prefix)`; deny wins over allow.

## Tool behaviors (normative details)

- **read** input `{path, offset?, limit?}` → `N\t<line>` (1-based), cap 2000
  lines / 2MB with `"[truncated: N of M lines]"` marker.
- **write** input `{path, content}`; `mkdir -p` parent; returns byte count.
- **edit** input `{path, old_string, new_string}`; error messages must name
  the match count and path (`"edit: old_string matched 3 times in src/x.ts —
  must match exactly once"`); `detail` = `unifiedDiff(...)`.
- **bash** input `{command, timeout?}`; spawn `process.env.SHELL ?? "/bin/sh"`
  with `-c`, `cwd`, captured stdio; kill on timeout (SIGKILL after 2s grace)
  → isError `"timed out after Ns"`; truncate combined output to 30k chars
  with marker; exit≠0 → isError with exit code line appended.
- **glob** input `{pattern, limit?=100}` → newline paths (cwd-relative),
  mtime-desc.
- **grep** input `{pattern, glob?, mode?="content", limit?=1000}`;
  content mode lines `path:line: text`; invalid regex → isError naming it.

## ScriptedChatModel (test helper, agent package)

```ts
scripted(turns: Array<{
  deltas?: string[];
  toolUses?: { id; name; input }[];
  usage?: Partial<TokenUsage>;
  stopReason?: StopReason;      // default: toolUses ? "tool_use" : "end_turn"
  failWith?: Error;             // throw mid-stream (for abort/error tests)
}>): ChatModel & { requests: ChatRequest[] }   // records every request
```

`requests` lets tests assert message assembly and breakpoint indices (R2).

## Out of scope (v1)

Parallel tool execution; `verification_failed` / `model_requested_help`
signals (spec engine's follow-ups, later); streaming partial tool input;
ripgrep-backed search (walker perf ceiling — record in NOTES.md).
