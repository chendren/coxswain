# Contributing to Coxswain

Thanks for helping improve Coxswain (`cox`) and the CX OS layer (`cox cx`).
This guide covers setup, hard product rules, and how we take pull requests.

By participating, you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## What lives here

| Layer | Role |
|---|---|
| **Coxswain** | Spec-driven coding agent: router, ledger, agent loop, steering, hooks, TUI |
| **CX OS** | Closed-world CX build + operate (`@cox/cx-*`): catalog, program, observe, operate, fleet, govern |

Companion fleet workspaces (programs, not the engine):

- [chendren/CXOS](https://github.com/chendren/CXOS) - domain-agnostic fleet workspace
- [chendren/TelcoCXOS](https://github.com/chendren/TelcoCXOS) - telco vertical demo

Engine and package changes belong in **this** repo.

## Prerequisites

- **Node.js** >= 20
- **pnpm** 10.x (repo pins `packageManager` in root `package.json`)
- macOS or Linux (Windows is not a first-class target yet)

## Fork and install

```bash
# 1. Fork on GitHub, then clone your fork
git clone git@github.com:<your-user>/coxswain.git
cd coxswain

# 2. Add upstream (optional but recommended)
git remote add upstream git@github.com:chendren/coxswain.git

# 3. Install workspace deps
pnpm install
```

## Build, typecheck, test

```bash
pnpm build        # build all packages + ESM import fixup
pnpm typecheck    # recursive typecheck (prebuilds @cox/core and @cox/cx-core)
pnpm test         # recursive package tests (no network, no API keys required)
```

Filter a single package while iterating:

```bash
pnpm --filter @cox/<pkg> typecheck
pnpm --filter @cox/<pkg> test
```

Full local CI-shaped check:

```bash
pnpm ci           # build && typecheck && test
```

## Offline golden path (required for CX-facing changes)

Prove the offline demo still works without cloud credentials:

```bash
pnpm cx:golden:ci
```

This runs `examples/cx-demo/golden-path.sh` (CI-friendly offline path). Prefer
it over live modes when validating operate/build/catalog work.

Optional live smoke (needs keys / stack; not required for most PRs):

```bash
pnpm cx:golden:live
```

## Development CLI

```bash
pnpm cox --help
pnpm cox doctor --offline
pnpm cox models
pnpm cox replay fixtures/events-sample.jsonl
```

Do not commit:

- `node_modules/`, `.env`, API keys
- `.cox/ledger.jsonl`, session transcripts, local daemon PID/state
- Personal machine paths or secrets

## Import law (enforced architecture)

Packages keep a strict dependency graph. Violations will be rejected in review.

1. **`@cox/core` is frozen contracts.** Do not edit `packages/core` unless the
   PR is an intentional, reviewed contract change with migration notes.
2. **Library packages** may import `@cox/core` and their own declared runtime
   deps only (see `docs/04-CONVENTIONS.md`).
3. **`cx-*` packages** may import `@cox/core` and `@cox/cx-core` (plus their
   own listed deps). They must **not** import other `@cox/*` packages.
4. **`@cox/cli` is the sole composition root.** Only the CLI package wires
   packages together. Never introduce a new cross-package import edge to
   "make it work" from a library package.

If a contract is wrong, document it in `INTEGRATION-NOTES.md` rather than
working around the graph with sneaky imports.

## Hard product rules (non-negotiable)

These are brand and safety constraints, not style preferences:

1. **No silent production mutation.** Operate/console/watch paths propose only.
   Apply is human-gated (claim / task / note). Never auto-mutate prod state.
2. **AWS is plan-only.** Emit `template.yaml` + `APPLY.md`. Humans apply
   CloudFormation with their own credentials.
3. **Never `CreateStack`** (or any live CloudFormation mutate API) from
   Coxswain code paths.
4. **Offline-first.** Default adapters and demos work without keys or cloud.
   Live/hybrid is opt-in when stack and keys are ready.
5. **Strong graph first.** Prefer closed ontology / pure matching for control
   planes. Models generate only where generation is explicitly allowed.
6. **Import law** (above): CLI sole composition root; `cx-*` limited to
   `@cox/core` + `@cox/cx-core`.

PRs that weaken these rules need explicit design discussion in the PR body.

## Code and test expectations

- TypeScript, ESM, named exports (match `packages/core` style).
- Comments only for constraints the code cannot express.
- Actionable error messages with the operand that failed.
- Thread `AbortSignal` through network and subprocess work.
- Tests: no network, no real API keys, no `~/.cox` writes. Use temp dirs and
  mocks. Prefer requirement ids in test names when a spec exists.
- Package-level `NOTES.md` for decisions/deviations when you change behavior.

See `docs/04-CONVENTIONS.md` and `AGENTS.md` for the full builder rules.

## Pull requests

1. Branch from `main` with a short descriptive name
   (e.g. `fix/router-budget`, `feat/cx-pack-travel`).
2. Keep the change focused. Prefer small PRs over multi-concern dumps.
3. Ensure green: `pnpm build`, `pnpm typecheck`, `pnpm test`.
4. For CX OS surface changes, also run `pnpm cx:golden:ci`.
5. Fill out the PR template (what / why / how tested / hard-rule impact).
6. Link related issues.
7. One logical change set per PR when possible.

Reviewers look for:

- Import law and hard rules preserved
- Tests for new behavior and regressions
- No secrets or personal paths
- Clear user-facing impact in the summary

## Commit messages (Conventional Commits)

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(optional-scope): <short summary>

[optional body]

[optional footer]
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`,
`perf`, `build`.

Examples:

```text
feat(router): announce savings vs all-architect baseline
fix(cx-aws): refuse CreateStack paths in plan export
docs: add offline golden path to CONTRIBUTING
test(cli): assert doctor --offline without API key
```

Breaking changes: use `!` after type/scope or a `BREAKING CHANGE:` footer.

## Security

Do **not** open public issues for vulnerabilities. Follow
[SECURITY.md](./SECURITY.md): GitHub Security Advisories (private) or private
contact to [@chendren](https://github.com/chendren).

## Support

See [SUPPORT.md](./SUPPORT.md) for where to ask questions and file bugs.

## License

Contributions are licensed under the [Apache License 2.0](./LICENSE).
Unless you state otherwise, any contribution intentionally submitted for
inclusion is under the same license without additional terms.
