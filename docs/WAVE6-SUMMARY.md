# WAVE6 — Graph Console operate + proofs (2026-08-12)

## path[]

```
load_catalog → route_lane → generate_weak → absorb(grok)
  → validate_closed → emit
```

Scope **A** (approved): L1 queue human-gate + L2 proofs + L3 CXOS serve surface.  
L4 polish deferred (empty-state + CLI columns shipped inside L1).  
L5 package-split refused.

## Lanes

| Lane | Status | Notes |
|------|--------|-------|
| L1 operate UI | **done** | `apiProposalAction` claim=`applyProposal`, dismiss=`transitionProposal`; POST `/console/queue/action`; JSON `/api/proposal/action` |
| L2 proofs | **done** | CDN audit, path-audit, serve smoke (port 0) |
| L3 CXOS surface | **done** | `cx:serve`, FLEET-COMMANDS Graph Console section, README |
| L4 polish | **done** | evidence `<details>` drawer (path/NBA), empty fleet/queue UX copy, fleet day band via `healthBand`, statusTone chips |

## L4 (follow-on)

| Item | Detail |
|------|--------|
| Evidence drawer | Expand proposal summary → path, NBA rule/action, target |
| Queue empty | UX copy + seed-operate / Autopilot links |
| Fleet empty | init / quickstart copy from CX-CONSOLE-UX |
| Day band | `fleetHealthScore` → `healthBand` on fleet cards |
| Queue path fields | `QueueProposalItem.path` / `pathDisplay` from proposal |

## Verify

```
pnpm --filter @cox/cx-console test   # 53 passed (L4)
pnpm --filter @cox/cx-ops test       # 141 passed
pnpm --filter @cox/cx-console typecheck
```

## Product rules held

- Human submit required for claim/dismiss  
- Claim creates task + remediation (same as CLI claim/apply)  
- No CreateStack / no adapter prod mutation  
- Localhost offline cathedral (no external assets)  
- Actor: form / `CX_ACTOR` / default `console-local`

## Try

```bash
cd ~/coxswain
pnpm cox cx serve --port 8787
# open http://127.0.0.1:8787/console/queue
# or from CXOS: pnpm cx:serve -- --port 8787
```
