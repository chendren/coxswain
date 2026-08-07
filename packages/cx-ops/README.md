# `@cox/cx-ops`

CXOS operate and orchestration layer. Injected adapters only: this package
imports `@cox/core` and `@cox/cx-core`, never `@cox/cx-artifacts`,
`@cox/cx-local`, or `@cox/cx-aws`. The CLI composition root wires live or
offline adapters.

Public surface is re-exported from `src/index.ts`.

## Module table

| Module | Public API | Role |
|---|---|---|
| **workspace** | `defaultCxRoot`, `createCxSpec`, `loadCxWorkspace`, `saveCxWorkspace`, `listCxSpecs`, `approveCxPhase`, `mergeDesignFromArtifacts`, `loadDeployments`, `saveDeployment`, `clearDeployment`, `parseTargets`, `adapterDiskRoot`, types `CxPhase`, `CxWorkspaceRecord`, `CxDeploymentsFile`, `CxWorkspaceDeps` | Disk layout under `.cox/cx/<spec>/`: `spec.json`, `deployments.json`; phase gates; target parse (artifacts first) |
| **orchestrate** | `orchestrateBuild`, `orchestrateStatus`, `orchestrateSimulate`, `orchestrateReport`, `seedDesignFromIdea`, types `OrchestratorAdapters`, `OrchestrateDeps`, `TargetResult`, `OrchestrateResult` | Multi-target graph: artifacts first → merge design → local/aws; status/sim/report with optional scout summary + NBA |
| **console** | `runConsoleTick`, types `ConsoleProposalKind`, `ConsoleProposal`, `ConsoleTickResult`, `ConsoleTarget`, `ConsoleTickDeps` | One poll cycle: load strong → status → intent route → recommend NBA → propose (no mutations, no models) |
| **proposals** | `loadProposals`, `appendProposalsFromTick`, `transitionProposal`, `listOpenProposals`, types `ProposalStatus`, `CxProposal`, `ProposalStoreDeps` | Persist/dedupe proposals in `proposals.json`; statuses `open` \| `claimed` \| `resolved` \| `dismissed` |
| **tasks** | `loadCxTasks`, `applyProposal`, `transitionTask`, types `CxTaskStatus`, `CxTask` | Apply proposal → `tasks.json` + `remediations/<id>.md`; task statuses `pending` \| `in_progress` \| `done` \| `cancelled` |
| **watch** | `runWatchLoop`, types `WatchTarget`, `WatchLoopDeps`, `WatchLoopResult` | Bounded console loop with interval/maxTicks; persists proposals via proposal store |
| **daemon** | `daemonPaths`, `readDaemonMeta`, `isDaemonRunning`, `stopDaemon`, `runDaemonLoop`, `spawnWatchDaemon`, types `DaemonPaths`, `DaemonMeta` | Detached watch: `daemon.pid` / `daemon.log` / `daemon.json` under the spec dir |
| **stack-health** | `probeOllama`, `probePlatformReady`, `probeStackHealth`, types `OllamaHealth`, `PlatformHealth`, `StackHealth` | Doctor probes: Ollama tags + embed/LLM models; platform `/api/health/ready` |
| **metrics-summary** | `summarizeDeployments`, types `HealthEntry`, `MetricsSummary` | Pure health rollup for status: counts + score (healthy=100, degraded=50, down/error=0) |
| **path-audit** | `formatPathAudit`, `PATH_AUDIT_DEFAULT_MAX` | Collapse long control-flow paths for CLI display (head 3 + `...` + tail 3 when length > 8) |
| **cfn-skeleton** | `buildCfnSkeleton` | Deterministic CloudFormation YAML + APPLY markdown from journey map (plan-only; no CreateStack) |
| **offline-adapters** | `createOfflineLocalAdapter`, `createOfflineAwsAdapter`, type `OfflineDiskDeps` | Disk-backed local (build/deploy/status/simulate/teardown) and AWS plan-only (writes `template.yaml`, `APPLY.md`) |
| **offline-artifacts** | `createOfflineArtifactsAdapter`, type `OfflineArtifactsDeps` | Deterministic / optional-generate artifacts adapter for offline runtime |
| **status** | `getStatus`, `runSimulate`, `runTeardown` | Thin capability-aware passthrough to `CxTargetAdapter` |
| **report** | `generateReport`, types `CxOpsReport`, `CxOpsReportEntry`, `ReportTarget`, `ReportDeps` | Cross-target status (+ simulate when capable); one scout-tier summary via injected `generate` |
| **nba** | `opsRecommendNba`, `parseNbaContext`, type `NbaRecommendResult` | Pure graph NBA + confidence band + next stages; CLI key=value context parse |
| **ontology** | `resolveOntologyPack`, `showOntology`, `validateOntologyPack`, `showStrongGraph`, type `OntologyPack` (`default` \| `local`), show/validate/graph result types | Closed-world catalog inventory, integrity + strong-graph stats |
| **json-extract** | `extractJsonText`, `parseJsonLoose` | Weak-node helpers: strip fences / loose JSON for model output |

