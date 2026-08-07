# CXOS Complete: Customer Experience Operating System map

This is the **complete system map** for CXOS on Coxswain: layers, every
`cox cx` command by lifecycle, package map, offline/live wiring, human gates,
workspace layout, control paths, and how personas map onto the surface.

| Document | Role |
|---|---|
| **This file** | OS map (layers, full command inventory, packages, gates) |
| [`CXOS.md`](./CXOS.md) | Technical north star (graph practice, runtime, cheat sheet) |
| [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md) | Personas, jobs-to-be-done, playbooks, value spine |
| [`packages/cx-ops/README.md`](../packages/cx-ops/README.md) | Operate-layer module API |
| [`examples/cx-demo/README.md`](../examples/cx-demo/README.md) | Golden path and demo tracks |

**Product promise:** turn a CX idea into multi-target artifacts and an AWS
plan, then run a **human-gated** operate loop (health → proposal → task →
done) without silent production mutation.

Composition root: `@cox/cli` wires `cox cx …`. Contracts: `@cox/cx-core`.
Adapters: `@cox/cx-artifacts`, `@cox/cx-local`, `@cox/cx-aws`. Operate:
`@cox/cx-ops` (injected adapters only; never imports sibling adapters).

---

## 1. Operating system layers

Layers stack from closed catalog up through fleet and fabric. Every CLI
command lives in exactly one primary layer.

| Layer | Responsibility | Primary surface | Lifecycle bucket |
|---|---|---|---|
| **Catalog** | Closed ontology / strong graph | `catalog`, `ontology *`, `journeys`, `nba` | design (grounding) |
| **Program** | Spec lifecycle + multi-target build | `init` `new` `approve` `list` `plan` `build` `deploy` `run` `teardown` `archive` `restore` | design + build |
| **Observe** | Health, simulate, report, scores | `status` `health-history` `simulate` `report` `doctor` | operate (read) |
| **Operate** | Propose → claim → task → close | `console` `watch` `daemon` `operate` `proposals` `proposal` `claim`/`apply` `tasks` `task` | operate |
| **Fleet** | Multi-spec board + health poll | `board` `fleet-status` | fleet |
| **Govern** | Brief, audit, CAB/snapshot, AWS plan handoff | `brief` `audit` `cab-export` `snapshot` `export-aws` | govern |
| **Fabric** | Local stack readiness | `cx:stack-up`, LaunchAgents, hybrid/live wiring | operate (platform) |

### Kernel hard rules

1. **No silent prod mutation.** Console, watch, and daemon **propose** only.
2. **AWS is plan-only.** Coxswain writes `template.yaml` + `APPLY.md`; humans
   apply CFN (`export-aws` / `cab-export`). Never CreateStack from Coxswain.
3. **Offline-first.** Live/hybrid only when stack and optional keys are ready.
4. **Strong graph first.** Weak models optional for generate only; NBA and
   console routing are pure graph.
5. **Import law.** `cx-*` packages import only `@cox/core` and `@cox/cx-core`.
   Adapters never import each other or `cx-ops`. CLI is sole composition root.

### Strong / weak graph practice

| Kind | Where | Behavior |
|---|---|---|
| **Strong nodes** | Ontology catalog + `buildStrongGraph` | Deterministic: intents, journeys, NBA rules, KPIs, channels. Zero model calls. |
| **Weak nodes** | Artifacts / AWS generate when keys present | LLM JSON constrained by ontology prompts; optional absorb into strong hubs. |
| **Identity / absorb** | Live artifacts (`absorbWeak`) | Weak labels resolve into strong hub ids when possible. |
| **Control path** | Every ops surface | Returns `path[]` audit (e.g. `load_strong → poll_status → route:… → propose_gated → emit`). |
| **Intent router** | Console tick | `healthy` → none; `degraded` → investigate; `down` → remediate; always gated. |
| **NBA** | `nba` / report / console | Pure `matchNbaRules` / `recommendNba` over the ontology pack. |

Ontology packs:

| Pack | Contents | Default for |
|---|---|---|
| `default` | Commercial seed catalog (`DEFAULT_ONTOLOGY`) | `ontology *`, pure `nba` |
| `local` | Default merged with platform treasury journeys (`LOCAL_PLATFORM_ONTOLOGY`) | build, doctor, journeys |

CLI: `--pack default|local`.

---

## 2. CLI map by lifecycle

All commands: `pnpm cox cx …` or `pnpm cox --cwd <dir> cx …`.

### Common flags

