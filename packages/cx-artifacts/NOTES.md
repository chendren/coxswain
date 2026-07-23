# cx-artifacts NOTES

Decisions and deviations for the integrator.

- `build(plan: CxBuildPlan)` has no access to the original `CxSpec` (the
  frozen contract only passes the plan). `plan()` renders
  `spec.requirements` into each `CxBuildStep.description`; `build()` reads
  that field instead. Tier-per-kind is re-derived from the same
  `ARTIFACT_STEP_SPECS` table `plan()` used, keyed by
  `producesArtifactKind` — not carried on the plan itself.
- `deps.generate` is the only way this package reaches a model — never
  import `@cox/agent`/`@cox/router`/`@cox/providers` directly. The real
  implementation is wired in by `@cox/cli` (a future lane); tests inject a
  scripted stub.
- `AgentDefinition` is deliberately not generated here — left to
  `cx-local`/`cx-aws`, which tailor an agent config to their own runtime.
- `simulate()` throws — a document factory has no traffic to run against.
  `capabilities()` omits it.