## Import law

```ts
// allowed
import { … } from "@cox/core";
import { … } from "@cox/cx-core";

// forbidden inside this package
import { … } from "@cox/cx-artifacts"; // etc.
```

Adapters are passed as `OrchestratorAdapters` / `CxTargetAdapter` instances from
`@cox/cli` (`createCxRuntime` / `createOfflineCxRuntime`).

## Graph path (ops)

Typical control audits returned as `path: string[]`:

```
build:    load_workspace → route_targets → plan:artifacts → build:artifacts → merge_design → …
console:  load_strong → poll_status → target:local → health:… → route:… → recommend_nba → propose_gated → emit
nba:      load_strong → match_rules → confidence_band? → next_stages? → emit
stack:    probe_ollama → probe_platform → emit
daemon:   daemon_start → [watch ticks] → daemon_stop
```

## CLI mapping

| CLI | cx-ops entry |
|---|---|
| `cox cx new` / `approve` / `list` | workspace |
| `cox cx build` / `deploy` / `status` / `simulate` / `report` | orchestrate (+ status/report); status uses `summarizeDeployments` for `summary score=` |
| `cox cx plan` | adapter `plan` via CLI (workspace + adapters) |
| `cox cx console` | console + proposals |
| `cox cx watch` | watch |
| `cox cx daemon *` | daemon |
| `cox cx proposals` / `proposal` | proposals |
| `cox cx apply` / `tasks` / `task` | tasks |
| `cox cx ontology *` / `nba` | ontology / nba |
| `cox cx doctor` | stack-health + ontology + workspace list |
| `cox cx teardown` | status `runTeardown` / adapter teardown + `clearDeployment` |

## Proposals lifecycle (human-gated)

Console/watch only **persist** proposals. No adapter mutations. Statuses:

`open` → `claimed` → `resolved` | `dismissed`

| Command | Effect |
|---|---|
| `cox cx proposals <name>` | list open + claimed (default) |
| `cox cx proposals <name> --all` | include resolved/dismissed |
| `cox cx proposals <name> --status <s>` | filter one status (`open`\|`claimed`\|`resolved`\|`dismissed`) |
| `cox cx proposal <name> <id> claimed` | claim for work |
| `cox cx proposal <name> <id> resolved` | mark done after remediation |
| `cox cx proposal <name> <id> dismissed` | drop without apply |
| `cox cx apply <name> <proposalId>` | create task + remediation note; proposal → `claimed` |

After apply, CLI prints next steps:

```text
next: cox cx task <name> <taskId> in_progress
next: cox cx proposal <name> <proposalId> resolved
```

Tasks mirror list filters: `cox cx tasks <name> [--all] [--status pending|in_progress|done|cancelled]`.
Transitions: `cox cx task <name> <id> pending|in_progress|done|cancelled`.

Product narrative and cheat sheet: [`docs/CXOS.md`](../../docs/CXOS.md).
Demo: [`examples/cx-demo/README.md`](../../examples/cx-demo/README.md).
