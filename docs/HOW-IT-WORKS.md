# How it works

CX OS on Coxswain is **engine × fleet**: the monorepo engine runs the coding agent and CX domain packages; fleet workspaces hold programs and operate state. This page explains the seven OS layers, the engine packages, and the end-to-end path from idea to CAB export.

Architecture diagram: [COXSWAIN-ARCHITECTURE.png](./COXSWAIN-ARCHITECTURE.png) · [SVG](./COXSWAIN-ARCHITECTURE.svg)  
Complete command map: [CXOS-COMPLETE.md](./CXOS-COMPLETE.md)

---

## Mental model

```text
┌──────────────────────── CXOS FLEET (workspace) ─────────────────────────┐
│  programs under .cox/cx/<name>/                                          │
│  board · queue · dashboard · brief · audit · cab-export                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ uses
┌───────────────────────────────▼─────────────────────────────────────────┐
│  PACKS + ADAPTERS                                                         │
│  detectPack → seed design → orchestrateBuild                             │
│  adapters: artifacts · local (offline) · aws (plan-only CFN)             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ powered by
┌───────────────────────────────▼─────────────────────────────────────────┐
│  COXSWAIN ENGINE (pnpm monorepo)                                          │
│  composition root: packages/cli                                           │
│  coding agent + cx domain + vertical packs + fabric                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Hard rules at every layer:** offline-first, propose-only ops, AWS plan-only (never CreateStack), strong graph first, CLI sole composition root.

---

## Seven layers of the OS

Every `pnpm cox cx …` command lives in exactly one primary layer.

| Layer | Responsibility | Primary commands |
|---|---|---|
| **01 Catalog** | Closed ontology packs, strong graph, journeys, intents, KPIs, NBA rules, channels | `catalog`, `ontology *`, `graph-find`, `journeys`, `nba` |
| **02 Program** | Spec lifecycle, multi-target build, design merge, approval gates | `init`, `new`, `approve`, `plan`, `build`, `run`, `archive`, `restore` |
| **03 Observe** | Health, doctor, simulate, report (read-only) | `doctor`, `status`, `health-history`, `simulate`, `report` |
| **04 Operate** | Console tick, proposals, tasks, watch/daemon (propose-only) | `console`, `operate`, `watch`, `daemon`, `proposals`, `claim`/`apply`, `tasks`, `task` |
| **05 Fleet** | Multi-spec board, work queue, HTML dashboard | `board`, `queue`, `dashboard`, `fleet-status` |
| **06 Govern** | Brief, audit, snapshot, CAB export, AWS plan handoff | `brief`, `audit`, `cab-export`, `snapshot`, `export-aws` |
| **07 Fabric** | Local stack readiness, SQLite, logging, healthz, CI/Docker | `cx:stack-up`, LaunchAgents, hybrid/live wiring |

### Strong / weak graph practice

| Kind | Where | Behavior |
|---|---|---|
| **Strong nodes** | Ontology catalog + strong graph | Deterministic: intents, journeys, NBA rules, KPIs, channels. Zero model calls. |
| **Weak nodes** | Artifacts / AWS generate when keys present | LLM JSON constrained by ontology; optional absorb into strong hubs |
| **Control path** | Every ops surface | Returns `path[]` audit trail |
| **Intent router** | Console tick | healthy → none; degraded → investigate; down → remediate; always gated |
| **NBA** | `nba` / report / console | Pure rule match over the ontology pack |

### Build targets (always artifacts first)

| Target | Offline behavior | Live / hybrid |
|---|---|---|
| **artifacts** | Deterministic design docs under `.cox/cx/<spec>/artifacts/` | Weak generate when model keys present |
| **local** | Disk-backed status/sim under `local/` | HTTP bind when local platform healthy |
| **aws** | Plan-only `template.yaml` + `APPLY.md` under `aws/` | Plan-only + model-assisted docs; **never** CreateStack |

---

## Engine packages

Composition root: `@cox/cli`. Contracts: `@cox/core` (coding agent) and `@cox/cx-core` (CX domain). Import law: packages import frozen contracts only; adapters never import each other or `cx-ops`.

### Coding agent

| Package | Responsibility |
|---|---|
| `core` | Types, config schema, pricing, event bus (frozen contracts) |
| `providers` | Anthropic + OpenAI-compat (xAI, Ollama), streaming, mock |
| `router` | Tier policy, classification, escalation, budget degradation |
| `ledger` | JSONL ledger, summaries, savings-vs-baseline |
| `agent` | Tool-use loop, permissions, escalation signals |
| `tools` | read, write, edit, bash, glob, grep |
| `spec` | Phase state machine, EARS templates, task orchestration |
| `steering` | Doc selection, front matter, compat imports |
| `hooks` | Command hooks, agent hooks, file watcher |
| `tui` | Ink UI (transcript, status line, modals) |
| `cli` | Composition root, commands, session controller |

### CX domain

| Package | Responsibility |
|---|---|
| `cx-core` | Ontology types, strong graph, closed-world helpers |
| `cx-artifacts` | Artifacts target adapter |
| `cx-local` | Local bind adapter |
| `cx-aws` | Plan-only AWS adapter |
| `cx-ops` | Orchestrate, console, board, cab-export, offline adapters, facades |
| `cx-journey` / `cx-knowledge` / `cx-agent` / `cx-analytics` / `cx-govern` | Focused facades over operate surfaces |
| `cx-pack-registry` | `detectPack` / `scorePack` keyword scoring |
| `cx-pack-retail` | Retail design seed (returns, loyalty, pickup, order, retention) |
| `cx-pack-financial` | Financial seed (inquiry, fraud, loan, onboarding, retention) |
| `cx-pack-healthcare` | Healthcare seed (appointment, claims, prior auth, benefits) |
| `cx-pack-travel` | Travel seed (booking, disruption, loyalty, check-in, retention) |

Telco multi-journey seed lives as a **legacy path** in `cx-ops` (`telco-design-pack.ts`) and is triggered by telco keywords. Primary product narrative is domain-agnostic packs + `default` ontology; **TelcoCXOS** is a separate demo workspace.

Deep coding-agent dataflow: [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) · Routing/ledger behavior: [05-ROUTING-AND-LEDGER.md](./05-ROUTING-AND-LEDGER.md)

---

## E2E flow: idea → CAB

Illustrative retail path (fully offline):

### 1. Doctor and workspace

```bash
cd ~/coxswain
pnpm install
pnpm cox doctor --offline
pnpm cox --cwd /tmp/cx-demo cx init
```

### 2. Catalog grounding (optional, strong-only)

```bash
pnpm cox --cwd /tmp/cx-demo cx catalog --pack local
pnpm cox --cwd /tmp/cx-demo cx journeys
pnpm cox --cwd /tmp/cx-demo cx ontology validate
pnpm cox --cwd /tmp/cx-demo cx graph-find returns
```

### 3. One-shot program create + multi-target build

```bash
pnpm cox --cwd /tmp/cx-demo cx run holiday-returns-2026 \
  "Holiday returns surge for national retail: returns and refunds, loyalty, store pickup, order support, retention" \
  --target all