| Flag | Meaning |
|---|---|
| `--target <list>` | `artifacts`, `local`, `aws`, comma list, or `all` |
| `--live` | Prefer live models/platform wiring |
| `--auto-live` | Hybrid without `--live` (or `CX_AUTO_LIVE=1`) |
| `--mode offline\|live\|hybrid` | Explicit runtime mode |
| `--base-url <url>` | Local platform base URL (else `cox.config.json` `cx.targets.local`) |
| `--pack default\|local` | Ontology pack |

Global Coxswain flags also apply: `--cwd`, `-m/--model`, `--print`, `--yolo`.

---

### 2.1 Design (catalog + program gates)

Ground work in the closed world, then create and approve a CX program.

| Command | Purpose | Notes |
|---|---|---|
| `catalog [section] [--pack]` | Closed catalog browser | `all` (default) \| `domains` \| `intents` \| `kpis` \| `nba` \| `channels`; strong-only; default pack `local` |
| `ontology show [--pack]` | Inventory domains, journeys, KPIs, NBA rules | Strong-only; no models |
| `ontology validate [--pack]` | Catalog integrity + materialize strong graph | Exit 1 on failure |
| `ontology graph [--pack]` | Strong-graph node/edge stats | |
| `nba [k=v…] [--pack]` | Pure NBA recommend (`journey=` `stage=` `confidence=` …) | Graph match only |
| `journeys [--pack]` | Closed journey inventory | Default pack `local` |
| `init` | Ensure `.cox/cx`; seed `starter` if empty | Workspace bootstrap |
| `new <name> [idea…]` | Create CXOS spec under `.cox/cx/<name>/` | Seeds CX-EARS requirements |
| `approve <name> [phase]` | Approve `requirements` \| `design` \| `tasks` | Default: next unapproved; ordered gates |
| `list` | List CX specs | Active only (excludes `.archived-*`) |
| `archive <name>` | Soft-archive program | Renames to `.archived-<name>`; see §2.6 |
| `restore <name>` | Restore soft-archived program | Renames back; see §2.6 |

**Design gate rule:** cannot approve `design` before `requirements`, or
`tasks` before `design`. Build requires **requirements approved**. Successful
artifacts merge that produces journey maps may auto-approve **design**.

```bash
pnpm cox cx catalog --pack local
pnpm cox cx catalog domains --pack local
pnpm cox cx catalog nba
pnpm cox cx ontology validate --pack local
pnpm cox cx journeys --pack local
pnpm cox cx init
pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
# optional pure NBA while designing:
pnpm cox cx nba journey=billing_dispute stage=intake confidence=0.9
# or via monorepo script:
pnpm cx:catalog
pnpm cx:catalog -- domains
```

---

### 2.2 Build (multi-target plan → deploy)

One design fans out to three targets. Order is always **artifacts first**,
then local and aws, so neutral context is shared.

| Command | Purpose | Notes |
|---|---|---|
| `plan <name> [--target] [--live\|--mode]` | Per-target build plans, no side effects | |
| `build <name> [--target] [--live\|--auto-live\|--mode] [--base-url] [--pack]` | Plan + build + deploy (graph-ordered) | Artifacts first; merges design into workspace |
| `deploy <name> …` | Same path as build with deploy | Flags match build |
| `run <name> [idea…] [--target] [--live\|--auto-live\|--mode] …` | Golden one-shot | create if missing → approve requirements → build all → status → simulate local → report + NBA |
| `teardown <name> [--target] [--live] [--base-url]` | Tear down deployments | Clears deployment records |

**Targets:** `artifacts` | `local` | `aws` | `all` (comma lists allowed).

| Target | Adapter | Offline | Live / plan |
|---|---|---|---|
| `artifacts` | `@cox/cx-artifacts` or offline artifacts | Deterministic docs under `.cox/cx/<spec>/artifacts/` | Weak generate when model keys present; absorbWeak |
| `local` | `@cox/cx-local` or offline local | Disk-backed status/sim under `local/` | HTTP bind to Nexus when platform healthy; deterministic closed-id stubs |
| `aws` | `@cox/cx-aws` or offline AWS | Plan-only `template.yaml` + `APPLY.md` under `aws/` | Plan-only + model-assisted docs; **never** CreateStack |

```bash
pnpm cox cx plan billing-dispute --target all
pnpm cox cx build billing-dispute --target all
# or golden path:
pnpm cox cx run billing-dispute "reduce dispute handle time"
pnpm cox cx export-aws billing-dispute   # plan handoff (also under govern)
```

---

### 2.3 Operate (observe + propose + human close-out)

#### Observe (read-only health)

