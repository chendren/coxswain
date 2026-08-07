# CXOS Complete — Customer Experience Operating System

This is the **system map** for a true CX OS on Coxswain: closed-world design,
multi-target build, human-gated operate, fleet board, executive brief, CAB
export, and audit trail. Technical detail: [`CXOS.md`](./CXOS.md). Personas:
[`CXOS-PERSONAS-USE-CASES.md`](./CXOS-PERSONAS-USE-CASES.md).

---

## Operating system layers

| Layer | Responsibility | Primary surface |
|---|---|---|
| **Catalog** | Closed ontology / strong graph | `ontology *`, `journeys` |
| **Program** | Spec lifecycle + multi-target build | `init` `new` `approve` `run` `build` `plan` |
| **Observe** | Health, simulate, report, scores | `status` `simulate` `report` `doctor` |
| **Operate** | Propose → claim → task → close | `console` `watch` `daemon` `proposals` `apply` `tasks` |
| **Fleet** | Multi-spec board | `board` |
| **Govern** | Brief, audit, CAB package, AWS plan handoff | `brief` `audit` `cab-export` `export-aws` |
| **Fabric** | Local stack readiness | `cx:stack-up`, LaunchAgents, hybrid/live |

Hard rules (OS kernel):

1. No silent prod mutation (console/daemon propose only).
2. AWS is plan-only; humans apply CFN (`export-aws` / `cab-export`).
3. Offline-first; live/hybrid when stack + optional keys are ready.
4. Strong graph first; weak models optional for generate only.

---

## Full CLI map (`cox cx …`)

### Catalog
| Command | Purpose |
|---|---|
| `ontology show\|validate\|graph` | Inventory / integrity / strong graph |
| `ontology nba [k=v…]` | Pure NBA recommend |
| `journeys [--pack]` | Closed journey inventory |

### Program lifecycle
| Command | Purpose |
|---|---|
| `init` | Ensure `.cox/cx`; seed `starter` if empty |
| `new` `approve` `list` | Spec create + phase gates |
| `plan` `build` `deploy` `teardown` | Multi-target (artifacts → local → aws) |
| `run` | Golden path one-shot (+ phase path grouping) |

### Observe
| Command | Purpose |
|---|---|
| `doctor` | Wiring + ontology + stack; live fail-closed |
| `status` | Health + summary score + path audit |
| `simulate` `report` | Traffic sim + cross-target report |

### Operate
| Command | Purpose |
|---|---|
| `console` `watch` | Tick propose + persist |
| `daemon start\|status\|stop` | Long-running watch + health line |
| `proposals` `proposal` | List / legal transitions |
| `apply [--resolve]` | Task + remediation; claim or resolve |
| `tasks` `task` | Board rollup; done auto-resolves proposal |

### Fleet + govern
| Command | Purpose |
|---|---|
| `board` | Multi-spec ops board |
| `fleet-status` | Board + status poll each deployed spec |
| `brief [outFile]` | Executive markdown brief |
| `audit [--limit]` | Append-only event trail |
| `health-history` | Score samples from status polls |
| `cab-export [outDir]` | CAB package (CFN + remediations + state + BRIEF) |
| `snapshot [outDir]` | Full program snapshot (CAB + spec + health) |
| `export-aws [outDir]` | AWS plan-only files only |
| `archive` / `restore` | Soft-archive programs (dot-prefix hide) |

### Catalog (deeper)
| Command | Purpose |
|---|---|
| `catalog [all\|domains\|intents\|kpis\|nba\|channels]` | Full closed taxonomy browser |
| `claim` | Ops alias for `apply` |
| `operate` | One-shot console tick + board line |

---

## End-to-end OS loops

### A. Stand up a program
```bash
pnpm cx:init
pnpm cox cx run billing "reduce dispute handle time"
pnpm cox cx board
pnpm cox cx brief billing
```

### B. Day-2 operate
```bash
pnpm cox cx status billing --live
pnpm cox cx console billing --live
pnpm cox cx apply billing prop_…
pnpm cox cx tasks billing
pnpm cox cx task billing task_… done
pnpm cox cx audit billing
```

### C. Change board / AWS handoff
```bash
pnpm cox cx cab-export billing
# review cx-cab/billing/MANIFEST.md + aws/APPLY.md
# human: aws cloudformation deploy …
```

### D. Offline proof
```bash
pnpm cx:golden
OPENAI_API_KEY= pnpm --filter @cox/cx-ops test
```

---

## Workspace layout (complete)

```
.cox/cx/<spec>/
  spec.json
  deployments.json
  proposals.json
  tasks.json
  audit.jsonl              # OS audit trail
  remediations/<prop>.md
  artifacts/ local/ aws/
  daemon.{pid,log,json}
```

CAB export (`cx-cab/<spec>/` by default):

```
MANIFEST.md BRIEF.md proposals.json tasks.json deployments.json
aws/ remediations/ audit.jsonl?
```

---

## Package map

| Package | OS role |
|---|---|
| `cx-core` | Contracts, ontology, graph |
| `cx-artifacts` / `cx-local` / `cx-aws` | Target adapters |
| `cx-ops` | Workspace, orchestrate, board, brief, cab, audit, daemon, proposals, tasks |
| `cli` | Composition root + all `cox cx` commands |

---

## Completeness checklist

| Capability | Status |
|---|---|
| Closed ontology + NBA | yes |
| Spec phases + multi-target build | yes |
| Offline + hybrid + live local | yes |
| Plan-only AWS + export | yes |
| Human-gated proposals/tasks | yes |
| Legal transition graph | yes |
| Metrics score + path audit | yes |
| Daemon operate | yes |
| Multi-spec board | yes |
| Fleet status (poll each) | yes |
| Executive brief | yes |
| CAB package | yes |
| Full snapshot | yes |
| Audit log | yes |
| Health history | yes |
| Journey + catalog inventory | yes |
| Soft archive / restore | yes |
| Claim + operate one-shot | yes |
| Workspace init | yes |
| LaunchAgents / stack-up | yes |
| Persona playbooks | yes (`CXOS-PERSONAS-USE-CASES.md`) |
| CreateStack from Coxswain | **never** (by design) |

---

## Package scripts

| Script | Action |
|---|---|
| `pnpm cx:init` | Workspace + starter |
| `pnpm cx:board` | Fleet board |
| `pnpm cx:doctor` | Health |
| `pnpm cx:run -- <name> "idea"` | Golden one-shot |
| `pnpm cx:journeys` | Journey catalog |
| `pnpm cx:golden` / `cx:golden:live` | Demo script |
| `pnpm cx:stack-up` | Ollama + platform |
