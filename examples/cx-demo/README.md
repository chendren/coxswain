# CXOS demo (offline graph-node loop)

End-to-end Customer Experience Operating System flow using **strong-graph**
adapters (no live AWS or platform required).

## Run from monorepo root

```bash
# inventory closed world
pnpm cox cx ontology validate
pnpm cox cx ontology graph

# create + gate + multi-target build
pnpm cox cx new billing-dispute "reduce dispute handle time"
pnpm cox cx approve billing-dispute requirements
pnpm cox cx build billing-dispute --target all

# operate
pnpm cox cx status billing-dispute
pnpm cox cx simulate billing-dispute --target local
pnpm cox cx report billing-dispute
pnpm cox cx nba journey=billing_dispute stage=under_review confidence=0.8

# cleanup
pnpm cox cx teardown billing-dispute
```

Artifacts land under `.cox/cx/billing-dispute/`.

## Graph path

```
create_spec → approve → plan/build/deploy(artifacts)
  → merge_design → plan/build/deploy(local,aws)
  → status → simulate → report+nba
```
