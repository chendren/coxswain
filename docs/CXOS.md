# CXOS: Customer Experience Operating System

CXOS extends Coxswain into a **closed-world build and operate** system for
customer experience solutions. One CX spec fans out to three targets
(platform-neutral artifacts, local omnichannel platform, AWS CX stack).
Ops are graph-grounded: strong ontology for decisions, optional weak models
for generation, human gates for mutation.

Composition root: `@cox/cli` wires `cox cx …`. Contracts live in `@cox/cx-core`.
Adapters: `@cox/cx-artifacts`, `@cox/cx-local`, `@cox/cx-aws`. Operate layer:
`@cox/cx-ops` (injected adapters only; never imports sibling adapters).

---

## What CXOS is

| Layer | Package | Role |
|---|---|---|
| Contracts | `@cox/cx-core` | Spec, artifacts, target adapter interface, ontology, mock adapter, events |
| Neutral build | `@cox/cx-artifacts` | Journey maps, personas, intents, NBA rules, KPI frames, architecture docs |
| Local platform | `@cox/cx-local` | Omnichannel / Nexus CX bind, deploy, status, simulate |
| AWS (plan-only) | `@cox/cx-aws` | Connect / Lex / Bedrock planning; no live CreateStack from Coxswain |
| Ops | `@cox/cx-ops` | Workspace, multi-target orchestrate, console/watch/daemon, proposals, tasks |
| CLI | `@cox/cli` | `cox cx` namespace + runtime mode (offline / live / hybrid) |

**Goals (product):**

- Spec-driven CX (requirements → design → tasks with approval gates).
- Parallel targets from one design, artifacts first so local/aws share context.
- Operate with status, simulate, report, console proposals; never silent prod mutation.
- Closed ontology for NBA, journeys, KPIs; models only where generation is allowed.
- Fully offline-capable demos and tests (offline adapters in `cx-ops`).

**Hard rules:**

- No live AWS stack create from Coxswain. Deploy writes plan-only
  `template.yaml` + `APPLY.md`; a human applies with scoped credentials.
- Console / watch / daemon **propose** only. `apply` creates a task + remediation
  note; operators execute remediations outside auto-mutation.
- Import law: `cx-*` packages import only `@cox/core` and `@cox/cx-core`.
  Adapters never import each other or `cx-ops`. CLI is the sole composition root.

---

## Graph-node practice (strong / weak)

CXOS follows **strong graph first**, **weak nodes optional**:

| Phase | Where | Behavior |
|---|---|---|
| **Strong nodes** | Ontology catalog + `buildStrongGraph` | Deterministic: intents, journeys, NBA rules, KPIs, channels. Zero model calls. |
| **Weak nodes** | Artifacts / AWS generate when keys present | LLM JSON constrained by ontology prompts; optional absorb into strong hubs. |
| **Identity / absorb** | Live artifacts adapter (`absorbWeak`) | Weak labels resolve into strong hub ids when possible. |
| **Control path** | Every ops surface returns a `path[]` audit | e.g. `load_strong → poll_status → route:investigate → recommend_nba → propose_gated → emit` |
| **Intent router** | Console tick | `healthy` → none; `degraded` → investigate; `down` → remediate; always gated. |
| **NBA** | `cox cx nba` / report / console | Pure `matchNbaRules` / `recommendNba` over the ontology pack. |

Ontology packs:

- `default` - commercial seed catalog (`DEFAULT_ONTOLOGY`).
- `local` - default merged with platform treasury journeys (`LOCAL_PLATFORM_ONTOLOGY`).

CLI flag: `--pack default|local` (defaults: ontology commands → `default`; build/doctor → `local`).

---

## Offline vs live hybrid

Runtime modes (`@cox/cli` `CxRuntimeMode`):

| Mode | When | Adapters |
|---|---|---|
| **offline** | Default without `--live` / models | Offline artifacts, offline local, offline AWS (all under `.cox/cx/`) |
| **live** | `--live` (or `--mode live`) with platform/models | Prefer real adapters when healthy / keys present |
| **hybrid** | `--live` with tier models, or `--mode hybrid` | Auto: live where ready, offline fallback elsewhere |

Wiring rules (composition root):

1. **artifacts** - live only if weak generate is available (Anthropic tier model or OpenAI-compat); else offline adapter.
2. **local** - live when platform probe succeeds (`/api/journeys/definitions` preferred). Bind uses **deterministic** closed-id stubs (stable journey/KPI JSON), not flaky freeform model output.
3. **aws** - "live" means plan-only adapter with model-assisted docs when generate is available; still writes applyable CFN, no CreateStack.

`cox cx doctor` prints `runtime mode=…`, per-target `wiring=live|offline`, Ollama + platform health, ontology ok, and known specs.

Stack for healthy **live local**:

