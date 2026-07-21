# Architecture

## The one rule that makes parallel building work

> **Every package imports from `@cox/core` and nothing else.**
> Cross-package imports are forbidden. `@cox/cli` is the single composition
> root that instantiates concrete implementations and passes them to each
> other through the interfaces defined in core.

This means: the router team never sees the providers team's code — both code
against `ProviderRegistry` / `ChatModel` from core. If a contract seems wrong,
**do not edit core** — append to `/INTEGRATION-NOTES.md` and work around it
locally; the integrator resolves contract changes in one place.

## Package map

```
packages/
  core       FROZEN — types, EventBus, config schema+loader, pricing table
  providers  ProviderAdapter impls: anthropic, openai-compat (xAI/OpenAI/Ollama), mock
  router     RoutingDecision engine: classification, policy table, escalation, budget degradation
  ledger     JSONL persistence, summaries, budget state, savings-vs-baseline
  agent      AgentRunner: the tool-use loop, permissioning, escalation signal detection
  tools      Built-in Tool impls: read, write, edit, bash, glob, grep
  spec       SpecEngine: phase state machine, EARS templates, task execution orchestration
  steering   SteeringStore: front-matter parsing, inclusion selection, compat imports
  hooks      HookEngine: command hooks (stdin JSON / exit codes), agent hooks, file watcher
  tui        Ink UI: transcript renderer, status line, permission prompts, panels
  cli        Composition root: arg parsing, session orchestration, SessionController impl
```

Dependency edges (all point at core only):

```
providers ─┐                                  ┌─ tui
router ────┤                                  │
ledger ────┼──▶ @cox/core ◀───────────────────┤
agent ─────┤   (types + EventBus +            │
tools ─────┤    config + pricing)             │
spec ──────┤                                  │
steering ──┤          cli ────────────────────┘
hooks ─────┘          (imports EVERYTHING — the only package allowed to)
```

## Runtime dataflow — one interactive turn

```
user types prompt in TUI
  └▶ SessionController.submitPrompt (cli)
      ├▶ HookEngine.fire(UserPromptSubmit)            [may block]
      ├▶ SteeringStore.select(...)  ─▶ system prompt (stable-first for cache)
      ├▶ Router.route(RoutingInput) ─▶ RoutingDecision
      │     └▶ emits routing_decision event ─▶ TUI announces it
      ├▶ HookEngine.fire(PreModelCall)                [may override tier]
      └▶ AgentRunner.run(task)
            loop:
              ChatModel.stream(...)  ── text/tool_use events ─▶ EventBus ─▶ TUI
              Tool.execute(...)      ── permission requests ─▶ TUI prompt
              hooks: PreToolUse / PostToolUse          [may block tool]
              on failure signals ─▶ Router.reconsider ─▶ maybe escalate model
            on each model_call_finished:
              └▶ cli listener builds LedgerEntry ─▶ Ledger.record
                    └▶ Ledger.budgetState ─▶ budget_alert events / hard stop
```

**Ownership of the ledger write:** the `cli` package subscribes to
`model_call_finished` events and writes ledger entries. The agent loop does
not call the ledger directly (keeps agent ⊥ ledger).

**Escalation mechanics:** the agent accumulates `EscalationSignal`s and calls
`Router.reconsider(...)` between loop iterations. On a new decision it swaps
the `ChatModel` and continues with the same history. Note in the transcript
that a model swap forfeits the prompt cache (cache is per-model) — the router
weighs this: escalation must clear a value bar, not fire on the first hiccup.

## Spec execution dataflow

```
cox spec run <name>
  └▶ SpecEngine.runTask
      ├▶ next pending task from spec.json (or --task N)
      ├▶ builds AgentTask{kind: "spec-task-exec", complexityHint: task.complexity,
      │                    prompt: task + requirements excerpt + design excerpt}
      ├▶ AgentRunner.run(...)   (router maps complexity 1-2→scout-ok, 3→builder, 4-5→architect;
      │                          see docs/05 for the exact table)
      ├▶ on success: mark [x] in tasks.md + spec.json, fire TaskComplete hook
      └▶ phase transitions fire SpecPhaseChange hook + spec_event
```

Phase gates: `generate(phase)` produces a draft; `approve(phase)` is required
before the next phase unlocks. Approvals only ever come from an explicit user
action (command or TUI button) — never from the model.

## Prompt assembly & cache discipline (all teams read this)

Prompt caching is a prefix match; a single changed byte invalidates everything
after it. Therefore the system prompt is assembled **stable-first**:

```
[1] cox identity + tool instructions        (never changes within a session)
[2] steering: always-docs, sorted by name    (changes only when files change)
[3] imported compat docs (CLAUDE.md, ...)    (same)
--- cache breakpoint (ChatRequest.cacheBreakpointMessageIndex boundary) ---
[4] volatile context: fileMatch steering, date, spec/task context → goes in
    the FIRST USER MESSAGE of the turn, never in system
```

Never put timestamps, session ids, or per-turn state in [1]–[3]. The
anthropic adapter sets `cache_control` at the breakpoint; the ledger records
`cacheReadTokens` so `/ledger` can show cache savings.

## Storage layout (project)

```
.cox/
  steering/*.md          steering docs (front matter: inclusion, fileMatchPattern)
  specs/<name>/          requirements.md, design.md, tasks.md, spec.json
  hooks.json             command hooks
  hooks/*.md             agent hooks (front matter: trigger, tier; body = prompt)
  ledger.jsonl           append-only model-call ledger (gitignored)
  sessions/              transcripts (gitignored)
cox.config.json          project config (committed)
~/.cox/config.json       user config
```

## Testing strategy

- Unit tests per package with **vitest**; no network in tests, ever.
- `@cox/providers` exports `MockChatModel` (scripted responses) — router,
  agent, and spec tests consume it.
- `fixtures/events-sample.jsonl` — TUI renders it via `cox replay` (dev
  command) without any engine existing.
- `examples/demo-project/` — e2e smoke target for the spec engine.
- Integration wiring tests live in `@cox/cli` and run only after workstreams
  merge (see docs/03 milestones).