```

What `run` does:

1. Create program under `.cox/cx/holiday-returns-2026/` if missing  
2. Seed CX-EARS requirements from the idea string  
3. Approve requirements (golden path gate)  
4. `detectPack(idea)` → e.g. `retail` → `seedRetailDesignPack`  
5. Build order: **artifacts** → merge design → **local** → **aws** (plan-only)  
6. Status + local simulate + report / NBA  

### 4. Observe and fleet

```bash
pnpm cox --cwd /tmp/cx-demo cx status holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx board
pnpm cox --cwd /tmp/cx-demo cx dashboard /tmp/cx-demo/ops.html
```

### 5. Operate (propose only)

```bash
pnpm cox --cwd /tmp/cx-demo cx operate holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx proposals holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx claim holiday-returns-2026 prop_…
pnpm cox --cwd /tmp/cx-demo cx tasks holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx task holiday-returns-2026 task_… done
```

`claim` is an alias for `apply`: creates a task + remediation note; does **not** mutate AWS or Connect.

### 6. Govern and CAB

```bash
pnpm cox --cwd /tmp/cx-demo cx brief holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx audit holiday-returns-2026
pnpm cox --cwd /tmp/cx-demo cx cab-export holiday-returns-2026
```

CAB package layout (`./cx-cab/<name>/`):

```text
MANIFEST.md
BRIEF.md
proposals.json
tasks.json
deployments.json
aws/                 # template.yaml, APPLY.md, optional architecture/agent JSON
remediations/        # operator notes from apply
audit.jsonl?         # when present
```

A human reviews `aws/APPLY.md` and applies CloudFormation with scoped credentials. Coxswain never runs CreateStack.

### Sequence (compressed)

```text
idea
  → detectPack / seed design pack
  → program gates (requirements approved)
  → build artifacts → local → aws plan
  → health / simulate / report
  → console proposes
  → human claim/apply → task → done
  → brief + cab-export
```

---

## Coding agent loop (same monorepo)

When you run `pnpm cox` without `cx`, you get the terminal coding agent:

```text
prompt
  → hooks (UserPromptSubmit)
  → steering select (stable-first for cache)
  → router.route → announce tier + est cost
  → hooks (PreModelCall, may tierOverride)
  → agent tool loop (permissions, tools)
  → model_call_finished → ledger record
  → budget alerts / hard stop
```

Specs under `.cox/specs/<name>/` use the same approve gates as CX programs. See [00-OVERVIEW.md](./00-OVERVIEW.md).

---

## Offline vs live modes

| Mode | When | What changes |
|---|---|---|
| **offline** (default) | No keys / no stack | Deterministic adapters; tests and workshops |
| **live** | `--live` and healthy stack/keys | Prefer real platform/models where wired |
| **hybrid** | `--auto-live` / `CX_AUTO_LIVE=1` | Live when healthy, offline fallback |

Fail closed on live doctor when stack is not ready. Core product demos never depend on live AWS mutation.

---

## Related docs

- [WHY.md](./WHY.md): problem and tenets  
- [COMPARISON.md](./COMPARISON.md): competitive matrix  
- [PACK-AUTHORING.md](./PACK-AUTHORING.md): add a vertical pack  
- [CXOS-COMPLETE.md](./CXOS-COMPLETE.md): full command inventory  
- [CXOS-OPERATOR-RUNBOOK.md](./CXOS-OPERATOR-RUNBOOK.md): day-1 / day-2 by role  
