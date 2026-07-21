# Coxswain (`cox`) — Product Overview

**One sentence:** Coxswain is a local terminal coding agent that plans like Kiro (spec coding + steering docs), works like Claude Code (agentic tool loop + hooks), ships like Grok Build (fast, cheap, parallel-minded), and — its differentiator — **routes every model call to the cheapest tier that can do the job, with the receipts on screen.**

## Why it exists

Every existing CLI agent burns tokens on one flagship model for everything: renaming a variable costs the same per-token rate as designing an architecture. Coxswain treats model selection as a first-class, *visible* decision:

- **Spec Coding** (from Kiro): features flow through `requirements.md` → `design.md` → `tasks.md` with explicit human approval gates between phases. Tasks carry complexity ratings that drive routing.
- **Steering Docs** (from Kiro): persistent project context in `.cox/steering/` (`product.md`, `tech.md`, `structure.md`), included always / by file-match / manually — plus compatibility imports of `CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md`.
- **Hooks** (from Claude Code + Kiro): shell command hooks on lifecycle events (PreToolUse, PreModelCall, Stop, …) with allow/block semantics, and Kiro-style *agent hooks* — file-save automations that run cheap-tier agent prompts.
- **Frugal routing with visibility** (the Grok Build ethos, systematized): three tiers — `scout` / `builder` / `architect` — a classification + escalation router, per-call cost announcements, a persistent ledger, budgets with hard stops, and prompt-cache-aware prompt assembly.

## The three tiers

| Tier | Role | Default model | $/MTok in/out |
|---|---|---|---|
| `scout` | classify, summarize, explain, mechanical edits, agent hooks | `claude-haiku-4-5` | $1 / $5 |
| `builder` | routine implementation, tests, spec task execution | `claude-sonnet-5` | $3 / $15 |
| `architect` | requirements, design, review, escalation target | `claude-opus-4-8` | $5 / $25 |

Users can remap tiers in `cox.config.json` (e.g. scout → `xai/grok-4-1-fast` at $0.20/$0.50, or a local Ollama model at $0). Fallbacks per tier handle provider outages.

## What visibility looks like

Every routed call announces itself in the transcript:

```
⑆ router  "add unit tests for parser" → builder (claude-sonnet-5)
          reasons: task-type=tests · complexity=2 · spec task 4/9 hint
          est: 12.4k in / ~3k out ≈ $0.08   session: $0.42 / $5.00 ██░░░░░░
```

And the status line always shows: current model · session tokens in/out · cost vs budget bar · active spec progress. `/ledger` prints per-tier and per-model breakdowns **plus the savings vs an all-architect baseline** — the number that justifies the product.

## Command surface (v1)

```
cox                         # interactive session (TUI)
cox spec new <name> "idea"  # start a spec; also /spec inside the TUI
cox spec approve|design|tasks|run|status <name>
cox steer init              # generate product/tech/structure steering docs
cox hook run <name>         # run an agent hook manually
cox explain "cmd or code"   # one-shot, always scout tier
cox suggest "what I want"   # one-shot shell suggestion, scout tier
cox ledger [--spec X]       # offline cost reports
cox models                  # configured tiers, models, pricing
cox doctor                  # keys, config, connectivity check
```

In-session slash commands mirror these: `/spec`, `/steer`, `/model <tier>`, `/context` (what's in the prompt and its token weight), `/ledger`, `/budget`.

## Explicitly out of scope for v1 (stretch/v2)

MCP servers (tool registry is designed so they slot in), watch-mode daemon for agent hooks (v1 fires them from the in-session file watcher), subagent parallelism à la Grok Build's 8-way fan-out (event model supports it later), bundled binary distribution (v1 runs via `tsx`), Windows support (macOS/Linux first).

## Glossary

- **Tier** — routing bucket (`scout`/`builder`/`architect`), not a model. Config binds tiers to models.
- **Spec** — a feature folder `.cox/specs/<name>/` holding `requirements.md`, `design.md`, `tasks.md`, `spec.json` (state).
- **Steering doc** — markdown in `.cox/steering/` with YAML front matter controlling inclusion.
- **Command hook** — shell command fired on a lifecycle event; exit 2 blocks the action.
- **Agent hook** — a stored prompt + trigger + tier; runs as a cheap autonomous agent task.
- **Ledger** — append-only JSONL of every model call with tokens, cost, and routing reasons.
- **Escalation** — router upgrading the tier mid-task after failure signals (test failures, tool-error streaks, stuck loops).