| Command | Purpose | Notes |
|---|---|---|
| `doctor [--live] [--mode] [--base-url] [--pack local]` | Wiring + ontology + stack | Live fail-closed if stack not ready |
| `status [name] [--target] [--live\|…]` | Phases + deployment health + summary score | Score: healthy=100, degraded=50, down/error=0; **appends** `health-history.jsonl` |
| `health-history <name> [--limit 20]` | Recent health score samples from status polls | Reads `.cox/cx/<name>/health-history.jsonl`; empty if never polled |
| `simulate <name> [--target local] [--live] [--base-url]` | Traffic simulation | Default target `local` |
| `report <name> [--target] [--live]` | Cross-target status (+ sim) + scout summary + graph NBA | |

#### Propose (no mutations)

| Command | Purpose | Notes |
|---|---|---|
| `console <name> [--target] [--live\|…]` | One tick: poll, route, NBA, propose, persist | Writes `proposals.json` only |
| `operate <name> [--target] [--live\|…]` | One-shot operate: console tick + board line | Prints open/claimed props, tasks, daemon; hints `claim` |
| `watch <name> [--ticks 3] [--interval 2000] [--live\|…]` | Bounded console loop | Persists proposals each tick |
| `daemon start <name> [--interval 30000] [--ticks 120] [--live] [--base-url]` | Detached watch | `daemon.pid` / `daemon.log` / `daemon.json` |
| `daemon status <name>` | Health line | `running\|stopped pid ticks last proposals_open log=` |
| `daemon stop <name>` | Stop daemon | |

#### Human close-out (gates)

| Command | Purpose | Notes |
|---|---|---|
| `proposals <name> [--all] [--status …]` | List proposals | Default open\|claimed; rows show `next=` + CLI hint |
| `proposal <name> <id> <status>` | Legal transition | `open` \| `claimed` \| `resolved` \| `dismissed` |
| `claim <name> <proposalId> [--resolve]` | **Alias for apply** (ops claim language) | Same as `apply`: task + remediation; default → **claimed** |
| `apply <name> <proposalId> [--resolve]` | Task + remediation note | Default proposal → **claimed**; `--resolve` → **resolved** |
| `tasks <name> [--all] [--status …]` | Task board rollup | Shows `proposal=` + `remediation=` paths |
| `task <name> <id> <status> [--no-resolve-source]` | Task transition | `done` auto-resolves source proposal unless `--no-resolve-source` |

```bash
pnpm cox cx status billing --live
pnpm cox cx health-history billing --limit 20
pnpm cox cx operate billing --live
# or step by step:
pnpm cox cx console billing --live
pnpm cox cx proposals billing
pnpm cox cx claim billing prop_…
# claim is alias for apply:
pnpm cox cx apply billing prop_…
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done
pnpm cox cx audit billing
# scripts:
pnpm cx:operate -- billing
pnpm cx:claim -- billing prop_…
pnpm cx:health-history -- billing
```

---

### 2.4 Govern (evidence + change board)

| Command | Purpose | Default output |
|---|---|---|
| `brief <name> [outFile]` | Executive markdown brief (no model) | stdout or path |
| `audit <name> [--limit 30]` | Append-only event trail | `audit.jsonl` under spec |
| `export-aws <name> [outDir]` | Plan-only AWS files only | `./cx-export/<name>-aws` |
| `cab-export <name> [outDir]` | Full CAB package | `./cx-cab/<name>/` |
| `snapshot <name> [outDir]` | Full program snapshot (CAB + `spec.json` + health history + optional daemon/audit) | `./cx-snapshot/<name>/` |

**CAB package contents** (`cab-export`):

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

**Snapshot package** (`snapshot`) = CAB base plus:

```text
spec.json
health-history.jsonl?   # when status has been polled
daemon.json?
audit.jsonl?
SNAPSHOT.md             # restore note (manual copy back under .cox/cx/<name>/)
```

**AWS human apply** (from `APPLY.md` or export):

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name cxos-<spec> \
  --capabilities CAPABILITY_IAM
