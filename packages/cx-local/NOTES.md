# cx-local NOTES

Decisions and deviations for the integrator.

- The real platform (`/Users/chadhendren/Projects/cx-platform/omnichannel-cx-platform`)
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
