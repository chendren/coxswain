# CXOS backlog shipped (recommended order)

Date: 2026-08-08

| # | Item | Status | Surface |
|---|---|---|---|
| 1 | Operator identity + audit | done | `--actor` / `CX_ACTOR`; claimedBy/closedBy; audit.actor |
| 2 | Seeded operate drill | done | `cox cx seed-operate <name>` |
| 3 | Webhook notify | done | `CX_WEBHOOK_URL` on proposal open + health score drop |
| 4 | Install story | done | `scripts/install-cox.sh` → `~/.local/bin/cox` |
| 5 | Read-only AWS drift | done | `cox cx aws-drift <name>` (optional live describe-stacks) |
| 6 | Shared board storage | done | `sync-export` / `sync-import` JSON handoff |
| + | Task evidence (verify-back) | done | `task … done --evidence "…"` |
| + | Deploy history | done | `deploy-history` + auto on build |
| + | Multi-env root | done | `CX_ENV=stage` → `.cox/cx-stage` |
| + | Incident one-shot | done | `cox cx incident <name>` |

Still out of scope by design: CreateStack, silent prod mutation, multi-writer realtime DB.
