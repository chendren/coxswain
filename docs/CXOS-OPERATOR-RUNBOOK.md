# CXOS Operator Runbook

Day-1 bootstrap and day-2 operate procedures for **PM**, **SA**, **Ops Lead**,
**SRE**, and **Compliance**. Commands match `packages/cli/src/main.ts`
(`cox cx …`). Prefer project cwd for real work.

| Related doc | Role |
|---|---|
| [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md) | Full OS map, layers, gates, inventory |
| [`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md) | Persona jobs and value spine |
| [`CXOS.md`](./CXOS.md) | Technical north star |

**Invocation:** from monorepo root, `pnpm cox cx …` or `pnpm cox --cwd <dir> cx …`.
Root scripts mirror common surfaces: `pnpm cx:init`, `cx:board`, `cx:fleet`,
`cx:queue`, `cx:dashboard`, `cx:graph-find`, `cx:operate`, `cx:claim`,
`cx:snapshot`, `cx:doctor`, `cx:stack-up`.

**Hard rules (never skip):**

1. Console / watch / daemon **propose only**. No silent prod mutation.
2. AWS is **plan-only**. Humans apply CFN. Coxswain never CreateStack.
3. Offline-first. Live only when stack (and optional keys) are ready.
4. Remediation markdown is the operator runbook; execute work outside Coxswain.

---

## 0. Shared day-0 checklist (all roles)

Run once per machine / engagement workspace.

```bash
# From coxswain monorepo root
pnpm install

# Workspace under your engagement directory
pnpm cox --cwd ~/cx/acme cx init

# Closed catalog + strong graph health
pnpm cox --cwd ~/cx/acme cx ontology validate --pack local
pnpm cox --cwd ~/cx/acme cx catalog --pack local
pnpm cox --cwd ~/cx/acme cx journeys --pack local
pnpm cox --cwd ~/cx/acme cx doctor

# Optional live local fabric (SRE owns stack; others consume)
pnpm cx:stack-up
# or: ./scripts/cx-stack-up.sh
pnpm cox --cwd ~/cx/acme cx doctor --live
```

**Pass criteria:** `ontology validate` exit 0; `doctor` reports ontology ok;
with `--live`, platform ready or fail-closed (exit 1 if stack down by design).

Common flags used below:

| Flag | Meaning |
|---|---|
| `--target <list>` | `artifacts`, `local`, `aws`, comma list, or `all` |
| `--live` | Prefer live models/platform |
| `--auto-live` | Hybrid without `--live` (or `CX_AUTO_LIVE=1`) |
| `--mode offline\|live\|hybrid` | Explicit runtime mode |
| `--base-url <url>` | Local platform base URL |
| `--pack default\|local` | Ontology pack |

---

## 1. Day-1 bootstrap

Stand up a program, multi-target build, and first operate readiness. Role
sections list who leads each step; everyone can run read-only commands.

### 1.1 Product Manager (PM)

**Owns:** idea capture, phase gates, KPI language, go/no-go on design spend.

```bash
# Create program (or use golden one-shot later)
pnpm cox --cwd ~/cx/acme cx new billing-dispute "reduce dispute handle time"

# Ground language in closed world before approving
pnpm cox --cwd ~/cx/acme cx catalog domains --pack local
pnpm cox --cwd ~/cx/acme cx graph-find billing --pack local
pnpm cox --cwd ~/cx/acme cx nba journey=billing_dispute stage=intake confidence=0.9 --pack local

# Gate: requirements before design/build
pnpm cox --cwd ~/cx/acme cx approve billing-dispute requirements

# After SA has built, review status and executive brief
pnpm cox --cwd ~/cx/acme cx list
pnpm cox --cwd ~/cx/acme cx status billing-dispute
pnpm cox --cwd ~/cx/acme cx report billing-dispute
pnpm cox --cwd ~/cx/acme cx brief billing-dispute
```

**Golden path alternative** (create if needed → approve requirements → build all
→ status → simulate local → report + NBA):

```bash
pnpm cox --cwd ~/cx/acme cx run billing-dispute "reduce dispute handle time"
# or: pnpm cx:run -- billing-dispute "reduce dispute handle time"
```

**Day-1 done when:** requirements approved; report/brief readable; journey ids
match catalog (`graph-find` / `nba`).

---

### 1.2 Solutions Architect (SA)

**Owns:** multi-target plan/build, artifacts quality, plan-only AWS handoff.

```bash
# After PM approved requirements
pnpm cox --cwd ~/cx/acme cx plan billing-dispute --target all
pnpm cox --cwd ~/cx/acme cx build billing-dispute --target all --pack local

# Optional: live local after SRE green-lights stack
pnpm cox --cwd ~/cx/acme cx build billing-dispute --live --target local,artifacts --pack local
pnpm cox --cwd ~/cx/acme cx simulate billing-dispute --target local --live

# Approve design if not auto-approved by artifacts journey maps
pnpm cox --cwd ~/cx/acme cx approve billing-dispute design

# AWS plan package for change board (not a deploy)
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute
# default outDir: ./cx-export/billing-dispute-aws
# review template.yaml + APPLY.md

# Full CAB package for formal review
pnpm cox --cwd ~/cx/acme cx cab-export billing-dispute
# default outDir: ./cx-cab/billing-dispute/

# Point-in-time program snapshot (CAB + spec + health history)
pnpm cox --cwd ~/cx/acme cx snapshot billing-dispute
# or: pnpm cx:snapshot -- billing-dispute
```

**Day-1 done when:** artifacts + local (and aws plan) present under
`.cox/cx/billing-dispute/`; `export-aws` / `cab-export` reviewed with Compliance;
no CFN applied by Coxswain.

---

### 1.3 Ops Lead (Journey Owner)

**Owns:** operate readiness, first console tick, proposal hygiene.

```bash
# Confirm deployments and score
pnpm cox --cwd ~/cx/acme cx status billing-dispute
pnpm cox --cwd ~/cx/acme cx health-history billing-dispute --limit 20

# Fleet surfaces (multi-spec; fine with one program)
pnpm cox --cwd ~/cx/acme cx board
pnpm cox --cwd ~/cx/acme cx fleet-status
pnpm cox --cwd ~/cx/acme cx queue
pnpm cox --cwd ~/cx/acme cx dashboard
# default HTML: cxos-dashboard.html
# or: pnpm cx:board / cx:fleet / cx:queue / cx:dashboard

# First gated propose (writes proposals only)
pnpm cox --cwd ~/cx/acme cx operate billing-dispute
# or step: console then list
pnpm cox --cwd ~/cx/acme cx console billing-dispute
pnpm cox --cwd ~/cx/acme cx proposals billing-dispute

# Do not claim day-1 noise unless real work; dismiss if needed
# pnpm cox --cwd ~/cx/acme cx proposal billing-dispute prop_… dismissed
```

**Day-1 done when:** `board` / `queue` show the program; `operate` or `console`
completes without mutation beyond `proposals.json`; team knows claim path for day-2.

---

### 1.4 SRE (NOC / Platform)

**Owns:** laptop/lab fabric, doctor gate, daemon hygiene, live fail-closed.

```bash
# Local stack (Ollama embed + Nexus platform)
./scripts/cx-stack-up.sh
# or: pnpm cx:stack-up

# Optional always-on (macOS)
# ./scripts/macos/install-launchagents.sh

pnpm cox --cwd ~/cx/acme cx doctor --live
# exit 1 if stack not ready under live/hybrid - by design

# Wiring check without live force
pnpm cox --cwd ~/cx/acme cx doctor --mode offline
pnpm cox --cwd ~/cx/acme cx doctor --auto-live

# Fleet health poll once programs exist
pnpm cox --cwd ~/cx/acme cx fleet-status --live
# or: pnpm cx:fleet -- --live

# Daemon only after Ops agrees on a program to watch
pnpm cox --cwd ~/cx/acme cx daemon start billing-dispute --interval 30000 --ticks 120 --live
pnpm cox --cwd ~/cx/acme cx daemon status billing-dispute
# running|stopped pid ticks last proposals_open log=
# stop when not needed:
# pnpm cox --cwd ~/cx/acme cx daemon stop billing-dispute
```

**Day-1 done when:** `doctor --live` green for demos/workshops that need live;
offline doctor green for CI/air-gap; daemons documented (who started, interval).

---

### 1.5 Compliance (Change / Security)

**Owns:** gate evidence, plan-only AWS proof, audit trail, CAB package quality.

```bash
# Catalog integrity (closed world)
pnpm cox --cwd ~/cx/acme cx ontology validate --pack local
pnpm cox --cwd ~/cx/acme cx ontology graph --pack local

# Change package review
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute ./exports/billing-dispute-aws
pnpm cox --cwd ~/cx/acme cx cab-export billing-dispute ./handoffs/billing-cab
pnpm cox --cwd ~/cx/acme cx snapshot billing-dispute ./handoffs/billing-snap
pnpm cox --cwd ~/cx/acme cx brief billing-dispute
pnpm cox --cwd ~/cx/acme cx audit billing-dispute --limit 50

# Confirm apply surfaces create tasks/notes only (after a dry claim in lab)
# claim = alias for apply; never mutates cloud from Coxswain
```

**Review package checklist:**

```text
export-aws / cab-export aws/
  template.yaml      # AWSTemplateFormatVersion present
  APPLY.md           # human deploy command only
  architectureDoc.json?  # when present

cab-export /
  MANIFEST.md BRIEF.md proposals.json tasks.json deployments.json
  remediations/ audit.jsonl?

snapshot /  (+ CAB base)
  spec.json health-history.jsonl? daemon.json? SNAPSHOT.md
```

**Human AWS apply (outside Coxswain, scoped creds only):**

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name cxos-billing-dispute \
  --capabilities CAPABILITY_IAM
```

**Day-1 done when:** CAB/snapshot reviewed; no CreateStack from tooling; proposal
legal graph understood (`open` → `claimed` → `resolved` / `dismissed`).

---

## 2. Day-2 operate

Steady-state: observe → propose → human claim → remediate outside → close task.

### 2.1 Daily rhythm (shared)

| When | Who | Commands |
|---|---|---|
| Start of shift | Ops Lead / SRE | `fleet-status`, `queue`, `board`, `dashboard` |
| Per program pulse | Ops Lead | `status`, `health-history`, `operate` or `console` |
| Work intake | Ops Lead | `proposals`, `claim` / `apply`, `tasks` |
| Remediation | Ops / SA / cloud | Outside Coxswain (platform, CFN, runbooks) |
| Close-out | Ops Lead | `task … done`, `audit` |
| Governance | Compliance / PM | `brief`, `cab-export`, `snapshot`, `audit` |
| Catalog questions | PM / SA | `graph-find`, `catalog`, `nba` |

```bash
# Fleet morning sweep
pnpm cox --cwd ~/cx/acme cx board
pnpm cox --cwd ~/cx/acme cx fleet-status --live
pnpm cox --cwd ~/cx/acme cx queue
pnpm cox --cwd ~/cx/acme cx dashboard ./ops/cxos-dashboard.html
```

---

### 2.2 Product Manager (day-2)

**Focus:** outcome language, proposal business validity, sponsor brief.

```bash
pnpm cox --cwd ~/cx/acme cx status billing-dispute
pnpm cox --cwd ~/cx/acme cx report billing-dispute
pnpm cox --cwd ~/cx/acme cx brief billing-dispute
pnpm cox --cwd ~/cx/acme cx tasks billing-dispute --all
pnpm cox --cwd ~/cx/acme cx queue

# Policy check against closed NBA / catalog
pnpm cox --cwd ~/cx/acme cx nba journey=billing_dispute stage=intake confidence=0.9
pnpm cox --cwd ~/cx/acme cx graph-find dispute --pack local
pnpm cox --cwd ~/cx/acme cx catalog nba --pack local
```

**Decisions:** approve further phase work; dismiss business-invalid proposals
(via Ops `proposal … dismissed`); request CAB when AWS plan changes.

---

### 2.3 Solutions Architect (day-2)

**Focus:** design drift, rebuild targets, export refresh after design change.

```bash
pnpm cox --cwd ~/cx/acme cx status billing-dispute --target all
pnpm cox --cwd ~/cx/acme cx plan billing-dispute --target all

# Rebuild when design or ontology pack changes
pnpm cox --cwd ~/cx/acme cx build billing-dispute --target artifacts,local --pack local
pnpm cox --cwd ~/cx/acme cx simulate billing-dispute --target local

# Refresh plan packages for change board
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute
pnpm cox --cwd ~/cx/acme cx cab-export billing-dispute
pnpm cox --cwd ~/cx/acme cx snapshot billing-dispute

# Ontology grounding for new intents/journeys
pnpm cox --cwd ~/cx/acme cx ontology show --pack local
pnpm cox --cwd ~/cx/acme cx graph-find billing --pack local
```

**Teardown** only when retiring a target intentionally:

```bash
pnpm cox --cwd ~/cx/acme cx teardown billing-dispute --target local
```

Soft-archive retired programs (nothing deleted):

```bash
pnpm cox --cwd ~/cx/acme cx archive old-pilot
pnpm cox --cwd ~/cx/acme cx restore old-pilot
```

---

### 2.4 Ops Lead (day-2): primary operate loop

**Focus:** health score → proposal → claim → task → done.

```bash
# 1. Observe
pnpm cox --cwd ~/cx/acme cx status billing-dispute --live
pnpm cox --cwd ~/cx/acme cx health-history billing-dispute --limit 20

# 2. Propose (no mutations beyond proposals.json)
pnpm cox --cwd ~/cx/acme cx operate billing-dispute --live
# or:
pnpm cox --cwd ~/cx/acme cx console billing-dispute --live
# bounded loop:
pnpm cox --cwd ~/cx/acme cx watch billing-dispute --ticks 3 --interval 2000 --live

# 3. Queue / fleet context
pnpm cox --cwd ~/cx/acme cx proposals billing-dispute
pnpm cox --cwd ~/cx/acme cx proposals billing-dispute --all
pnpm cox --cwd ~/cx/acme cx queue
pnpm cox --cwd ~/cx/acme cx board

# 4. Claim work (alias for apply): task + remediations/<id>.md; proposal → claimed
pnpm cox --cwd ~/cx/acme cx claim billing-dispute prop_EXAMPLE
# equivalent:
# pnpm cox --cwd ~/cx/acme cx apply billing-dispute prop_EXAMPLE
# claim+close proposal in one step:
# pnpm cox --cwd ~/cx/acme cx claim billing-dispute prop_EXAMPLE --resolve

# 5. Execute remediation markdown outside Coxswain (platform console, runbooks)

# 6. Task board
pnpm cox --cwd ~/cx/acme cx tasks billing-dispute
pnpm cox --cwd ~/cx/acme cx task billing-dispute task_EXAMPLE in_progress
pnpm cox --cwd ~/cx/acme cx task billing-dispute task_EXAMPLE done
# done auto-resolves source proposal unless:
# pnpm cox --cwd ~/cx/acme cx task billing-dispute task_EXAMPLE done --no-resolve-source

# Manual proposal transitions when needed
# pnpm cox --cwd ~/cx/acme cx proposal billing-dispute prop_EXAMPLE dismissed
# pnpm cox --cwd ~/cx/acme cx proposal billing-dispute prop_EXAMPLE open

# 7. Evidence
pnpm cox --cwd ~/cx/acme cx audit billing-dispute --limit 30
```

**Proposal legal graph:**

```text
open      → claimed | dismissed | resolved
claimed   → resolved | dismissed | open   # open = release claim
dismissed → open
resolved  → terminal
```

**Daemon mode** (follow-the-sun; SRE may host process):

```bash
pnpm cox --cwd ~/cx/acme cx daemon start billing-dispute --live --interval 30000 --ticks 120
pnpm cox --cwd ~/cx/acme cx daemon status billing-dispute
pnpm cox --cwd ~/cx/acme cx daemon stop billing-dispute
```

**HTML dashboard** for standups:

```bash
pnpm cox --cwd ~/cx/acme cx dashboard
# open cxos-dashboard.html in a browser
```

---

### 2.5 SRE (day-2)

**Focus:** fabric green, live fail-closed, daemon/process health, fleet poll.

```bash
pnpm cox --cwd ~/cx/acme cx doctor --live
pnpm cox --cwd ~/cx/acme cx fleet-status --live
pnpm cox --cwd ~/cx/acme cx board
pnpm cox --cwd ~/cx/acme cx queue

# Per-program daemon
pnpm cox --cwd ~/cx/acme cx daemon status billing-dispute
# restart if needed
pnpm cox --cwd ~/cx/acme cx daemon stop billing-dispute
pnpm cox --cwd ~/cx/acme cx daemon start billing-dispute --live --interval 30000 --ticks 120

# Stack recovery
./scripts/cx-stack-up.sh
pnpm cox --cwd ~/cx/acme cx doctor --live

# If live is broken mid-demo, force offline operate for workshop continuity
pnpm cox --cwd ~/cx/acme cx operate billing-dispute --mode offline
```

**Escalation:** doctor live fail-closed is expected when platform is down; fix
stack before claiming "live" green to stakeholders.

---

### 2.6 Compliance (day-2)

**Focus:** continuous evidence, change packages, no silent mutation.

```bash
# Trail for a program
pnpm cox --cwd ~/cx/acme cx audit billing-dispute --limit 50
pnpm cox --cwd ~/cx/acme cx proposals billing-dispute --all
pnpm cox --cwd ~/cx/acme cx tasks billing-dispute --all
pnpm cox --cwd ~/cx/acme cx health-history billing-dispute --limit 50

# Periodic CAB / snapshot for records
pnpm cox --cwd ~/cx/acme cx cab-export billing-dispute
pnpm cox --cwd ~/cx/acme cx snapshot billing-dispute
pnpm cox --cwd ~/cx/acme cx brief billing-dispute
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute

# Fleet-level work visibility (who has open claims)
pnpm cox --cwd ~/cx/acme cx queue
pnpm cox --cwd ~/cx/acme cx board
pnpm cox --cwd ~/cx/acme cx dashboard
```

**Audit questions to answer from artifacts:**

1. Did any command CreateStack or mutate cloud? (No: only `APPLY.md` for humans.)
2. Was every remediation claimed by a human (`claim` / `apply` → task + note)?
3. Is `proposals.json` / `tasks.json` consistent with `audit.jsonl`?
4. Does CAB `MANIFEST.md` match the package contents?

---

## 3. Command quick reference (operate + fleet + govern)

Surfaces called out for this runbook. Full inventory: [`CXOS-COMPLETE.md`](./CXOS-COMPLETE.md).

| Command | Purpose |
|---|---|
| `cx queue` | Cross-spec work queue (open proposals + tasks) |
| `cx dashboard [outFile]` | Self-contained HTML ops dashboard (default `cxos-dashboard.html`) |
| `cx graph-find <query> [--pack]` | Search strong ontology nodes by id/name/kind |
| `cx board` | Multi-spec ops board (phases, proposals, tasks, daemons) |
| `cx fleet-status [--live] [--auto-live] [--base-url]` | Board + status poll per deployed spec |
| `cx claim <name> <proposalId> [--resolve]` | Alias for `apply` (ops claim language) |
| `cx apply <name> <proposalId> [--resolve]` | Task + remediation note; default proposal → claimed |
| `cx cab-export <name> [outDir]` | CAB change package (CFN + remediations + proposals/tasks + BRIEF) |
| `cx snapshot <name> [outDir]` | Full program snapshot (CAB + spec + health history) |
| `cx operate <name> …` | One-shot: console tick + board line |
| `cx console <name> …` | One tick: poll, propose gated NBA (no mutations) |
| `cx watch <name> [--ticks] [--interval] …` | Bounded console loop |
| `cx daemon start\|status\|stop <name>` | Detached watch daemon |
| `cx status [name] …` | Phases + deployment health + score |
| `cx health-history <name> [--limit]` | Recent health samples |
| `cx proposals` / `cx proposal` | List / transition proposals |
| `cx tasks` / `cx task` | List / transition tasks |
| `cx audit <name> [--limit]` | Recent audit events |
| `cx brief <name> [outFile]` | Executive markdown brief |
| `cx export-aws <name> [outDir]` | Plan-only AWS files |
| `cx doctor …` | Runtime wiring + ontology health |
| `cx init` / `cx new` / `cx approve` / `cx list` | Workspace + program gates |
| `cx plan` / `cx build` / `cx deploy` / `cx run` / `cx teardown` | Build lifecycle |
| `cx catalog` / `cx ontology *` / `cx journeys` / `cx nba` | Closed-world design |

Root script aliases:

```bash
pnpm cx:queue
pnpm cx:dashboard
pnpm cx:graph-find -- billing
pnpm cx:board
pnpm cx:fleet -- --live
pnpm cx:claim -- billing-dispute prop_EXAMPLE
pnpm cx:operate -- billing-dispute
pnpm cx:snapshot -- billing-dispute
pnpm cx:doctor
pnpm cx:stack-up
```

---

## 4. Incident mini-playbooks

### 4.1 Health score degraded / down

```bash
pnpm cox --cwd ~/cx/acme cx status billing-dispute --live
pnpm cox --cwd ~/cx/acme cx health-history billing-dispute
pnpm cox --cwd ~/cx/acme cx doctor --live
pnpm cox --cwd ~/cx/acme cx operate billing-dispute --live
pnpm cox --cwd ~/cx/acme cx claim billing-dispute prop_…
# follow remediations/*.md outside the CLI
pnpm cox --cwd ~/cx/acme cx task billing-dispute task_… done
pnpm cox --cwd ~/cx/acme cx audit billing-dispute
```

### 4.2 Stack not ready (live demos)

```bash
./scripts/cx-stack-up.sh
pnpm cox --cwd ~/cx/acme cx doctor --live
# if still red, continue offline:
pnpm cox --cwd ~/cx/acme cx operate billing-dispute --mode offline
```

### 4.3 Change board package due

```bash
pnpm cox --cwd ~/cx/acme cx brief billing-dispute
pnpm cox --cwd ~/cx/acme cx cab-export billing-dispute
pnpm cox --cwd ~/cx/acme cx snapshot billing-dispute
pnpm cox --cwd ~/cx/acme cx export-aws billing-dispute
# Compliance reviews; human applies CFN if approved
```

### 4.4 Wrong / noisy proposal

```bash
pnpm cox --cwd ~/cx/acme cx proposals billing-dispute
pnpm cox --cwd ~/cx/acme cx proposal billing-dispute prop_… dismissed
# reopen later if needed:
pnpm cox --cwd ~/cx/acme cx proposal billing-dispute prop_… open
```

### 4.5 Catalog / identity question mid-incident

```bash
pnpm cox --cwd ~/cx/acme cx graph-find "<keyword>" --pack local
pnpm cox --cwd ~/cx/acme cx catalog all --pack local
pnpm cox --cwd ~/cx/acme cx nba journey=… stage=… confidence=…
```

---

## 5. Workspace layout (operator map)

```text
.cox/cx/<name>/
  spec.json
  artifacts/ local/ aws/
  proposals.json tasks.json
  remediations/
  health-history.jsonl
  audit.jsonl
  daemon.pid daemon.log daemon.json   # when daemon used
```

Exports (cwd-relative defaults):

```text
cx-export/<name>-aws/     # export-aws
cx-cab/<name>/            # cab-export
cx-snapshot/<name>/       # snapshot
cxos-dashboard.html       # dashboard
```

---

## 6. Role RACI (operate)

| Activity | PM | SA | Ops Lead | SRE | Compliance |
|---|---|---|---|---|---|
| Approve requirements/design | A | C | I | I | C |
| Multi-target build | C | A | I | C (stack) | I |
| Stack / doctor / daemons | I | C | C | A | I |
| Console / operate / claim | C | C | A | C | I |
| Execute remediation outside CLI | C | C | A | C | I |
| CAB / snapshot / AWS apply decision | C | C | C | I | A |
| Archive program | C | C | A | I | C |

A = accountable, C = consulted, I = informed.

---

## 7. Offline proof (CI / workshop)

```bash
pnpm cx:golden
OPENAI_API_KEY= XAI_API_KEY= ANTHROPIC_API_KEY= pnpm --filter @cox/cx-ops test
pnpm cox cx ontology validate --pack local
pnpm cox cx doctor
```

---

*Commands sourced from `packages/cli/src/main.ts` (`cx.command` / subcommands).
If a flag disagrees with `--help`, trust the binary and file an issue against
this runbook.*
