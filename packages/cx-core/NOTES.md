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
