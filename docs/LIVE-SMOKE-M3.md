# Optional live smoke (M3)

Offline is the **default** product path. Live model and platform checks are **optional** and do not block install, demos, workshops, or CI.

This document is the M3 checklist for people who have API keys or a local stack and want to exercise paid/live paths.

## Prerequisites

| Need | Purpose |
|---|---|
| Node ≥ 20, pnpm | Same as offline |
| `ANTHROPIC_API_KEY` and/or OpenAI-compat keys | Live model tiers |
| Optional: Ollama + local models | Zero-dollar local tiers |
| Optional: omnichannel platform on `CX_LOCAL_BASE_URL` | Live local bind |

```bash
cd coxswain
pnpm install
pnpm build
export ANTHROPIC_API_KEY=sk-ant-...   # if using Anthropic tiers
# optional:
# export OLLAMA_BASE_URL=http://127.0.0.1:11434
# export CX_LOCAL_BASE_URL=http://127.0.0.1:3143
# ./scripts/cx-stack-up.sh
```

## Coding agent smoke (classic M3)

With keys present:

```bash
pnpm cox doctor                 # keys + optional reachability
pnpm cox explain "git rebase --onto"
pnpm cox --print "add a zero-divide guard comment to README" --yolo
pnpm cox models
pnpm cox ledger                 # after a few calls: tier mix + savings
```

Spec flow against the demo project (when wired):

```bash
pnpm cox --cwd examples/demo-project spec new safe-divide "guard division by zero"
# approve → design → tasks → run as documented in README agent section
```

**Pass criteria:** routing announcements appear, ledger records calls, no crash. Cost should show scout/builder mix when routing works.

## CX OS live / hybrid smoke

```bash
pnpm cox cx doctor --live
# exit 1 if stack not ready is expected; full output still prints

pnpm cox --cwd /tmp/cx-live-demo cx run live-billing \
  "reduce dispute handle time" --target all --mode hybrid

pnpm cox --cwd /tmp/cx-live-demo cx board
pnpm cox --cwd /tmp/cx-live-demo cx console live-billing
# console proposes only — never mutates prod
```

**Pass criteria:** doctor prints ollama/platform lines; hybrid falls back offline when stack down; liveMutation stays 0 on AWS plan target; no CreateStack.

## What live is not

- Not required for CI (golden path is offline)
- Not a silent production mutator
- Not CreateStack / UpdateStack from Coxswain
- Not a substitute for human CAB apply of `template.yaml` + `APPLY.md`

## Troubleshooting

| Symptom | Fix |
|---|---|
| doctor fails offline | Report a bug: offline must pass without keys |
| doctor live exits 1 | Expected when platform/ollama not ready |
| hybrid still offline adapters | No keys / platform probe failed: intentional fallback |
| high cost | Use scout-heavy config or Ollama tiers; set budgets |

## Related

- Offline quickstart: [README](../README.md)
- Operator runbook: [CXOS-OPERATOR-RUNBOOK.md](./CXOS-OPERATOR-RUNBOOK.md)
- Hard rules tests: `packages/cx-ops/test/hard-rules.test.ts`
