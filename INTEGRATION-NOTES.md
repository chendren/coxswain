# Integration Notes (append-only)

Builder agents: when a `@cox/core` contract blocks you, append a dated section
here instead of editing core. Format:

```
## <date> — <workstream>
- Blocked on: <type/interface + what's missing or wrong>
- Workaround taken: <local decision>
- Proposed contract change: <one line>
```

The integrator (M2) resolves these and logs any core changes under
"Contract changes" below.

## 2026-07-20 — agent-tools

- Blocked on: `ToolContext` (packages/core/src/types.ts) carries no
  `AbortSignal`. docs/04-CONVENTIONS.md requires "AbortSignal threaded through
  anything that awaits network or subprocesses," and the bash tool awaits a
  child process, but `Tool.execute(input, ctx)` has no signal to thread. The
  agent loop's `signal` (per R7.3) is only specified to gate the *next model
  call* and to pass into `ChatModel.stream` — nothing routes it into tool
  execution.
- Workaround taken: bash enforces its own bound via the `timeout` input
  (R8.4: default 120s, SIGTERM then SIGKILL after a 2s grace) so a call can
  never hang forever, but a user abort (Esc) mid-tool-call cannot interrupt
  an in-flight bash command early — it runs to its own timeout regardless of
  the run-level signal. Documented as a known v1 gap, not fixed locally.
- Proposed contract change: add `signal?: AbortSignal` to `ToolContext` so
  `AgentRunner` can thread the run's abort signal into `Tool.execute`, and
  bash (and any future subprocess/network tool) can race it against its own
  timeout.

## 2026-07-20 — agent-tools (2)

- Blocked on: `docs/specs/agent-tools/design.md`'s `createAgentRunner(deps)`
  signature has no dependency that can resolve a `permission_request` into a
  `PermissionDecision`. R6.1 requires the runner to "emit permission_request
  and await `ToolContext.requestPermission`" — but `ToolContext` is built BY
  the runner for each `Tool.execute` call, and nothing in the listed `deps`
  (router, modelForTier, tools, permissionMode, config, budgetState,
  preToolUse, postToolUse, now) can supply a working
  `requestPermission(req): Promise<PermissionDecision>` implementation.
  `AgentRunner.run`'s frozen signature (`task, onEvent, signal`) also has no
  side channel for a caller to push a decision back in — `onEvent` is
  fire-and-forget (`=> void`).
- Workaround taken: added one field beyond design.md's literal list —
  `requestPermission: (req: PermissionRequest) => Promise<PermissionDecision>`
  — to `createAgentRunner`'s `deps`. The runner still emits `permission_request`
  via `onEvent` for visibility (TUI rendering) and separately awaits
  `deps.requestPermission(req)` for the actual decision; `ToolContext.requestPermission`
  is that same function. Tests inject a scripted resolver directly. `@cox/cli`
  will presumably implement this by bridging to `SessionController.resolvePermission`
  (a pending-promise-per-request map keyed by session).
- Proposed contract change: either add `requestPermission` to
  `createAgentRunner`'s deps shape in design.md (matches what actually got
  built), or add a documented side channel on `AgentRunner`/`SessionController`
  for resolving permission requests, so the factory signature and the
  frozen interfaces agree.

## Contract changes
(none yet)
