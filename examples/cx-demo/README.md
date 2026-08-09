# CXOS demo (graph-node operating loop)

End-to-end Customer Experience Operating System flow using **strong-graph**
adapters. Default is fully offline (no live AWS or platform required).

**Terminal demo (README GIF):**

```bash
# from monorepo root (requires VHS: brew install vhs)
vhs examples/cx-demo/offline-golden-demo.tape
# writes offline-golden.gif + offline-golden.mp4
```

Sim script: `offline-golden-sim.js` (accurate offline path, no keys).

**Who this demo is for:** product, architecture, ops, partners, and workshop
facilitators practicing the same loop. Deep persona playbooks and multi-role
scenarios: [`docs/CXOS-PERSONAS-USE-CASES.md`](../../docs/CXOS-PERSONAS-USE-CASES.md).

Optional live checks: [`docs/LIVE-SMOKE-M3.md`](../../docs/LIVE-SMOKE-M3.md).

### Demo tracks by persona (quick)

| Track | Persona | Commands |
|---|---|---|
| Workspace seed | PM / SA | `cx:init` / `cx init` |
| Design once | PM / SA | `cx run` / `cx:golden` |
| Catalog honesty | Graph eng / LOB | `cx:journeys` / `journeys` / `ontology show\|validate\|graph` |
| Day-2 queue | Journey owner | `console` → `apply` → `tasks` → `task … done` |
| Fleet view | Ops lead | `cx:board` / `cx board` |
| Exec read | Sponsor | `cx brief <name>` |
| Change board | SA / Compliance | `cab-export` / `export-aws` |
| Evidence | Security | `cx audit <name>` |
| Live local | SRE | `cx:stack-up` + `doctor --live` |

Complete OS map: [`docs/CXOS-COMPLETE.md`](../../docs/CXOS-COMPLETE.md).

### Demo tracks (init / journeys / board / brief / cab-export / audit)

From monorepo root. Use a cwd with `.cox/cx` (or let `init` create it).

**init** - ensure workspace; seed `starter` when empty:

```bash
pnpm cx:init
# or: pnpm cox --cwd /tmp/cx-demo cx init
# next when empty: approve starter + build, or cx run starter "your idea"
# next when specs exist: cx board
```

**journeys** - closed journey inventory from the ontology pack:

```bash
pnpm cx:journeys
pnpm cox cx journeys
pnpm cox cx journeys --pack local    # default pack
pnpm cox cx ontology show
pnpm cox cx ontology validate
pnpm cox cx ontology graph
```

**board** - multi-spec fleet rollup (phases, proposals, tasks, daemons):

```bash
pnpm cx:board
pnpm cox --cwd /tmp/cx-demo cx board
```

**brief** - executive markdown (stdout or file; no model):

```bash
pnpm cox cx brief billing-dispute
pnpm cox cx brief billing-dispute ./brief-billing.md
```

**cab-export** - change-board package (CFN + remediations + state + BRIEF/MANIFEST).
Default out: `cx-cab/<spec>/`. Human CFN only (never CreateStack):

```bash
pnpm cox cx cab-export billing-dispute
pnpm cox cx cab-export billing-dispute ./cx-cab/billing-dispute
# review MANIFEST.md + aws/APPLY.md, then human aws cloudformation deploy …
pnpm cox cx export-aws billing-dispute   # AWS plan files only
```

**audit** - append-only event trail (`audit.jsonl`, last N events):

```bash
pnpm cox cx audit billing-dispute
pnpm cox cx audit billing-dispute --limit 50
```

End-to-end sketch (offline):

```bash
pnpm cx:init
pnpm cox cx run billing-dispute "reduce dispute handle time"
pnpm cx:board
pnpm cox cx brief billing-dispute
pnpm cox cx cab-export billing-dispute
pnpm cox cx audit billing-dispute
pnpm cx:journeys
```

## Stack up (Ollama + platform)

From the **monorepo root** (not this directory):

```bash
./scripts/cx-stack-up.sh
# then: pnpm cox cx doctor --live
```

`scripts/cx-stack-up.sh` brings up Ollama (`nomic-embed-text` required for ready),
starts the Nexus platform (`CX_PLATFORM_DIR`), and checks `/api/health/ready`.

One-shot golden path: `cox cx run <name> [idea...]` (new if needed, approve
requirements, build+deploy all targets, status, simulate local, report).
Stepwise lifecycle remains `new` → `approve` → `build`, then operate with
`status` / `simulate` / `console` / `apply` / `daemon`.

```bash
# offline one-shot
pnpm cox --cwd /tmp/cx-demo cx run billing-dispute "reduce dispute handle time"

# live platform when up
pnpm cox --cwd /tmp/cx-demo cx run billing-dispute "reduce dispute handle time" --live
```

## Golden path (script)

From monorepo root:

```bash
# offline
./examples/cx-demo/golden-path.sh

# live platform + OpenAI/XAI weak generate when keys present
./examples/cx-demo/golden-path.sh --live
```

## Multi-program (script)

Offline fleet demo: two CX specs under one cwd, `cx run` for each, then
`board` and `queue` when those commands exist. Uses `CX_CWD` or a temp dir.

From monorepo root:

```bash
# offline (temp cwd)
./examples/cx-demo/multi-program.sh

# reuse a fixed workspace
CX_CWD=/tmp/cx-multi ./examples/cx-demo/multi-program.sh
```

Creates `billing-dispute` and `churn-save`, then prints the multi-spec ops
board and cross-spec work queue. Skip lines appear if `board` / `queue` are
missing from the CLI build.

## Operate loop (proposals → tasks)

Proposals are human-gated. Console/watch only write `proposals.json`.

