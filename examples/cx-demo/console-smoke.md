# Graph Console offline smoke

Validates Wave6 Graph Console end-to-end without API keys:

1. `cx doctor` (offline)
2. `cx new` + approve (when needed)
3. `cx seed-operate --force` (open proposals)
4. `startConsoleServer` on ephemeral port
5. `GET /api/health`, `/console/fleet`, `/console/queue`
6. `GET /api/proposal/action?action=claim` (same engine as CLI claim)

## Run

```bash
# from monorepo root
pnpm cx:console:smoke
# or
bash examples/cx-demo/console-smoke.sh
```

Keep workspace for inspection:

```bash
CX_SMOKE_KEEP=1 CX_CWD=/tmp/cx-console-keep bash examples/cx-demo/console-smoke.sh
```

## CI

`.github/workflows/ci.yml` runs `@cox/cx-console` tests (includes proof suite) and this smoke after the offline golden path.

## Hard rules

- No CreateStack / live AWS
- Claim is human-gated engine path (applyProposal); smoke automates the HTTP form the UI would submit
- Offline cathedral: no external page assets
