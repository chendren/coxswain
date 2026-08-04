# cx-core NOTES

Decisions and deviations for the integrator.

- `CxSpec` composes over `@cox/core`'s existing `SpecState`/`SpecEngine`
  rather than widening those frozen contracts — the "cx" spec kind reuses
  the same phase state machine at runtime. See design.md.
- `CxOpsEvent` is a cx-core-owned typed union; `@cox/core`'s `AgentEvent`
  only knows about the generic `cx_event` escape hatch (task 1). Use
  `toAgentEvent()` to bridge.
- `CxAdapterError` follows `@cox/providers`'s `providerError()` pattern:
  a plain `Error` with extra properties, no class hierarchy.
- `createMockTargetAdapter()` ships from the main barrel (`src/index.ts`),
  not a test-only subpath — the design doc's "test exports" phrasing
  notwithstanding. This is deliberate: every downstream lane's own test
  suite imports it directly, so it's public API, not an internal helper.
- Closed-world CXOS taxonomies live in `src/ontology/` as `DEFAULT_ONTOLOGY`
  (seeded from cx-intelligence-slm) plus merge packs like
  `LOCAL_PLATFORM_ONTOLOGY`. Adapters must not hardcode journey/KPI/intent
  vocabularies; they import lists from the ontology. Model calls may select
  within the ontology; pure evaluators (`matchNbaRules`, `nextStages`,
  `confidenceBand`) decide deterministically.