Statuses: `open` → `claimed` → `resolved` | `dismissed`.

```bash
pnpm cox cx console <spec> --live                    # poll + persist proposals
pnpm cox cx proposals <spec>                         # open + claimed
pnpm cox cx proposals <spec> --all                   # include resolved/dismissed
pnpm cox cx proposals <spec> --status open           # single status filter
pnpm cox cx proposal <spec> <id> claimed             # claim for work
pnpm cox cx apply <spec> <proposalId>                # → task + remediation; proposal claimed
pnpm cox cx tasks <spec>                             # pending + in_progress
pnpm cox cx tasks <spec> --all
pnpm cox cx tasks <spec> --status pending
pnpm cox cx task <spec> <taskId> in_progress
pnpm cox cx task <spec> <taskId> done
pnpm cox cx proposal <spec> <proposalId> resolved    # close after remediation
pnpm cox cx proposal <spec> <proposalId> dismissed   # drop without apply
```

After `apply`, the CLI suggests:

```text
next: cox cx task <spec> <taskId> in_progress
next: cox cx proposal <spec> <proposalId> resolved
```

AWS plan-only writes `template.yaml` + `APPLY.md` under `.cox/cx/<spec>/aws/`.
Copy out for human CFN apply (default outDir `./cx-export/<spec>-aws`):

```bash
pnpm cox cx export-aws <spec> [outDir]
```

## Operator scripts (monorepo root)

| Command | Action |
|---|---|
| `pnpm cx:init` | ensure `.cox/cx`; seed `starter` if empty |
| `pnpm cx:board` | multi-spec ops board |
| `pnpm cx:journeys` | closed journey inventory |
| `pnpm cx:doctor` | wiring + ontology (`cox cx doctor`; exit 1 if `--live` and stack not ready) |
| `pnpm cx:stack-up` | one-shot Ollama + platform (`scripts/cx-stack-up.sh`) |
| `pnpm cx:run -- <name> [idea...]` | one-shot golden path (new/approve/build/status/simulate/report) |
| `pnpm cx:golden` / `cx:golden:live` | demo script (`cx run` + `export-aws`) |
| `pnpm cox cx brief <spec> [outFile]` | executive markdown brief |
| `pnpm cox cx cab-export <spec> [outDir]` | CAB package (CFN + remediations + state + BRIEF) |
| `pnpm cox cx audit <spec> [--limit N]` | append-only audit trail |
| `pnpm cox cx export-aws <spec> [outDir]` | copy plan-only CFN for human apply |

macOS always-on stack (LaunchAgents for Ollama + Nexus CX):

```bash
./scripts/macos/install-launchagents.sh
./scripts/macos/install-launchagents.sh --platform-dir ~/Projects/cx-platform/omnichannel-cx-platform
# uninstall: ./scripts/macos/uninstall-launchagents.sh
```

## Offline (always works)

```bash
pnpm cox cx doctor
pnpm cox cx ontology validate
pnpm cox cx ontology graph

pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
pnpm cox cx build billing-dispute --target all   # auto-approves design after artifacts

pnpm cox cx status billing-dispute
pnpm cox cx simulate billing-dispute --target local
pnpm cox cx report billing-dispute
pnpm cox cx console billing-dispute
pnpm cox cx watch billing-dispute --ticks 3
pnpm cox cx daemon start billing-dispute --live   # detached long-running watch
pnpm cox cx daemon status billing-dispute
pnpm cox cx daemon stop billing-dispute
pnpm cox cx proposals billing-dispute
pnpm cox cx proposals billing-dispute --all
pnpm cox cx nba journey=churn_prevention stage=cancel_requested confidence=0.9

pnpm cox cx teardown billing-dispute
```

Artifacts land under `.cox/cx/billing-dispute/`.

## Hybrid / live (platform on :3143)

```bash
# 1) Ollama - required for /api/health/ready → status ready + ollama:true
ollama serve &
ollama pull nomic-embed-text   # embeddings check (required for ready)
ollama pull nemotron-mini      # optional LLM enrichment

# 2) Nexus CX platform
cd ~/Projects/cx-platform/omnichannel-cx-platform && npm start

# 3) Verify ready (HTTP 200, ollama:true)
curl -s http://127.0.0.1:3143/api/health/ready

# 4) Live CXOS
pnpm cox cx doctor --live --base-url http://127.0.0.1:3143
pnpm cox cx build billing-dispute --live --base-url http://127.0.0.1:3143 --target all
pnpm cox cx status billing-dispute --live --base-url http://127.0.0.1:3143
# expect: local: healthy
```

### Auto-live ergonomics

Skip typing `--live` every time:

```bash
# per-command
pnpm cox cx doctor --auto-live
pnpm cox cx build billing-dispute --auto-live --target all

# or shell-wide
export CX_AUTO_LIVE=1
pnpm cox cx doctor
pnpm cox cx status billing-dispute
```

`--mode offline` still forces offline even when `CX_AUTO_LIVE=1`.

When `--base-url` is omitted, the CLI loads `cx.targets.local.baseUrl` from
`cox.config.json` (via `loadConfig` → `resolveLocalBaseUrl`).

`cox.config.json` (optional):

```json
{
  "cx": {
    "targets": {
      "local": { "baseUrl": "http://127.0.0.1:3143" }
    },
    "defaultOpsMode": "console",
    "budgets": { "cxOpsUsd": 5 }
  }
}
```

## Graph path

```
compose: load_config → probe_platform → route adapters (live|offline)
build:   plan/build/deploy(artifacts) → merge_design → local → aws
console: load_strong → poll_status → intent_route → recommend_nba → propose (gated)
```
