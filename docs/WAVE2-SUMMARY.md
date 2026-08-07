# CXOS Wave2 verify summary

**Date:** 2026-08-06  
**Branch:** `main` @ `7649243` (+ follow-up polish below)  
**Result:** All green. No push.

## Verification

| Step | Command | Result |
|---|---|---|
| (1) git status | `git status --short` | Clean for wave2 commits; polish commits follow |
| (2) cx-ops | `OPENAI_API_KEY= npm test && npm run typecheck` | 33 tests pass, tsc ok |
| (3) cli | `OPENAI_API_KEY= npm run typecheck` + vitest `cx-e2e` / `cx-runtime` (keys cleared) | 9 tests pass, tsc ok |

Wave2 land commits:

- `213197b` feat(cxos): wave2 export-aws, metrics summary, doctor live exit
- `e40803b` fix(cli): import summarizeDeployments for status summary
- `7649243` feat(cxos): daemon status detail and apply next steps

## Files changed (wave2)

| Path | Change |
|---|---|
| `packages/cli/src/commands/cx.ts` | `runCxExportAws`; status `summary score=`; doctor live/stack exit 1; path audit format |
| `packages/cli/src/main.ts` | `cx export-aws <name> [outDir]` command; pass `live` into CX context |
| `packages/cli/test/cx-e2e.test.ts` | Offline e2e for export-aws / run path (LLM keys cleared) |
| `packages/cli/test/cx-runtime.test.ts` | Doctor exit codes incl. live stack not ready |
| `packages/cx-ops/src/metrics-summary.ts` | `summarizeDeployments` health rollup + score |
| `packages/cx-ops/test/metrics-summary.test.ts` | Unit tests for rollup |
| `packages/cx-ops/src/path-audit.ts` | `formatPathAudit` collapse long paths |
| `packages/cx-ops/test/path-audit.test.ts` | Unit tests for path collapse |
| `packages/cx-ops/src/index.ts` | Re-export metrics-summary + path-audit |
| `packages/cx-ops/README.md` | Module table rows for metrics-summary / path-audit |
| `docs/CXOS.md` | Operator scripts + export-aws docs |
| `examples/cx-demo/README.md` | export-aws, operator scripts, LaunchAgents |
| `examples/cx-demo/golden-path.sh` | Uses `cx run` + export-aws |
| `.grok/workflows/enhance-cxos-wave2.rhai` | Wave2 workflow |
| `.grok/workflows/enhance-cxos-wave3.rhai` | Wave3 scaffold |

## How to use new features

### 1. Export AWS plan-only (human CFN apply)

Coxswain never CreateStacks. After a build that produced AWS artifacts:

```bash
# From monorepo root
pnpm cox cx build <spec> --target aws   # writes .cox/cx/<spec>/aws/
pnpm cox cx export-aws <spec>           # default: ./cx-export/<spec>-aws
pnpm cox cx export-aws <spec> ./out-dir # custom outDir
```

Copies `template.yaml` (required), plus `APPLY.md` and `architectureDoc.json` when present.  
Next: review `APPLY.md`, then apply with your AWS credentials.

### 2. Status summary score

```bash
pnpm cox cx status <spec>
```

Prints a one-liner:

```text
summary score: 75 (healthy=1 degraded=1 down=0 errors=0)
```

Weights: healthy=100, degraded=50, down/error=0. Score is the rounded average over scored targets.

Long `path:` lines collapse via `formatPathAudit` (first 3 + `...` + last 3 when length > 8).

### 3. Doctor live exit

```bash
pnpm cx:doctor                    # offline-friendly: ontology/wiring
pnpm cox cx doctor --live         # exit 1 if stack not ready (Ollama/platform)
pnpm cox cx doctor --auto-live    # same when hybrid/auto-live is preferred
```

With `--live`, `--auto-live`, `CX_AUTO_LIVE=1`, or mode `live`/`hybrid`, doctor returns **1** when the local stack is not ready (after still printing full doctor output).

### 4. Golden path / operator scripts

```bash
pnpm cx:stack-up                  # Ollama + platform one-shot
pnpm cox cx run <name> "idea..."  # new → approve → build → status → sim → report
pnpm cx:golden                    # demo: cx run + export-aws
pnpm cx:golden:live               # live-oriented golden path
```

macOS always-on stack:

```bash
./scripts/macos/install-launchagents.sh
```

### 5. Proposals / tasks status filters

```bash
pnpm cox cx proposals <name>                 # open + claimed
pnpm cox cx proposals <name> --all
pnpm cox cx proposals <name> --status claimed
pnpm cox cx tasks <name> --status in_progress
pnpm cox cx tasks <name> --all
```

### 6. Daemon last-tick status

```bash
pnpm cox cx daemon status <name>
# running=... pid=... lastTickAt=... lastTick=...
```

`recordDaemonLastTick` updates `daemon.json` on each watch/daemon tick when meta exists.

## Notes

- Offline tests clear `OPENAI_API_KEY` / `XAI_API_KEY` / `ANTHROPIC_API_KEY` so they never hit live LLMs.
- No remote push performed as part of this verify.