```

Coxswain never runs this for you.

```bash
pnpm cox cx brief billing
pnpm cox cx audit billing --limit 50
pnpm cox cx export-aws billing ./exports/billing-aws
pnpm cox cx cab-export billing
pnpm cox cx snapshot billing
pnpm cox cx snapshot billing ./handoffs/billing-snap
# review cx-cab/billing/MANIFEST.md + aws/APPLY.md
# or
pnpm cx:snapshot -- billing
```

---

### 2.5 Fleet (multi-spec)

| Command | Purpose | Notes |
|---|---|---|
| `board` | Multi-spec ops board: phases, proposals, tasks, daemons | Fast rollup, no per-spec status poll |
| `fleet-status [--live] [--auto-live] [--base-url]` | Fleet board + **status poll** for each deployed spec | Writes health samples via `status`; empty fleet hints `cox cx init` |

```bash
pnpm cox cx board
pnpm cox cx fleet-status
pnpm cox cx fleet-status --live
# or
pnpm cx:board
pnpm cx:fleet
pnpm cx:fleet -- --live
```

---

### 2.6 Program archive / restore

Soft-archive renames the workspace dir; nothing is deleted.

| Command | Purpose | Effect |
|---|---|---|
| `archive <name>` | Soft-archive a CX program | `.cox/cx/<name>` → `.cox/cx/.archived-<name>` |
| `restore <name>` | Restore soft-archived program | reverse rename; fails if active name already exists |

```bash
pnpm cox cx archive billing
# workspace: .cox/cx/.archived-billing
pnpm cox cx restore billing
# or
pnpm cx:archive -- billing
```

---

### 2.7 Full command inventory (flat)

| Lifecycle | Commands |
|---|---|
| **Design** | `catalog` `ontology show` `ontology validate` `ontology graph` `nba` `journeys` `init` `new` `approve` `list` `archive` `restore` |
| **Build** | `plan` `build` `deploy` `run` `teardown` |
| **Operate** | `doctor` `status` `health-history` `simulate` `report` `console` `operate` `watch` `daemon start\|status\|stop` `proposals` `proposal` `claim` `apply` `tasks` `task` |
| **Govern** | `brief` `audit` `export-aws` `cab-export` `snapshot` |
| **Fleet** | `board` `fleet-status` |

Related monorepo scripts (root `package.json`; pass args after `--`):

| Script | Action |
|---|---|
| `pnpm cx:init` | Workspace + starter |
| `pnpm cx:board` | Fleet board |
| `pnpm cx:fleet` | Fleet status (board + status poll) |
| `pnpm cx:catalog` | Closed catalog browser |
| `pnpm cx:health-history -- <name>` | Health score history |
| `pnpm cx:archive -- <name>` | Soft-archive program |
| `pnpm cx:snapshot -- <name> [outDir]` | Full program snapshot |
| `pnpm cx:claim -- <name> <proposalId>` | Claim/apply proposal |
| `pnpm cx:operate -- <name>` | One-shot operate tick |
| `pnpm cx:doctor` | Health / wiring |
| `pnpm cx:run -- <name> "idea"` | Golden one-shot |
| `pnpm cx:journeys` | Journey catalog |
| `pnpm cx:golden` / `cx:golden:live` | Demo script |
| `pnpm cx:stack-up` | Ollama + Nexus platform |
| `./scripts/macos/install-launchagents.sh` | Always-on Ollama + Nexus |
| `./scripts/macos/uninstall-launchagents.sh` | Remove LaunchAgents |

---

## 3. End-to-end OS loops

### A. Stand up a program (design → build)

```bash
pnpm cx:init
pnpm cox cx run billing "reduce dispute handle time"
pnpm cox cx board
pnpm cox cx brief billing
```

### B. Day-2 operate

```bash
pnpm cox cx status billing --live
pnpm cox cx health-history billing
pnpm cox cx operate billing --live
pnpm cox cx claim billing prop_…
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done
pnpm cox cx audit billing
# scripts:
pnpm cx:operate -- billing
pnpm cx:claim -- billing prop_…
pnpm cx:health-history -- billing
```

### C. Fleet rollup

```bash
pnpm cox cx board
pnpm cox cx fleet-status --live
pnpm cx:fleet -- --live
```

### D. Change board / AWS handoff (govern)

```bash
pnpm cox cx cab-export billing
pnpm cox cx snapshot billing
# review cx-cab/billing/MANIFEST.md + aws/APPLY.md
# human: aws cloudformation deploy …
pnpm cx:snapshot -- billing
```

### E. Archive retired program

```bash
pnpm cox cx archive old-pilot
# later:
pnpm cox cx restore old-pilot
pnpm cx:archive -- old-pilot
```

### F. Offline proof (CI / workshop)

```bash
pnpm cx:golden
OPENAI_API_KEY= XAI_API_KEY= ANTHROPIC_API_KEY= pnpm --filter @cox/cx-ops test
```

### G. Live local stack

```bash
./scripts/cx-stack-up.sh
pnpm cox cx doctor --live
pnpm cox cx build billing --live --target local,artifacts
pnpm cox cx simulate billing --target local --live
```

---

## 4. Human gates (mutation control)

CXOS treats mutation as a **human-owned** step. The system proposes and
records; operators execute remediations outside auto-mutation of adapters or
cloud.

### 4.1 Spec phase gates (design / build)

| Phase | Values | Gate |
|---|---|---|
| `requirements` | draft → approved | Must approve before build |
| `design` | missing/draft → approved | After requirements; may auto-approve after artifacts journey maps |
| `tasks` | missing/draft → approved | After design |

Approve order is enforced by `approveCxPhase`. Illegal: design before
requirements, tasks before design.

### 4.2 Proposal legal graph (operate)

Console / watch / daemon only **persist** proposals. Statuses and edges:

```text
open      → claimed | dismissed | resolved
claimed   → resolved | dismissed | open   # open = release claim
dismissed → open                          # reopen
resolved  → (terminal)

