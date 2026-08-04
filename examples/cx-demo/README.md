# CXOS demo (graph-node operating loop)

End-to-end Customer Experience Operating System flow using **strong-graph**
adapters. Default is fully offline (no live AWS or platform required).

## Offline (always works)

```bash
pnpm cox cx doctor
pnpm cox cx ontology validate
pnpm cox cx ontology graph

pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
pnpm cox cx build billing-dispute --target all

pnpm cox cx status billing-dispute
pnpm cox cx simulate billing-dispute --target local
pnpm cox cx report billing-dispute
pnpm cox cx console billing-dispute   # poll + gated NBA proposals (no mutations)
pnpm cox cx nba journey=churn_prevention stage=cancel_requested confidence=0.9

pnpm cox cx teardown billing-dispute
```

Artifacts land under `.cox/cx/billing-dispute/`.

## Hybrid / live (when available)

```bash
# Prefer live models + platform if healthy; fall back offline per target
pnpm cox cx build billing-dispute --live --target all

# Or force hybrid with explicit platform URL (default http://127.0.0.1:3143)
pnpm cox cx build billing-dispute --mode hybrid --base-url http://127.0.0.1:3143
```

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
