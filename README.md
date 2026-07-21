# ⛵ Coxswain (`cox`)

A local, terminal-native coding agent that amalgamates the best of four tools
— and adds the thing none of them have: **deliberate, visible model routing.**

| Borrowed from | What |
|---|---|
| **Kiro** | Spec Coding (`requirements → design → tasks` with approval gates) and Steering Docs |
| **Claude Code** | The agentic tool loop, lifecycle hooks, permission modes, CLAUDE.md compatibility |
| **Copilot CLI** | `explain` / `suggest` one-shots, model choice as a user-facing feature |
| **Grok Build** | Plan-first ethos, speed, cheap-model defaults, autonomous goal runs (v2) |
| **Coxswain's own** | Three-tier router (scout/builder/architect), per-call cost announcements, ledger + budgets, savings-vs-baseline reporting, prompt-cache-aware assembly |

```
⑆ router  "add unit tests for parser" → builder (claude-sonnet-5)
          task-type=tests · complexity=2
          est 12.4k in / ~3k out ≈ $0.08   session $0.42/$5.00 ██░░░░░░
```

## Status

**Design-complete, pre-implementation.** `@cox/core` (contracts, config,
pricing, event bus) is written, typechecked, and tested. Everything else is
specified in `docs/specs/*` and built by six parallel workstreams — see
[`docs/03-BUILD-PLAN.md`](docs/03-BUILD-PLAN.md) and
[`docs/06-HANDOFF-PROMPTS.md`](docs/06-HANDOFF-PROMPTS.md) to launch them.

## Repo tour

```
docs/00-OVERVIEW.md            what & why, command surface, glossary
docs/01-ARCHITECTURE.md        package map, dataflow, cache discipline
docs/02-INTERFACES.md          who implements/consumes each core contract
docs/03-BUILD-PLAN.md          6 parallel workstreams, milestones M1-M3
docs/04-CONVENTIONS.md         toolchain, style, testing, security
docs/05-ROUTING-AND-LEDGER.md  the frugality engine, precisely specified
docs/06-HANDOFF-PROMPTS.md     paste-ready kickoff prompts per workstream
docs/specs/<ws>/               requirements / design / tasks per workstream
packages/core                  FROZEN contracts (done: typecheck + tests green)
packages/*                     stubs awaiting their workstreams
fixtures/, examples/           TUI replay fixture + spec-engine e2e target
```

## Quick start (once built)

```bash
pnpm install
export ANTHROPIC_API_KEY=...
pnpm cox                    # interactive session
pnpm cox spec new auth "magic-link login"
pnpm cox ledger
```

Default tiers: scout `claude-haiku-4-5` · builder `claude-sonnet-5` ·
architect `claude-opus-4-8`. Remap in `cox.config.json` (xAI / OpenAI-compat
/ Ollama supported via the openai-compat adapter).
