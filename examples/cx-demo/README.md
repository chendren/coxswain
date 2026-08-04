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

## Hybrid / live (platform on :3143)

```bash
# Start Nexus CX platform (separate repo)
cd ~/Projects/cx-platform/omnichannel-cx-platform && npm start

# Hybrid: live local (deterministic bind) + offline artifacts/aws without API keys
pnpm cox cx doctor --live --base-url http://127.0.0.1:3143
pnpm cox cx build billing-dispute --live --base-url http://127.0.0.1:3143 --target all
pnpm cox cx status billing-dispute --live --base-url http://127.0.0.1:3143
pnpm cox cx simulate billing-dispute --live --target local
pnpm cox cx console billing-dispute --live
pnpm cox cx watch billing-dispute --ticks 3 --interval 2000 --live
pnpm cox cx proposals billing-dispute
pnpm cox cx proposal billing-dispute prop_… resolved
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
