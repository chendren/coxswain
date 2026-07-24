# cx-aws NOTES

Decisions and deviations for the integrator.

- This package makes NO live AWS API calls, anywhere. Investigation
  during design found the available AWS credentials grant no
  CreateStack/CreateAgent-class permission, and the one real invokable
  Bedrock Agent in the account is an unrelated, already-in-production
  resource CXOS must not bind to. `deploy()` only writes files to disk;
  `teardown()` only deletes them. A human applies the generated
  CloudFormation template separately with their own credentials.
- `build(plan: CxBuildPlan)` has no access to the original `CxSpec` —
  `plan()` embeds `spec.design.journeyMaps[0]` into every
  `CxBuildStep.description`; `build()` reads it back out. Tier-per-kind
  is re-derived from `AWS_STEP_SPECS`, keyed by `producesArtifactKind`.
- `deps.generate` is the only way this package reaches a model — never
  import `@cox/agent`/`@cox/router`/`@cox/providers` directly.
- `simulate()` throws — there is no live stack to inject traffic into.
  `capabilities()` omits it.