```bash
# from monorepo root
./scripts/cx-stack-up.sh
pnpm cox cx doctor --live
```

`scripts/cx-stack-up.sh` starts Ollama if needed, pulls `nomic-embed-text`
(required for platform ready), optional `nemotron-mini`, starts the Nexus
platform (`CX_PLATFORM_DIR`, default `~/Projects/cx-platform/omnichannel-cx-platform`),
and checks `GET /api/health/ready` → HTTP 200.

Env defaults:

| Variable | Default |
|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `CX_LOCAL_BASE_URL` | `http://127.0.0.1:3143` |
| `CX_PLATFORM_DIR` | `$HOME/Projects/cx-platform/omnichannel-cx-platform` |

Optional `cox.config.json` `cx` block: local `baseUrl`, `defaultOpsMode`,
`watcherPollIntervalMs`, `budgets.cxOpsUsd`.

---

## Command cheat sheet

All commands are under `pnpm cox cx …` (or `pnpm cox --cwd <dir> cx …`).

Common flags (where registered):

| Flag | Meaning |
|---|---|
| `--target <list>` | `artifacts`, `local`, `aws`, comma list, or `all` |
| `--live` | Prefer live models/platform wiring |
| `--auto-live` | Hybrid without `--live` (or `CX_AUTO_LIVE=1`) |
| `--mode offline\|live\|hybrid` | Explicit runtime mode |
| `--base-url <url>` | Local platform base URL (else `cox.config.json` `cx.targets.local`) |
| `--pack default\|local` | Ontology pack |

### Ontology and doctor

```bash
pnpm cox cx ontology show [--pack default|local]
pnpm cox cx ontology validate [--pack …]
pnpm cox cx ontology graph [--pack …]
pnpm cox cx nba journey=… stage=… [confidence=0.9] [field=value …] [--pack …]
pnpm cox cx doctor [--live] [--mode …] [--base-url …] [--pack local]
```

### Spec lifecycle

```bash
pnpm cox cx new <name> [idea...]
pnpm cox cx approve <name> [requirements|design|tasks]   # default: next unapproved
pnpm cox cx list
pnpm cox cx plan <name> [--target all] [--live]
pnpm cox cx build <name> [--target all] [--live|--auto-live] [--base-url …] [--pack local]
pnpm cox cx deploy <name> …   # same path as build with deploy=true
pnpm cox cx run <name> [idea...] [--target all] [--live|--auto-live]
  # golden path: create if missing → approve requirements → build all →
  # status → simulate local → report + design-grounded NBA
```

Notes:

- `new` seeds CX-EARS requirements under `.cox/cx/<name>/`.
- `build` requires **requirements approved**. Seeds design from idea if missing;
  runs **artifacts first**, merges design into the workspace, auto-approves
  design when journey maps land, then local and aws.
- `run` is the product one-shot. After ops proposals, use `apply` + `task`
  (and optional human platform/AWS CFN apply).

### Operate

```bash
pnpm cox cx status [name] [--target …] [--live]
pnpm cox cx simulate <name> [--target local] [--live] [--base-url …]
pnpm cox cx report <name> [--target …] [--live]     # status (+ sim where supported) + scout summary + graph NBA
pnpm cox cx console <name> [--target …] [--live]    # one tick: poll, propose, persist; no mutations
pnpm cox cx watch <name> [--ticks 3] [--interval 2000] [--live]
pnpm cox cx daemon start <name> [--interval 30000] [--ticks 120] [--live]
pnpm cox cx daemon status <name>
pnpm cox cx daemon stop <name>
pnpm cox cx proposals <name> [--all]
pnpm cox cx proposal <name> <id> open|claimed|resolved|dismissed
pnpm cox cx apply <name> <proposalId>               # → tasks.json + remediations/<id>.md
pnpm cox cx tasks <name> [--all]
pnpm cox cx task <name> <id> pending|in_progress|done|cancelled
pnpm cox cx teardown <name> [--target all] [--live]
```

### Golden offline path

```bash
pnpm cox cx doctor
pnpm cox cx ontology validate
pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
pnpm cox cx build billing-dispute --target all
pnpm cox cx status billing-dispute
pnpm cox cx simulate billing-dispute --target local
pnpm cox cx report billing-dispute
pnpm cox cx console billing-dispute
pnpm cox cx watch billing-dispute --ticks 3
pnpm cox cx proposals billing-dispute
pnpm cox cx nba journey=churn_prevention stage=cancel_requested confidence=0.9
pnpm cox cx teardown billing-dispute
```

Scripted: `./examples/cx-demo/golden-path.sh` and `./examples/cx-demo/golden-path.sh --live`.

---

## Layout of `.cox/cx/<spec>/`

Root: `{cwd}/.cox/cx/` (`defaultCxRoot`). Per-spec directory:

