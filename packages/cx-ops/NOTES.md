# cx-ops NOTES

- Import law: only `@cox/core` and `@cox/cx-core`. Adapters are injected;
  never import `@cox/cx-artifacts` / `cx-local` / `cx-aws`.
- v1 is **commands-only** (design 2026-07-24): no watcher, no autonomous
  mode, no rollback.
- Graph-node practice: ops surfaces that touch vocabulary (NBA recommend,
  ontology show/validate/graph) are pure strong-graph operations with zero
  model calls. Only `generateReport` summary uses scout-tier `deps.generate`
  after structured status/simulate aggregation.
- Intent router for ops: each command declares which adapter capabilities
  it needs before calling adapters (`runSimulate` checks `"simulate"`).