Same status is always idempotent.
```

| From | To |
|---|---|
| `open` | `claimed`, `dismissed`, `resolved` |
| `claimed` | `resolved`, `dismissed`, `open` |
| `dismissed` | `open` |
| `resolved` | terminal only |

`suggestedProposalNext`: open → apply; claimed → resolve; dismissed → reopen;
resolved → none.

### 4.3 Apply and task close-out

| Step | Command | Effect |
|---|---|---|
| List | `proposals <spec>` | Open + claimed; `next=` + concrete CLI line |
| Claim | `claim <spec> <prop_…>` | **Alias for apply** (ops language) |
| Apply | `apply <spec> <prop_…>` | Task + `remediations/<id>.md`; proposal → **claimed** |
| Apply+close | `apply` / `claim` with `--resolve` | Same, proposal → **resolved** |
| One-shot tick | `operate <spec>` | Console tick + board line; no mutations beyond proposals |
| Work board | `tasks <spec>` | Rollup; rows show `proposal=` + `remediation=` |
| Close task | `task <spec> <taskId> done` | Default **auto-resolves** source proposal; `--no-resolve-source` skips |

**Task statuses:** `pending` | `in_progress` | `done` | `cancelled`.

**What apply never does:** mutate local platform config, call AWS APIs, or
change adapter deployments. Remediation markdown is the operator runbook.

### 4.4 AWS / change board gate (govern)

| Surface | Allowed | Forbidden |
|---|---|---|
| Offline / plan-only AWS adapter | Write `template.yaml`, `APPLY.md`, optional docs | CreateStack, UpdateStack, live Connect/Lex API |
| `export-aws` | Copy plan files to outDir | Any cloud call |
| `cab-export` | Filesystem package for CAB | Any cloud call |
| Human | `aws cloudformation deploy …` with scoped creds | (Coxswain never does this) |

### 4.5 Gate summary matrix

| Action | Who | Artifact |
|---|---|---|
| Approve requirements/design/tasks | Human (PM / SA) | `spec.json` phases |
| Propose remediation | System (`console` / `operate` / `watch` / `daemon`) | `proposals.json` |
| Claim / apply proposal | Human (Ops) via `claim` or `apply` | `tasks.json` + `remediations/*.md` |
| Execute remediation on platform/AWS | Human outside Coxswain | Platform config / CFN deploy |
| Mark task done | Human | task status; proposal auto-resolve |
| Ship AWS stack | Human + scoped AWS | CloudFormation |
| Soft-archive / restore program | Human | `.cox/cx/.archived-<name>` rename |
| Snapshot / CAB package | Human | `cx-snapshot/` or `cx-cab/` filesystem export |

---

## 5. Offline / live / hybrid

Runtime modes (`@cox/cli` `CxRuntimeMode` via `createCxRuntime`):

| Mode | When | Behavior |
|---|---|---|
| **offline** | Default without `--live` / models | Offline adapters for all targets under `.cox/cx/` |
| **live** | `--live` or `--mode live` with platform/models | Prefer real adapters when healthy / keys present |
| **hybrid** | `--live` with tier models, or `--mode hybrid`, or `--auto-live` / `CX_AUTO_LIVE=1` | Live where ready; offline fallback elsewhere |

### Wiring rules (composition root)

1. **artifacts**: live only if weak generate available (Anthropic tier model or OpenAI-compat); else offline adapter.
2. **local**: live when platform probe succeeds (`/api/journeys/definitions` preferred). Bind uses **deterministic** closed-id stubs (stable journey/KPI JSON), not freeform model output.
3. **aws**: "live" means plan-only adapter with model-assisted docs when generate is available; still writes applyable CFN, no CreateStack.

`cox cx doctor` prints `runtime mode=…`, per-target `wiring=live|offline`,
Ollama + platform health, ontology ok, and known specs.

### Stack for healthy live local

```bash
./scripts/cx-stack-up.sh
pnpm cox cx doctor --live
```

`scripts/cx-stack-up.sh`: starts Ollama if needed, pulls `nomic-embed-text`
(required for platform ready), optional `nemotron-mini`, starts Nexus
platform (`CX_PLATFORM_DIR`, default `~/Projects/cx-platform/omnichannel-cx-platform`),
checks `GET /api/health/ready` → HTTP 200.

### Env and config

| Variable / config | Default |
|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `CX_LOCAL_BASE_URL` | `http://127.0.0.1:3143` |
| `CX_PLATFORM_DIR` | `$HOME/Projects/cx-platform/omnichannel-cx-platform` |
| `CX_AUTO_LIVE` | unset (set `1` for hybrid without `--live`) |
| `cox.config.json` `cx` | local `baseUrl`, `defaultOpsMode`, `watcherPollIntervalMs`, `budgets.cxOpsUsd` |

### macOS LaunchAgents (always-on fabric)

| Item | Detail |
|---|---|
| Labels | `com.chendren.ollama`, `com.chendren.nexus-cx` |
| Install | `./scripts/macos/install-launchagents.sh` |
| Uninstall | `./scripts/macos/uninstall-launchagents.sh` |
| Logs | `~/Library/Logs/coxswain/` |

Still pull models once via `cx-stack-up.sh` or `ollama pull` before expecting
ready 200.

### Offline guarantees

- Full golden path without API keys: `pnpm cx:golden`.
- `cx-ops` tests with keys cleared: deterministic offline adapters.
- Doctor without `--live` never requires platform or models.

---

## 6. Package map

### 6.1 CXOS packages (product)

| Package | OS role | Key modules |
|---|---|---|
| `@cox/cx-core` | Contracts, ontology, target adapter interface, mock adapter, events | `spec`, `target`, `artifacts`, `adapter`, `ontology/*`, `operate`, `build` |
| `@cox/cx-artifacts` | Neutral document factory (journey maps, personas, intents, NBA, KPI, architecture) | plan / build / deploy disk under `artifacts/` |
| `@cox/cx-local` | Live HTTP omnichannel / Nexus adapter | bind, deploy, status, simulate traffic, KPI match |
| `@cox/cx-aws` | AWS plan-only (Connect / Lex / Bedrock planning) | template + agent/architecture docs; no CreateStack |
| `@cox/cx-ops` | Workspace, orchestrate, console, proposals, tasks, daemon, board, brief, cab, audit, catalog, health-history, archive, snapshot, CFN skeleton, offline adapters | see module table below |
| `@cox/cli` | Composition root: `cox cx` + `createCxRuntime` / offline wiring | `commands/cx.ts`, `cx/runtime.ts` |

### 6.2 cx-ops modules (operate engine)

| Module | Role |
|---|---|
| `workspace` | `.cox/cx/<spec>/` layout, phases, deployments, target parse (artifacts first) |
| `orchestrate` | Multi-target build/status/sim/report |
| `console` | One tick: poll → route → NBA → propose (no mutations) |
| `proposals` | Persist + legal transitions + suggested next |
| `tasks` | apply → task + remediation; rollup; done auto-resolves proposal |
| `watch` / `daemon` | Bounded and detached watch loops |
| `stack-health` | Ollama + platform probes for doctor |
| `metrics-summary` | Health score rollup |
| `path-audit` | Collapse/group control `path[]` |
| `board` | Multi-spec fleet rollup |
| `brief` | Executive markdown (no model) |
| `cab-export` | CAB filesystem package |
| `snapshot` | Full program snapshot (CAB + spec + health history) |
| `archive` | Soft-archive / restore (rename under `.archived-`) |
| `catalog` | Closed catalog inventory (domains, intents, KPIs, NBA, channels) |
| `health-history` | Append/load `health-history.jsonl` samples |
| `audit` | Append-only `audit.jsonl` |
| `journeys` | Closed-world journey list |
| `cfn-skeleton` | Deterministic CFN YAML + APPLY.md |
| `offline-adapters` / `offline-artifacts` | Disk-backed offline target adapters |
| `ontology` / `nba` | Pack resolve, show/validate/graph, pure recommend |
| `status` / `report` | Adapter passthrough + cross-target report |

### 6.3 Coxswain base packages (platform under CXOS)

CXOS reuses the coding-agent fabric; model spend routes through the same
router and ledger.

| Package | Role relative to CXOS |
|---|---|
| `@cox/core` | Frozen types, config, events, pricing (never edit casually) |
| `@cox/providers` | Anthropic + OpenAI-compat + mock models |
| `@cox/router` | Tier classify / escalate / governor |
| `@cox/ledger` | Cost JSONL + budgets |
| `@cox/agent` | Tool loop, permissions, escalation |
| `@cox/tools` | Host tools allowlist |
| `@cox/spec` | Spec engine (coding specs; CX reuses phase patterns via cx-ops workspace) |
| `@cox/steering` | Project steering docs |
| `@cox/hooks` | Lifecycle hooks |
| `@cox/tui` | Ink TUI (event stream; CX emits into same bus family) |

### 6.4 Dependency / import law

```text
@cox/cli  (composition root)
  ├── wires live/offline adapters
  └── imports cx-core, cx-ops, cx-artifacts, cx-local, cx-aws, core, tui, …

@cox/cx-ops     → @cox/core, @cox/cx-core only
@cox/cx-artifacts → @cox/core, @cox/cx-core only
@cox/cx-local   → @cox/core, @cox/cx-core only
@cox/cx-aws     → @cox/core, @cox/cx-core only
@cox/cx-core    → @cox/core only

Adapters never import each other or cx-ops.
```

### 6.5 CLI → package entry mapping

| CLI | Primary package entry |
|---|---|
| `new` / `approve` / `list` / `init` | `cx-ops` workspace |
| `plan` / `build` / `deploy` / `status` / `simulate` / `report` / `run` / `teardown` | `cx-ops` orchestrate (+ adapters); status appends health-history |
| `console` / `operate` / `watch` / `daemon *` | `cx-ops` console, watch, daemon; operate = console + board line |
| `proposals` / `proposal` / `claim` / `apply` / `tasks` / `task` | `cx-ops` proposals, tasks; claim → apply |
| `catalog` / `ontology *` / `nba` / `journeys` | `cx-ops` catalog, ontology, nba, journeys (+ `cx-core` catalogs) |
| `doctor` | `cx-ops` stack-health + ontology + workspace list |
| `board` / `fleet-status` | `cx-ops` board; fleet-status = board + status each deployed |
| `brief` / `cab-export` / `snapshot` / `audit` | `cx-ops` brief, cab-export, snapshot, audit |
| `archive` / `restore` | `cx-ops` archive (soft rename) |
| `health-history` | `cx-ops` health-history load |
| `export-aws` | CLI copy of plan-only aws/ files |

---

## 7. Workspace layout

Root: `{cwd}/.cox/cx/` (`defaultCxRoot`). Per-spec:

```text
.cox/cx/<spec>/
  spec.json              # CxWorkspaceRecord: idea, path audit, CxSpec (phases, design)
  deployments.json       # Partial Record<targetId, CxDeployment>
  proposals.json         # console/watch proposals (human-gated)
  tasks.json             # tasks from applyProposal
  audit.jsonl            # OS audit trail (append-only)
  health-history.jsonl   # status poll samples (score, healthy/degraded/down counts)
  remediations/          # <proposalId>.md operator notes
  artifacts/             # artifacts adapter disk
  local/                 # local adapter disk
  aws/                   # AWS plan-only outputs
    template.yaml        # CloudFormation skeleton (human-applyable)
    APPLY.md             # aws cloudformation deploy hint
    architectureDoc.json
    agentDefinition.json
  daemon.pid             # watch daemon (when started)
  daemon.log
  daemon.json            # DaemonMeta (ticks, lastTickAt, …)

.cox/cx/.archived-<spec>/   # soft-archived via `cox cx archive` (restore renames back)
```

CAB export (`cx-cab/<spec>/` by default):

```text
MANIFEST.md BRIEF.md proposals.json tasks.json deployments.json
aws/ remediations/ audit.jsonl?
```

Snapshot export (`cx-snapshot/<spec>/` by default): CAB contents plus `spec.json`,
optional `health-history.jsonl` / `daemon.json` / `audit.jsonl`, and `SNAPSHOT.md`.

AWS export (`cx-export/<spec>-aws` by default): plan-only files only.

---

## 8. Control paths (path audit)

Typical `path: string[]` returned or recorded:

| Surface | Path sketch |
|---|---|
| **build** | `load_workspace → route_targets → plan:artifacts → build:artifacts → merge_design → plan:local → … → emit` |
| **console / operate** | `load_strong → poll_status → target:local → health:… → route:… → recommend_nba → propose_gated → emit` (+ board line for operate) |
| **catalog** | `load_strong → inventory_catalog → emit` |
| **nba** | `load_strong → match_rules → confidence_band? → next_stages? → emit` |
| **stack / doctor** | `probe_ollama → probe_platform → emit` |
| **daemon** | `daemon_start → [watch ticks] → daemon_stop` |
| **fleet-status** | `fleet_board → status_each → emit` |
| **health-history** | `load_health_history → emit` |
| **archive / restore** | `archive_spec → rename → emit` / `restore_spec → rename → emit` |
| **snapshot** | `snapshot → cab_base → copy_spec → copy_health → emit` |
| **cab-export** | `load_workspace → copy_aws → copy_remediations → write_state → write_brief → emit` |
| **runtime wire** | `load_config → weak_generate:… → probe_platform → route:artifacts|local|aws → wire:…` |

Path audits make strong/weak routing and gate points inspectable without
replaying models.

---

## 9. Personas (link)

Personas are jobs-to-be-done, not org titles. Full playbooks, archetypes,
value spine, and multi-role scenarios:

**→ [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md)**

Quick map of persona → home surface:

| ID | Persona | Home commands |
|---|---|---|
| P1 | CX Product Manager | `new` `approve` `run` `report` `nba` `brief` `catalog` |
| P2 | Contact Center / CX SA | `plan` `build` `export-aws` `ontology` `cab-export` `snapshot` |
| P3 | GenAI / Graph Engineer | `ontology *` `catalog`, path audits, offline tests |
| P4 | Journey Owner / Ops Lead | `status` `health-history` `operate` `watch` `daemon` `claim` `tasks` |
| P5 | NOC / Platform SRE | `doctor` `fleet-status` `cx:stack-up` LaunchAgents |
| P6 | Change / Security / Compliance | `audit` `cab-export` `snapshot` APPLY.md, proposal history |
| P7 | AWS PS / Partner | `cx:golden` multi-cwd `run` |
| P8 | Workshop Facilitator | demo README, `catalog`, ontology, golden |
| P9 | QA / Release | vitest e2e, `doctor --live` |
| P10 | CX Executive / Sponsor | `status` score, `tasks` rollup, `brief`, `board` `fleet-status` |
| P11 | CS / Retention | `nba` churn contexts, `operate` |
| P12 | LOB Analyst | `catalog` `ontology show` `validate` `journeys` |

Demo tracks by persona: [`examples/cx-demo/README.md`](../examples/cx-demo/README.md).

---

## 10. Completeness checklist

| Capability | Status |
|---|---|
| Closed ontology + NBA | yes |
| Closed catalog browser (`catalog`) | yes |
| Spec phases + multi-target build | yes |
| Soft-archive / restore | yes |
| Offline + hybrid + live local | yes |
| Plan-only AWS + export | yes |
| Human-gated proposals / tasks | yes |
| Claim alias (`claim` → `apply`) | yes |
| One-shot operate (`operate`) | yes |
| Legal proposal transition graph | yes |
| Metrics score + path audit | yes |
| Health history samples | yes |
| Daemon operate | yes |
| Multi-spec board | yes |
| Fleet status poll | yes |
| Executive brief | yes |
| CAB package | yes |
| Full program snapshot | yes |
| Audit log | yes |
| Journey inventory | yes |
| Workspace init | yes |
| LaunchAgents / stack-up | yes |
| Root scripts (`cx:catalog` `cx:fleet` `cx:health-history` `cx:archive` `cx:snapshot` `cx:claim` `cx:operate`) | yes |
| Persona playbooks | yes ([`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md)) |
| CreateStack from Coxswain | **never** (by design) |

---

## 11. Related design history

| Doc | Topic |
|---|---|
| `docs/superpowers/specs/2026-07-22-cxos-design.md` | Original CXOS design |
| `docs/superpowers/specs/2026-07-24-cx-ops-design.md` | Ops layer |
| `docs/superpowers/specs/2026-08-03-cxos-ontology-design.md` | Ontology / strong graph |
| `docs/WAVE2-SUMMARY.md` … `WAVE4-SUMMARY.md` | Implementation waves |
| `docs/01-ARCHITECTURE.md` | Coxswain base architecture |
| `INTEGRATION-NOTES.md` | Cross-package contract notes |

---

## 12. One-page mental model

```text
                    ┌──────────── Catalog ────────────┐
                    │ catalog · ontology · journeys · nba │
                    └───────────────┬─────────────────┘
                                    │ grounds
          ┌─────────────────────────▼─────────────────────────┐
          │              Program (design + build)               │
          │  init → new → approve → plan → build → run          │
          │  archive / restore · targets: artifacts→local→aws   │
          └─────────────────────────┬─────────────────────────┘
                                    │ deploys records
     ┌──────────────────────────────┼──────────────────────────────┐
     │                              │                              │
     ▼                              ▼                              ▼
 Observe                      Operate                         Govern
 status·health-history        console·operate·watch·daemon    brief·audit
 sim·report·doctor            proposals → claim/apply → tasks cab-export
                              (human gates only)              snapshot
                                    │                         export-aws
                                    ▼
                                 Fleet
                              board · fleet-status
                                    │
                                    ▼
                                 Fabric
                          stack-up · LaunchAgents · offline|hybrid|live
```

**Closed loop:** design once under a closed catalog → build three targets →
observe health (status + health-history) → propose gated remediations
(console / operate) → humans claim/apply and close tasks → export evidence
(cab-export / snapshot) for change boards. Soft-archive retires programs
without delete. No silent prod write anywhere on the loop.