```
.cox/cx/<spec>/
  spec.json              # CxWorkspaceRecord: idea, path audit, CxSpec (phases, design)
  deployments.json       # Partial Record<targetId, CxDeployment>
  proposals.json         # console/watch proposals (human-gated)
  tasks.json             # tasks from applyProposal
  remediations/          # <proposalId>.md operator notes
  artifacts/             # artifacts adapter disk
  local/                 # local adapter disk
  aws/                   # AWS plan-only outputs
    template.yaml        # CloudFormation skeleton (applyable by human)
    APPLY.md             # aws cloudformation deploy hint
    architectureDoc.json
    agentDefinition.json
  daemon.pid             # watch daemon (when started)
  daemon.log
  daemon.json            # DaemonMeta
```

Phases on the spec: `requirements` | `design` | `tasks` with values such as
`draft` / `missing` / `approved`. Approve order is gated (cannot approve design
before requirements, etc.). Build may auto-approve **design** after a successful
artifacts merge that produces journey maps.

Targets: `artifacts` | `local` | `aws`. Parse order always puts **artifacts first**.

---

## AWS plan-only `template.yaml`

Offline (and plan-only) AWS deploy does **not** call CloudFormation APIs.

`buildCfnSkeleton` (`@cox/cx-ops`) maps journey type + stages to a fixed
resource graph:

- Parameters: `Environment`, `JourneyType`, `SpecName`
- Resources: Connect instance, Lex bot + role, Bedrock agent role
- Outputs: journey type, Connect ARN, plan-only purpose, apply hint

On deploy, the offline AWS adapter writes:

- `.cox/cx/<spec>/aws/template.yaml`
- `.cox/cx/<spec>/aws/APPLY.md` with:

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name cxos-<spec> \
  --capabilities CAPABILITY_IAM
```

Human applies with their own credentials. Coxswain never auto-mutates AWS prod.

---

## Stack-up script

| Item | Detail |
|---|---|
| Path | `scripts/cx-stack-up.sh` (run from monorepo root) |
| Ollama | Start `ollama serve` if tags probe fails; pull `nomic-embed-text`; optional `nemotron-mini` |
| Platform | `node $CX_PLATFORM_DIR/server.js` if journeys API is down |
| Ready gate | `curl` platform `/api/health/ready`; exit 0 on HTTP 200, else warn + exit 1 |
| Logs | `/tmp/ollama-serve.log`, `/tmp/nexus-cx.log` |

After stack-up:

```bash
pnpm cox cx doctor --live --base-url http://127.0.0.1:3143
pnpm cox cx build <spec> --live --base-url http://127.0.0.1:3143 --target all
```

### Stack services (macOS LaunchAgents)

For always-on Ollama + Nexus CX (login session), use LaunchAgents instead of
one-shot `cx-stack-up.sh`. Templates live under `scripts/macos/`; install
substitutes `{{HOME}}` and `{{PLATFORM_DIR}}`, resolves `ollama` on PATH,
writes plists to `~/Library/LaunchAgents`, and `launchctl load`s them.

| Item | Detail |
|---|---|
| Labels | `com.chendren.ollama`, `com.chendren.nexus-cx` |
| Ollama | `ollama serve` (binary resolved at install; template placeholder `{{HOME}}/.local/bin/ollama`) |
| Platform | `/usr/bin/env node {{PLATFORM_DIR}}/server.js`, `WorkingDirectory` = platform root, `PORT=3143` |
| Default `PLATFORM_DIR` | `~/Projects/cx-platform/omnichannel-cx-platform` (`CX_PLATFORM_DIR` or `--platform-dir`) |
| Logs | `~/Library/Logs/coxswain/` |

```bash
# install (optional platform path)
./scripts/macos/install-launchagents.sh
./scripts/macos/install-launchagents.sh --platform-dir ~/Projects/cx-platform/omnichannel-cx-platform

# uninstall
./scripts/macos/uninstall-launchagents.sh
```

Still pull models once (`nomic-embed-text`, optional `nemotron-mini`) via
`cx-stack-up.sh` or `ollama pull` before expecting `/api/health/ready` 200.

---

## Package map (quick)

```
packages/
  cx-core/        contracts + ontology (+ graph, evaluate, validate)
  cx-artifacts/   neutral document factory (weak generate optional)
  cx-local/       live HTTP platform adapter
  cx-aws/         AWS plan-only adapter
  cx-ops/         workspace, orchestrate, console, proposals, tasks, daemon, CFN skeleton, offline adapters
  cli/            cox cx + createCxRuntime / createOfflineCxRuntime
```

See also: `docs/superpowers/specs/2026-07-22-cxos-design.md`,
`2026-07-24-cx-ops-design.md`, `2026-08-03-cxos-ontology-design.md`,
`packages/cx-ops/README.md`, `examples/cx-demo/README.md`.
