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

## Contract changes
(none yet)
