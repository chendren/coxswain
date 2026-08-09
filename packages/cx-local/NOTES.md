# cx-local NOTES

Decisions and deviations for the integrator.

- The real platform (`$CX_PLATFORM_DIR (default: ~/Projects/cx-platform/omnichannel-cx-platform)`)
  has NO write API for journey/NBA-rule definitions — they are static,
  code-defined config. This adapter never mutates the platform; it binds
  a CXOS spec's neutral journey to the closest matching one of the
  platform's 13 fixed journey types, records the binding, and operates
  by observing real metrics and injecting real synthetic traffic via
  `POST /api/events/batch`.
- `CxDesignDoc` (frozen in `@cox/cx-core`) has no `kpiFrame` field —
  `build()` generates its own `KpiFrame` via `deps.generate()` rather
  than reading one off `spec.design`.
- `simulate()` has a genuine side effect: injected synthetic events land
  in the platform's real live SQLite store. `teardown()` cannot retract
  them — it only removes this adapter's own local disk artifacts.
- `deps.generate` and `deps.baseUrl` are the only ways this package
  reaches a model or the platform — never import `@cox/agent`/
  `@cox/router`/`@cox/providers` directly, and never hardcode a URL.
- Journey and KPI closed sets come from `@cox/cx-core` ontology
  (`LOCAL_PLATFORM_ONTOLOGY` / `DEFAULT_ONTOLOGY`). `JOURNEY_TYPE_KEYS`
  is the deployable platform subset (5 commercial + 8 treasury pack);
  `REAL_KPI_KEYS` is the platform dashboard subset of ontology KPIs.
  Both assert membership at module load so adapters cannot drift.
- `kpiPrompt()` constrains generated KPI metric names to `REAL_KPI_KEYS`.
  The platform's `/api/dashboard/kpis` response only ever uses those
  scalar keys, so without this constraint `simulate()`'s `kpis[m.name]`
  lookup would silently miss for model-invented names and report
  `achieved: 0`.
- `status()` reports a simplified `level: "healthy"` — a disk-existence
  check plus a hit against the platform's general `/api/health/ready`
  endpoint — rather than the full healthy/degraded/down semantics keyed
  off journey-specific activity that the original design sketch
  described. This is a known, deliberate simplification, not a bug.
