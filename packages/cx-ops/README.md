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
| **proposals** | `loadProposals`, `appendProposalsFromTick`, `transitionProposal`, `isLegalProposalTransition`, `suggestedProposalNext`, `listOpenProposals`, `proposalUrgencyScore`, types `ProposalStatus`, `CxProposal`, `ProposalStoreDeps` | Persist/dedupe `proposals.json`; legal edges (`open`→claim/dismiss/resolve, `claimed`→resolve/dismiss/open, `dismissed`→open, `resolved` terminal); `suggestedProposalNext` → apply/resolve/reopen/none; `proposalUrgencyScore(kind, ageHours)` pure 0-100 (remediate 70 / investigate 45 / else 25 +1h capped +30) |
| **tasks** | `loadCxTasks`, `applyProposal`, `transitionTask`, `summarizeTasks`, `remediationFilePath`, types `CxTaskStatus`, `CxTask`, `TaskSummary` | Apply → task + remediation; default proposal **claimed** (`resolve: true` → **resolved**); `summarizeTasks` rollup; task `done` auto-resolves source proposal (`resolveSource: false` to skip) |
| **watch** | `runWatchLoop`, types `WatchTarget`, `WatchLoopDeps`, `WatchLoopResult` | Bounded console loop with interval/maxTicks; persists proposals via proposal store |
| **daemon** | `daemonPaths`, `readDaemonMeta`, `isDaemonRunning`, `stopDaemon`, `runDaemonLoop`, `spawnWatchDaemon`, `recordDaemonLastTick`, types `DaemonPaths`, `DaemonMeta` | Detached watch: `daemon.pid` / `daemon.log` / `daemon.json` (lastTick/lastTickAt); CLI health line: running/stopped + pid/ticks/proposals_open |
| **stack-health** | `probeOllama`, `probePlatformReady`, `probeStackHealth`, types `OllamaHealth`, `PlatformHealth`, `StackHealth` | Doctor probes: Ollama tags + embed/LLM models; platform `/api/health/ready` |
| **metrics-summary** | `summarizeDeployments`, types `HealthEntry`, `MetricsSummary` | Pure health rollup for status: counts + score (healthy=100, degraded=50, down/error=0) |
| **path-audit** | `formatPathAudit`, `formatPathByPhase`, `PATH_AUDIT_DEFAULT_MAX` | Collapse long paths for CLI; group multi-stage `run` audits by phase (`build` / `status` / `simulate` / `report` / `other`) |
| **board** | `buildOpsBoard`, types `BoardRow`, `OpsBoard` | Multi-spec fleet rollup: phases, deployments, open/claimed proposals, open/done tasks, daemon running + last tick |
| **fleet-queue** | `buildWorkQueue`, types `QueueProposalItem`, `QueueTaskItem`, `WorkQueue` | Cross-spec open work: open/claimed proposals + pending/in_progress tasks; urgency by kind; sort urgency then age; totals + path |
| **dashboard-html** | `renderOpsDashboardHtml` | Self-contained offline HTML dashboard from `OpsBoard` (+ optional `WorkQueue`); no CDN CSS/JS; cards + fleet table + queue tables |
| **brief** | `renderExecBrief`, type `BriefInput` | Executive markdown brief from workspace state (no model): program, health, work queue, design footprint, controls, next steps |
| **cab-export** | `exportCabPackage`, type `CabExportResult` | Filesystem CAB package for change boards: AWS plan files, remediations, proposals/tasks/deployments JSON, BRIEF.md, MANIFEST.md, optional audit.jsonl (never mutates AWS) |
| **audit** | `appendAuditEvent`, `loadAuditEvents`, types `CxAuditEvent`, `AuditDeps` | Append-only per-spec `audit.jsonl` evidence trail (kind, message, optional ref/path) |
| **journeys** | `listJourneys`, types `JourneyListItem`, `JourneyInventory` | Closed-world journey inventory from ontology pack (`default` \| `local`): stages, terminals, trigger intents |
| **catalog** | `inventoryCatalog`, types `CatalogDomain`, `CatalogKpi`, `CatalogNbaRule`, `CatalogInventory` | Closed-world catalog browser (domains/intents, KPIs, NBA rules, channels/sentiments/urgencies); strong nodes only, zero model calls |
| **health-history** | `appendHealthSample`, `loadHealthHistory`, types `HealthSample`, `HealthHistoryDeps` | Append-only per-spec `health-history.jsonl` from status polls; score rollup via `summarizeDeployments`; load last N samples |
| **archive** | `archiveCxSpec`, `restoreCxSpec` | Soft-archive: rename `.cox/cx/<name>` → `.archived-<name>` (hidden from `listCxSpecs`); restore renames back; no delete |
| **snapshot** | `snapshotCxSpec`, type `SnapshotResult` | Full program backup/handoff: CAB package + `spec.json` + optional health/audit/daemon + `SNAPSHOT.md` |
| **cfn-skeleton** | `buildCfnSkeleton` | Deterministic CloudFormation YAML + APPLY markdown from journey map (plan-only; no CreateStack) |
| **offline-adapters** | `createOfflineLocalAdapter`, `createOfflineAwsAdapter`, type `OfflineDiskDeps` | Disk-backed local (build/deploy/status/simulate/teardown) and AWS plan-only (writes `template.yaml`, `APPLY.md`) |
| **offline-artifacts** | `createOfflineArtifactsAdapter`, type `OfflineArtifactsDeps` | Deterministic / optional-generate artifacts adapter for offline runtime |
| **status** | `getStatus`, `runSimulate`, `runTeardown` | Thin capability-aware passthrough to `CxTargetAdapter` |
| **report** | `generateReport`, types `CxOpsReport`, `CxOpsReportEntry`, `ReportTarget`, `ReportDeps` | Cross-target status (+ simulate when capable); one scout-tier summary via injected `generate` |
| **nba** | `opsRecommendNba`, `parseNbaContext`, type `NbaRecommendResult` | Pure graph NBA + confidence band + next stages; CLI key=value context parse |
| **ontology** | `resolveOntologyPack`, `showOntology`, `validateOntologyPack`, `showStrongGraph`, type `OntologyPack` (`default` \| `local`), show/validate/graph result types | Closed-world catalog inventory, integrity + strong-graph stats |
| **graph-query** | `lookupStrongNode`, types `GraphHit`, `GraphQueryResult` | Closed-world strong-graph search by id/name (case-insensitive substring); top 20 matches `{id, kind, name}`; pack + limit; zero model calls |
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
board:    list_specs → load_each → rollup → emit
fleet:    list_specs → load_proposals_tasks → sort → emit
graph:    load_strong → materialize_graph → search → emit
brief:    load_workspace → render_brief → emit
cab:      load_workspace → copy_aws → copy_remediations → write_state → write_brief → emit
audit:    load_audit → append → emit  (or load_audit → emit for read)
journeys: load_ontology → list_journeys → emit
catalog:  load_strong → inventory_catalog → emit
health:   load_health_history → emit  (append on status: summarize → append_sample)
archive:  archive_spec → rename → emit
restore:  restore_spec → rename → emit
snapshot: snapshot → cab_base → copy_spec → copy_health → emit
```

`cox cx run` prints both views: `path:` via `formatPathByPhase` (phase buckets) and
`path_full:` via `formatPathAudit` (collapsed linear path).

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
| `cox cx apply` / `claim` / `tasks` / `task` | tasks (`claim` is apply alias) |
| `cox cx operate <name>` | console tick + board line for one spec |
| `cox cx board` | board (`buildOpsBoard`) |
| `cox cx fleet-status` | board + status poll each deployed spec |
| `cox cx brief <name> [outFile]` | brief (`renderExecBrief`) |
| `cox cx cab-export <name> [outDir]` | cab-export (`exportCabPackage`) |
| `cox cx audit <name> [--limit N]` | audit (`loadAuditEvents`) |
| `cox cx journeys [--pack default\|local]` | journeys (`listJourneys`) |
| `cox cx catalog [section] [--pack default\|local]` | catalog (`inventoryCatalog`); section: `all`\|`domains`\|`intents`\|`kpis`\|`nba`\|`channels` |
| `cox cx health-history <name> [--limit N]` | health-history (`loadHealthHistory`); samples written by `cox cx status` via `appendHealthSample` |
| `cox cx archive <name>` / `restore <name>` | archive (`archiveCxSpec` / `restoreCxSpec`) |
| `cox cx snapshot <name> [outDir]` | snapshot (`snapshotCxSpec`); default out `cx-snapshot/<name>` |
| `cox cx ontology *` / `nba` | ontology / nba |
| `cox cx doctor` | stack-health + ontology + workspace list |
| `cox cx teardown` | status `runTeardown` / adapter teardown + `clearDeployment` |
| `cox cx run` path lines | path-audit (`formatPathByPhase` + `formatPathAudit`) |

## Path audit display

Pure string helpers for operator-facing control-flow paths (`path: string[]`).

| API | Behavior |
|---|---|
| `formatPathAudit(path, max?)` | Join with ` -> `. Length `<= max` (default `PATH_AUDIT_DEFAULT_MAX` = 8): full path. Longer: first 3, `...`, last 3. |
| `formatPathByPhase(path)` | Bucket segments into `build` / `status` / `simulate` / `report` / `other` by keyword, collapse each bucket with `formatPathAudit(..., 6)`, join buckets with ` \| `. Empty path → `""`. |

Phase bucketing (case-insensitive substring / prefix heuristics):

| Bucket | Segment matches |
|---|---|
| `build` | `build`, `deploy`, starts with `create`, `approve`, `seed` |
| `status` | `status`, `health` |
| `simulate` | `simulat`, `traffic` |
| `report` | `report`, `nba`, `summary` |
| `other` | everything else |

CLI: multi-stage `cox cx run` uses phase view for the primary `path:` line and a longer linear collapse for `path_full:`.

## Board (fleet rollup)

`buildOpsBoard(deps: CxWorkspaceDeps): Promise<OpsBoard>`

Lists every CX spec under `cxRoot`, loads workspace + deployments + proposals + tasks + daemon meta, and returns:

- **rows** (`BoardRow`): name, idea, phase statuses (requirements/design/tasks), deployment target ids, `proposalsOpen` / `proposalsClaimed`, `tasksOpen` / `tasksDone`, `daemonRunning`, optional `daemonLastTickAt`, `updatedAt`
- **totals**: specs, proposalsOpen (open + claimed across fleet), tasksOpen, daemonsRunning, deployedSpecs
- **path**: `list_specs → load_each → rollup → emit`

Read-only. No adapter calls, no mutations.

```text
cox cx board
# CXOS board  specs=N deployed=… proposals_open=… tasks_open=… daemons=…
# <name>  [R=… D=… T=…] deps=… prop=N+Mc tasks_open=… done=… daemon=up|off
```

## Brief (executive markdown)

`renderExecBrief(input: BriefInput): string`

Pure markdown from in-memory state. No model, no network. Sections:

1. Program (idea, phases, deployment ids)
2. Health (optional `healthEntries` via `summarizeDeployments`; otherwise points at `cox cx status`)
3. Work queue (open/claimed proposals, task rollup; top 8 proposals and open tasks)
4. Design footprint (journey maps count, requirements count)
5. Controls (AWS plan-only, propose/apply human gates, task done → resolve proposal)
6. Suggested next steps (`status --live`, `console --live`, `board`, `cab-export`)

`BriefInput`: `name`, `record`, `deployments`, `proposals`, `tasks`, optional `healthEntries`, `generatedAt`.

```text
cox cx brief <name>           # print markdown
cox cx brief <name> out.md    # write file under cwd
```

## CAB export (change package)

`exportCabPackage(deps, specName, outDirRaw, cwd): Promise<CabExportResult>`

Filesystem package for human change boards. Resolves `outDir` under `cwd`. Never calls AWS APIs.

| Written | Source |
|---|---|
| `aws/template.yaml`, `APPLY.md`, `architectureDoc.json`, `agentDefinition.json` | `.cox/cx/<spec>/aws/` (optional each) |
| `remediations/*.md` | workspace remediations |
| `proposals.json`, `tasks.json`, `deployments.json` | live state + `exportedAt` |
| `BRIEF.md` | `renderExecBrief` (no health poll) |
| `MANIFEST.md` | file list + human CFN apply notes |
| `audit.jsonl` | copied when present |

Returns `{ outDir, files, path }` with path
`load_workspace → copy_aws → copy_remediations → write_state → write_brief → emit`.

CLI default out dir: `cx-cab/<name>`. Appends audit event `kind: cab_export`.

```text
cox cx cab-export <name>
cox cx cab-export <name> ./my-cab-pkg
# next: review MANIFEST.md + aws/APPLY.md (human CFN only)
```

## Audit (append-only evidence)

Per-spec log at `.cox/cx/<spec>/audit.jsonl` (one JSON object per line).

| API | Role |
|---|---|
| `appendAuditEvent(deps, event)` | Ensure spec dir; append `CxAuditEvent` (`at` defaults to `deps.now()`); returns full event |
| `loadAuditEvents(deps, specName, limit = 50)` | Parse JSONL (skip bad lines); return last `limit` events (`limit <= 0` → all); missing file → `[]` |

`CxAuditEvent`: `at`, `kind`, `specName`, `message`, optional `ref`, optional `path`.

CLI/read path is load-only. Writers elsewhere (apply, task transition, cab-export, etc.) call `appendAuditEvent` for human-gated evidence.

```text
cox cx audit <name>
cox cx audit <name> --limit 30
# <at>  <kind>  <ref|->  <message>
```

## Journeys (closed-world inventory)

`listJourneys(pack: OntologyPack = "local"): JourneyInventory`

Strong-graph only: maps `DEFAULT_ONTOLOGY` or `LOCAL_PLATFORM_ONTOLOGY` journeys to flat items. No model, no disk.

Each `JourneyListItem`: `id`, `name`, `stages` (stage ids), `terminalStages`, `triggerIntents`.

Returns `{ pack, journeys, path: ["load_ontology", "list_journeys", "emit"] }`.

```text
cox cx journeys
cox cx journeys --pack local
cox cx journeys --pack default
```

## Catalog (closed-world inventory)

`inventoryCatalog(pack: OntologyPack = "local"): CatalogInventory`

Strong nodes only (zero model calls). Resolves the ontology pack and flattens browser-friendly slices:

| Field | Contents |
|---|---|
| `domains` | id, name, intentCount, intents (`domainId.intentId`, name) |
| `kpis` | id, name, unit, description |
| `nbaRules` | id, name, priority, action, urgency, actionType |
| `channels` / `sentiments` / `urgencies` | closed enum lists from pack |
| `pack`, `version`, `source` | pack metadata |
| `path` | `load_strong → inventory_catalog → emit` |

Default pack is `local` (platform), not `default` (commercial seed).

```text
cox cx catalog
cox cx catalog domains --pack default
cox cx catalog nba
cox cx catalog kpis --pack local
# sections: all | domains | intents | kpis | nba | channels
```

## Health history (score samples)

Append-only log at `.cox/cx/<spec>/health-history.jsonl` (one `HealthSample` JSON per line).

| API | Role |
|---|---|
| `appendHealthSample(deps, specName, entries)` | `summarizeDeployments(entries)` → sample (`at`, score, healthy/degraded/down/errors/total, entries); append JSONL; returns sample |
| `loadHealthHistory(deps, specName, limit = 20)` | Parse JSONL (skip bad lines); return last `limit` samples (`limit <= 0` → all); missing file → `[]` |

Score weights match metrics-summary: healthy=100, degraded=50, down/error=0 (average over scored entries).

CLI status writes a sample after each poll. When history has more than one sample, status also prints a short score trail. Read path:

```text
cox cx status <name>              # appends sample
cox cx health-history <name>
cox cx health-history <name> --limit 50
# <at>  score=… healthy=… degraded=… down=… errors=…
```

## Archive / restore (soft hide)

Rename on disk under `cxRoot`. No delete. Dot-prefixed dirs are skipped by `listCxSpecs`, so archived programs disappear from board/list until restored.

| API | Effect | path |
|---|---|---|
| `archiveCxSpec(deps, name)` | `.cox/cx/<name>` → `.cox/cx/.archived-<name>` | `archive_spec → rename → emit` |
| `restoreCxSpec(deps, name)` | reverse; accepts bare name or `.archived-<name>` | `restore_spec → rename → emit` |

Guards: invalid names (`/`, `..`, leading `.` on active name), already archived, missing source, target already exists. Does not stop a running daemon; stop first if needed.

```text
cox cx archive <name>
# archived <name> → …/.archived-<name>
# next: cox cx restore <name>
cox cx restore <name>
```

## Snapshot (full program package)

`snapshotCxSpec(deps, specName, outDirRaw, cwd): Promise<SnapshotResult>`

Broader than CAB: builds a CAB package first, then adds program state for backup/handoff. Resolves `outDir` under `cwd`. Never calls AWS APIs.

| Written | Source |
|---|---|
| CAB contents (`aws/*`, remediations, proposals/tasks/deployments, `BRIEF.md`, `MANIFEST.md`, optional `audit.jsonl`) | `exportCabPackage` |
| `spec.json` | workspace (when present) |
| `health-history.jsonl` | workspace (optional) |
| `daemon.json`, `audit.jsonl` | workspace when present (audit may already be in CAB) |
| `SNAPSHOT.md` | note: export time + manual restore hint |

Returns `{ outDir, files, path }` with path
`snapshot → cab_base → copy_spec → copy_health → emit`.

CLI default out dir: `cx-snapshot/<name>`. Appends audit event `kind: snapshot`. Restore is manual: copy files back under `.cox/cx/<spec>/`.

```text
cox cx snapshot <name>
cox cx snapshot <name> ./my-snap
# review SNAPSHOT.md + BRIEF.md + MANIFEST.md
```

## Proposals lifecycle (human-gated)

Console/watch only **persist** proposals. No adapter mutations. Statuses:

`open` → `claimed` → `resolved` | `dismissed`

Legal edges (enforced by `isLegalProposalTransition`; same status is idempotent):

| From | To |
|---|---|
| `open` | `claimed`, `dismissed`, `resolved` |
| `claimed` | `resolved`, `dismissed`, `open` (release claim) |
| `dismissed` | `open` (reopen) |
| `resolved` | terminal |

| Command | Effect |
|---|---|
| `cox cx proposals <name>` | list open + claimed; rows show `next=apply\|resolve\|…` + CLI hint |
| `cox cx proposals <name> --all` | include resolved/dismissed |
| `cox cx proposals <name> --status <s>` | filter one status (`open`\|`claimed`\|`resolved`\|`dismissed`) |
| `cox cx proposal <name> <id> claimed` | claim for work (manual; apply also claims) |
| `cox cx proposal <name> <id> resolved` | mark done after remediation |
| `cox cx proposal <name> <id> dismissed` | drop without apply |
| `cox cx apply <name> <proposalId>` | task + remediation; proposal → `claimed` |
| `cox cx apply <name> <proposalId> --resolve` | same, proposal → `resolved` |

After default apply, CLI prints next steps:

```text
next: cox cx task <name> <taskId> in_progress
next: cox cx task <name> <taskId> done  # auto-resolves proposal
next: cox cx proposal <name> <proposalId> resolved
```

### Tasks

| Command | Effect |
|---|---|
| `cox cx tasks <name>` | rollup (`open/pending/in_progress/done/…`) + open tasks; `proposal=` + `remediation=` paths |
| `cox cx tasks <name> --all` | include done/cancelled |
| `cox cx tasks <name> --status <s>` | filter one status |
| `cox cx task <name> <id> done` | close task; default **auto-resolves** source proposal |
| `cox cx task <name> <id> done --no-resolve-source` | close task only |

### Daemon health

`cox cx daemon status <name>` prints one scannable line:

```text
daemon <name>: running|stopped pid=… ticks=last/max last=… proposals_open=N log=…
```

Product narrative and cheat sheet: [`docs/CXOS.md`](../../docs/CXOS.md)
(claim/apply/task/daemon section). Wave4 summary: [`docs/WAVE4-SUMMARY.md`](../../docs/WAVE4-SUMMARY.md).
Demo: [`examples/cx-demo/README.md`](../../examples/cx-demo/README.md).
