# ⛵ Coxswain (`cox`)

**A local, terminal-native coding agent that treats model selection as a
first-class, visible decision.** Coxswain amalgamates the best ideas from four
agent CLIs — and adds the thing none of them have: deliberate three-tier model
routing with the receipts on screen.

```
⑆ router  "add unit tests for parser" → builder (claude-sonnet-5)
          task-type=tests · complexity=2
          est 12.4k in / ~3k out ≈ $0.08   session $0.42/$5.00 ██░░░░░░

⛵ builder claude-sonnet-5 │ ▲128k ▼24k │ $0.42/$5.00 │ cache 71% │ spec auth-flow 4/9
```

| Borrowed from | What |
|---|---|
| **Kiro** | Spec Coding (`requirements → design → tasks` with approval gates) · Steering Docs |
| **Claude Code** | The agentic tool loop · lifecycle hooks · permission modes · `CLAUDE.md` compatibility |
| **Copilot CLI** | `explain` / `suggest` one-shots · model choice as a user-facing feature |
| **Grok Build** | Plan-first ethos · cheap-model defaults · speed |
| **Coxswain's own** | Tier router (scout/builder/architect) · per-call cost announcements · cost ledger + budgets · savings-vs-baseline reporting · prompt-cache-aware assembly |

**Status:** implemented and integration-tested — 12 packages, 895 tests, the
full pipeline verified end-to-end against scripted models. Live-API smoke
(milestone M3) is the remaining step. See [Status & roadmap](#status--roadmap).

---

## Why

Every existing CLI agent burns one flagship model on everything: renaming a
variable bills at the same per-token rate as designing an architecture.
Coxswain routes each call to the cheapest tier that can do the job, tells you
why, and keeps a ledger you can audit:

```
session ses_a1b2 — 47 calls, 891k in (612k cached) / 103k out, $1.87
  tier       calls  in-tok  out-tok    cost  share
  scout         29    102k      11k   $0.16     9%
  builder       15    614k      78k   $1.32    71%
  architect      3    175k      14k   $0.39    21%
  ─ savings vs all-architect baseline: $6.41 (77% saved)
  ─ cache: 612k reads saved ≈ $1.65 vs uncached
```

The three tiers, remappable in config:

| Tier | Role | Default model | $/MTok in/out |
|---|---|---|---|
| `scout` | classify, explain, mechanical edits, agent hooks | `claude-haiku-4-5` | $1 / $5 |
| `builder` | routine implementation, tests, spec task execution | `claude-sonnet-5` | $3 / $15 |
| `architect` | requirements, design, review, escalation target | `claude-opus-4-8` | $5 / $25 |

Routing precedence: explicit user override (`/model`, `-m`) → hook override →
per-kind policy table → a cached Haiku classification for free-form chat →
configured default. A budget governor can only *degrade* tiers, and
escalation (builder → architect, one step, once per task) fires only on
evidence: two failed verifications, a tool-error streak, or a stuck loop —
never on vibes. Every decision's reasons print verbatim in the transcript.

## Install & quick start

Requires Node ≥ 20 and pnpm. (v1 runs from source via `tsx`; packaged
binaries are on the roadmap.)

```bash
git clone <this repo> && cd coxswain
pnpm install
export ANTHROPIC_API_KEY=sk-ant-...

pnpm cox doctor            # checks node, config, keys, connectivity
pnpm cox                   # interactive session (TTY)
pnpm cox --print "add a zero-divide guard to src/math.js"   # non-interactive
pnpm cox explain "git rebase --onto"                        # one-shot, scout tier
```

No key yet? These work offline: `pnpm cox models`, `pnpm cox doctor
--offline`, and `pnpm cox replay fixtures/events-sample.jsonl` — the last one
drives the full TUI with a recorded session so you can see the product
without spending a token.

## The four pillars

### 1 · Spec coding

Features flow through three gated phases, stored in `.cox/specs/<name>/`:

```bash
pnpm cox spec new auth "magic-link login"   # → drafts requirements.md (architect tier)
pnpm cox spec approve auth                  # gate: human approves requirements
pnpm cox spec design auth                   # → design.md (architect)
pnpm cox spec approve auth design
pnpm cox spec tasks auth                    # → tasks.md checklist (builder)
pnpm cox spec approve auth tasks
pnpm cox spec run auth                      # executes next pending task
pnpm cox spec status                        # board across all specs
```

Requirements use EARS acceptance criteria with stable ids (`R1.2`); tasks
carry `complexity: 1–5` ratings that drive routing (1–2 → scout, 3 →
builder, 4–5 → architect). Regenerating an approved phase demotes it and
cascades downstream approvals. Two consecutive task failures mark the task
`blocked` instead of burning tokens retrying.

### 2 · Steering docs

Persistent project context in `.cox/steering/*.md`, controlled by front
matter:

```markdown
---
inclusion: fileMatch          # always | fileMatch | manual
fileMatchPattern: "src/api/**"
---
# API conventions
All handlers validate input with zod and return problem+json errors.
```

`cox steer init` writes starter `product.md` / `tech.md` / `structure.md`.
`always` docs join the system prompt (sorted, byte-stable — so prompt caching
holds); `fileMatch` docs inject only when the working set touches matching
files; `manual` docs via `/steer use <name>`. Existing `CLAUDE.md`,
`AGENTS.md`, and `.github/copilot-instructions.md` are imported
automatically. `/context` shows exactly what's in the prompt and what each
piece weighs in tokens — context bloat is cost bloat, and oversized steering
gets flagged.

### 3 · Hooks

**Command hooks** (`.cox/hooks.json`, merged user → project) run shell
commands on lifecycle events, receiving a JSON payload on stdin:

```json
{
  "hooks": [
    { "event": "PreToolUse", "matcher": "bash", "command": "./scripts/audit-cmd.sh" },
    { "event": "PreModelCall", "command": "./scripts/office-hours-tier.sh" },
    { "event": "TaskComplete", "command": "say 'task done'" }
  ]
}
```

Exit 0 continues (stdout JSON may carry `{"tierOverride": "scout"}` on
`PreModelCall` — a scriptable frugality lever); exit 2 blocks the action and
feeds stderr back to the model; timeouts (default 30s, then SIGKILL) never
block. Events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PreModelCall`, `PostModelCall`, `SpecPhaseChange`,
`TaskComplete`, `Stop`, `SessionEnd`.

**Agent hooks** (`.cox/hooks/*.md`) are Kiro-style automations — a trigger
plus a prompt, run as a cheap autonomous agent task (tier defaults to scout):

```markdown
---
name: sync-tests
trigger: { type: fileSave, pattern: "src/**/*.ts" }
tier: scout
---
Update the unit tests for the file that just changed. Only touch test files.
```

File-save triggers fire from the in-session watcher; `cox hook run <name>`
runs one manually.

### 4 · Frugal routing, visibly

Covered above — but the parts that make it trustworthy:

- **The ledger is append-only JSONL** (`.cox/ledger.jsonl`): every model call
  — including the router's own classification calls — lands with tokens,
  cache reads/writes, cost, tier, and the routing reasons at call time.
  `cox ledger [--spec X] [--since T]` reports offline.
- **Budgets** (`sessionUsd`, `sessionTokens`, per-spec `specUsd`): warn at
  80%, degrade architect→builder, hard-stop at 100% until `/budget extend`.
- **Prompt-cache discipline**: system prompts assemble stable-first
  (identity → steering → imports, then a cache breakpoint; volatile context
  rides in the user turn), and the ledger prices cache reads at cache rates
  so the savings show up in the report.
- **Escalation is priced in**: swapping models mid-task forfeits the prompt
  cache, so it only happens on the evidence thresholds, one step, once.

## Command reference

```
cox                          interactive TUI session
cox --print "<prompt>"       one-shot non-interactive run (CI/pipes; --yolo to auto-allow)
cox -m <tier> ...            force a tier for the session (scout|builder|architect)
cox spec new|approve|design|tasks|run|status
cox steer init               starter steering docs
cox hook run <name>          run an agent hook manually
cox explain "<text>"         one-shot explanation (always scout)
cox suggest "<text>"         one-shot shell suggestion (scout; last line is the bare command)
cox ledger [--spec X]        cost reports
cox models                   configured tiers, models, pricing
cox doctor [--offline]       environment/key/connectivity checks
cox replay <events.jsonl>    render a recorded session through the real TUI
```

In-session slash commands: `/model <tier|auto>`, `/context`, `/ledger`,
`/budget extend <usd>`, `/spec …`, `/steer …`, `/hook …`. `Esc` interrupts
the in-flight call (including killing a running bash tool).

## Configuration

`cox.config.json` (project, committed) deep-merges over `~/.cox/config.json`
(user). Keys come from env vars only — never from config files. Everything
below is optional; defaults shown are the shipped ones:

```jsonc
{
  "tiers": {
    "scout":     { "primary": { "provider": "anthropic", "model": "claude-haiku-4-5" }, "fallbacks": [] },
    "builder":   { "primary": { "provider": "anthropic", "model": "claude-sonnet-5" }, "fallbacks": [] },
    "architect": { "primary": { "provider": "anthropic", "model": "claude-opus-4-8" },
                   "fallbacks": [{ "provider": "anthropic", "model": "claude-sonnet-5" }] }
  },
  "providers": {
    "anthropic": { "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "openaiCompat": [
      { "id": "xai",    "baseUrl": "https://api.x.ai/v1", "apiKeyEnv": "XAI_API_KEY",
        "models": ["grok-4-1-fast", "grok-4-3"] },
      { "id": "ollama", "baseUrl": "http://localhost:11434/v1",
        "models": ["qwen2.5-coder:14b"] }
    ]
  },
  "routing": {
    "classifyWithScout": true,
    "defaultTier": "builder",
    "escalation": { "enabled": true, "toolErrorStreak": 3, "verificationFailures": 2 },
    "announce": true
  },
  "budgets": { "sessionUsd": 5, "specUsd": 2, "warnAt": 0.8, "hardStop": true },
  "permissions": { "mode": "default", "allowBash": ["git status", "pnpm test"], "denyBash": ["rm -rf"] },
  "steering": { "importCompat": true, "warnTokens": 2000 }
}
```

Point a tier at xAI or a local Ollama model and the ledger prices it
accordingly (Ollama = $0). Permission modes mirror Claude Code: `default`,
`acceptEdits`, `plan`, `yolo`; bash prefix allow/deny lists apply *before*
any prompt.

## Architecture

Eleven packages in a pnpm workspace, with one load-bearing rule: **everything
imports only `@cox/core`** (frozen contracts, config schema, pricing, event
bus). `@cox/cli` is the single composition root; engines communicate through
one typed `AgentEvent` stream that the TUI renders and the ledger subscriber
records — which is why the whole UI can be developed and tested against a
recorded fixture (`cox replay`) with no engine running.

| Package | Responsibility |
|---|---|
| `core` | Types, config, pricing table, event bus — the contract everything codes against |
| `providers` | Anthropic + OpenAI-compat adapters, streaming, failover, scripted mock |
| `router` / `ledger` | Tier policy, classification, budget governor, escalation / JSONL ledger, summaries, baseline math |
| `agent` / `tools` | The tool-use loop, permissions, abort, escalation signals / read, write, edit, bash, glob, grep |
| `spec` | Phase state machine, EARS templates, task parsing, execution orchestration |
| `steering` / `hooks` | Doc selection + compat imports / command hooks, agent hooks, file watcher |
| `tui` / `cli` | Ink renderer (transcript, status line, modals) / commands, composition root, session controller |

Deep dives live in `docs/`: overview (`00`), architecture and dataflow
(`01`), contract ownership (`02`), the parallel build plan (`03`),
conventions (`04`), the routing/ledger behavior spec (`05`), and the
build-fleet handoff prompts (`06`).

## Development

```bash
pnpm install
pnpm typecheck        # all packages
pnpm test             # 895 tests, fully offline — no keys, no network
pnpm cox replay fixtures/events-sample.jsonl   # exercise the TUI
```

Tests are offline by design: providers are tested against fake SDK streams,
the agent loop against scripted models, hooks against temp-dir shell
fixtures. `examples/demo-project/` is the e2e target for the spec workflow.

**Provenance, for the curious:** this codebase was built by six parallel
Sonnet-class agent sessions working in isolated git worktrees — one per
workstream — from spec packs in `docs/specs/` (requirements/design/tasks,
the same format Coxswain itself uses: the tool's development dogfooded its
own methodology). A stronger integrator session merged the lanes and
resolved every cross-lane contract question; the full audit trail is in
`INTEGRATION-NOTES.md` and the per-task commit history.

## Status & roadmap

**Done (M2):** all packages implemented; 895 tests, 0 type errors; the M2
integration test drives the real composition root end-to-end (routing →
streaming → permissions → ledger → snapshot) against scripted models;
offline commands verified live.

**Next (M3):** live-API smoke — `cox explain`, a `--print` run, one full
spec flow against `examples/demo-project` — then `v0.1.0`.

**v2 candidates:** MCP servers (the tool registry is shaped for it),
watch-mode daemon for agent hooks, Grok-style parallel subagent fan-out (the
event model supports it), packaged binaries, Windows.

**Known gap:** plain/`--print` mode's routing blocks omit the live budget
figure (TUI mode shows it); tracked in `INTEGRATION-NOTES.md`.
