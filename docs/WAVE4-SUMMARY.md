# CXOS Wave4 — operate loop

**Date:** 2026-08-06  
**Branch:** `main`  
**Focus:** human-gated claim/apply/task close-out + daemon health

## Delivered

| Lane | Change |
|---|---|
| Proposal edges | `isLegalProposalTransition` enforces open→claimed\|dismissed\|resolved, claimed→resolved\|dismissed\|open, dismissed→open, resolved terminal |
| Suggested next | `suggestedProposalNext` + list rows show `next=apply\|resolve\|…` and concrete CLI lines |
| apply --resolve | Default **claimed**; `--resolve` marks proposal **resolved** after task + remediation |
| Task board | `summarizeTasks` rollup on `cox cx tasks`; rows show `proposal=` + `remediation=` path |
| Task done | Default **auto-resolves** source proposal; `--no-resolve-source` to skip |
| Console | After persist: `next: cox cx apply <spec> <prop_…>` per new proposal |
| Daemon health | One line: `running pid ticks last/max proposals_open log=` |

## Operator flow

```bash
pnpm cox cx console <spec> --live
pnpm cox cx proposals <spec>              # next=apply + apply command
pnpm cox cx apply <spec> <proposalId>     # → task + claimed
pnpm cox cx apply <spec> <id> --resolve   # → task + resolved
pnpm cox cx tasks <spec>                  # rollup + remediation paths
pnpm cox cx task <spec> <taskId> done     # resolves linked proposal
pnpm cox cx daemon status <spec>          # health line
```

## Illegal transitions

```text
resolved → anything else   # error
claimed → open             # allowed (release claim)
dismissed → open           # reopen
```

## Tests

- cx-ops: proposal edges, apply resolve, task done auto-resolve, `summarizeTasks`
- CLI offline e2e / runtime unchanged green

## Workflow

`.grok/workflows/enhance-cxos-wave4.rhai` — parallel map/build/verify lanes.
