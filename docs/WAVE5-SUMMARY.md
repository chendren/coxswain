# Wave5 — Qwen-driven enhancement rounds (2026-08-12)

Two orchestrated rounds using local `qwen3-coder-next:q8_0` (Grok plan/verify, Qwen draft, Grok integrate).

## Round 1 — CXOS fleet workspace (companion repo)

| Item | Result |
|------|--------|
| `scripts/cox.mjs` | Dist-first CLI entry, tsx fallback, clear `COXSWAIN_ROOT` errors (exit 2) |
| `package.json` | v0.1.0, `type: module`, engines node≥20, 30 `cx:*` script aliases |
| `docs/FLEET-COMMANDS.md` | Operator cheatsheet (golden path, operate, fleet, govern, hard rules) |
| README | Common commands + link to fleet cheatsheet; doctor `--mode offline` |

Verified: `cx list`, missing-root exit 2, proxy help.

## Round 2 — vertical pack offline tests (engine monorepo)

| Package | Tests |
|---------|-------|
| `@cox/cx-pack-registry` | 7 (detect/score/list/isTelcoIdea + threshold behavior) |
| `@cox/cx-pack-retail` | 3 (journey/arch/provenance/unique ids) |
| `@cox/cx-pack-financial` | 3 |
| `@cox/cx-pack-healthcare` | 4 (+ no SSN/email PHI patterns in seed JSON) |
| `@cox/cx-pack-travel` | 3 |

**Total:** 20 tests, all green (`pnpm --filter "@cox/cx-pack-*" test`).

Registry note: `detectPack` requires score ≥ 0.3 (typically 2+ keyword hits). Tests document weak single-keyword ideas falling to `default`.

## Non-goals this wave

- Live CreateStack / prod mutation
- Public OSS launch ops
- Windows packaging
