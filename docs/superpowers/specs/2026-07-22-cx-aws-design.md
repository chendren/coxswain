# cx-aws: the CXOS AWS CX-stack adapter

Date: 2026-07-22
Status: Approved (design), pending implementation plan

## Summary

`@cox/cx-aws` is the third of three `CxTargetAdapter` implementations CXOS
ships. Unlike `cx-local` (which binds to a real, live, already-running
platform), `cx-aws` targets AWS resources (Connect, Lex, Bedrock Agent)
that don't exist yet and that this package cannot itself provision —
investigation found the available AWS credentials grant no
`CreateStack`/`CreateAgent`-class permissions, and the one real, invokable
Bedrock Agent in the account (`AcmeClaw-SMB-Agent`) is an unrelated,
already-in-production resource that CXOS must not bind to or mutate.
Given that, `cx-aws` generates a correct, reviewable CloudFormation
template plus a Bedrock Agent behavior definition and writes both to
disk — a human applies the template separately with their own
appropriately-scoped credentials. No live AWS API call happens anywhere
in this package.

## Goals

- Implement `CxTargetAdapter` (`id: "aws"`) fully, against the frozen
  `@cox/cx-core` contracts.
- Generate a CloudFormation template (as a `CxArchitectureDoc`) covering
  Connect/Lex/Bedrock Agent resources for the CXOS spec's journey, via an
  injected model-call dependency, at architect tier — grounded in the
  real local omnichannel platform's own `cloudformation/main.yaml` style
  (Parameters block, nested-stack pattern) as a formatting reference.
- Generate a Bedrock Agent behavior definition (as an `AgentDefinition`)
  at builder tier — the agent's own instructions/action-groups, distinct
  from the infrastructure that would host it.
- Persist both to disk as `deploy()`'s entire job; verify their presence
  as `status()`'s entire job.
- Stay offline-testable, matching every other package in this monorepo.

## Non-goals (v1)

- No live AWS API calls of any kind — no `CreateStack`, no
  `CreateAgent`, no `InvokeAgent`. The available credentials don't
  support the first two, and the third would mean testing against
  someone's unrelated production agent.
- No `simulate()` — there's no live stack to inject traffic into.
  `capabilities()` omits it; calling it throws, same reasoning as
  `cx-artifacts`.
- No autonomous remediation — no live resource to remediate.
- Applying the generated template is explicitly a human's job with their
  own credentials, outside this package's scope.

## Architecture

```
packages/cx-aws/
  src/
    template.ts  CloudFormation template generation (prompt + parse)
    agent.ts     Bedrock AgentDefinition generation (prompt + parse)
    disk.ts      deploy()/status()/teardown() file I/O
    adapter.ts   createAwsAdapter(deps): CxTargetAdapter
    index.ts
```

Imports only `@cox/core` and `@cox/cx-core` — no AWS SDK, no
CloudFormation-writing library, since this package never calls AWS.

### `template.ts`

`deps.generate(prompt, "architect")` — infrastructure design is the
highest-judgment call this package makes, hence architect tier (matching
`cx-artifacts`'s tier assignment for its own design-phase artifacts). The
prompt references Connect/Lex/Bedrock Agent resource types and shows the
real platform's `main.yaml` Parameters-block/nested-stack style as a
formatting example. Response parses into a `CxArchitectureDoc`
(`title` = short stack description, `markdown` = the full YAML template
as text). Malformed response throws `CxAdapterError(phase: "build",
retryable: false)`.

### `agent.ts`

`deps.generate(prompt, "builder")` — mechanical derivation from the
template's declared resources, not novel design. Produces an
`AgentDefinition` (`systemPrompt` = agent instructions tailored to the
spec's journey, `tools` = the action-group names implied by the
template). Same error handling as `template.ts`.

### `disk.ts` / `adapter.ts`

`deploy()` writes both artifacts to `.cox/cx/<specName>/aws/artifacts/*`
— mirrors `cx-artifacts`'s `disk.ts` pattern exactly (one
`CxDeploymentResource` per file, `retryable: true` on I/O failure).
`status()` re-reads `dep.resources` and checks file presence —
`healthy`/`degraded`/`down`, same as `cx-artifacts`. `teardown()` deletes
the local files only — never calls `DeleteStack`, since nothing was ever
deployed to AWS. `simulate()` is not a declared capability;
`capabilities()` returns `["build", "deploy", "status", "teardown"]`.

## Error handling

- `deps.generate()` failures propagate unwrapped.
- Malformed template/agent-definition response → `CxAdapterError(phase:
  "build", retryable: false)`.
- Disk I/O failures → `CxAdapterError(retryable: true)`, `phase`
  matching the method.
- `simulate()` → `CxAdapterError(phase: "simulate", retryable: false)`.

## Testing (offline)

- `test/template.test.ts`: scripted `deps.generate` stub — prompt
  references the real resource types and platform style; valid response
  parses into `CxArchitectureDoc`; malformed response throws.
- `test/agent.test.ts`: same shape, for the `AgentDefinition` call.
- `test/disk.test.ts`: `fs.mkdtemp`-based write/read/remove round-trip,
  mirroring `cx-artifacts`'s `disk.ts` tests.
- `test/adapter.test.ts`: full `plan()→build()→deploy()→status()→
  teardown()` round trip; a test confirming `capabilities()` omits
  `"simulate"` and calling it throws.
