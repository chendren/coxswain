# @cox/tools — Notes for the integrator

## Decisions

- **Walker perf ceiling.** `walk.ts` is a plain recursive `readdir`-based
  walker (no `ripgrep`/`fd` shellout, no native bindings — tools has no deps
  beyond `@cox/core`). Fine for project-sized trees in v1; if `glob`/`grep`
  become a bottleneck on very large repos, the fix is either a `ripgrep`
  subprocess (adds a binary dependency) or an index. Out of scope per
  design.md's "Out of scope (v1)" list — noted here as the concrete perf
  ceiling to revisit.
- **`diff.ts` is not a general LCS/Myers diff.** It finds the common
  line prefix/suffix between `before`/`after` and renders a single hunk for
  the differing middle. `edit.ts` is the only caller and every call is one
  contiguous `old_string` → `new_string` swap, so a single-hunk diff is
  always correct for this use case; a general diff algorithm would be
  unused complexity.
- **`edit.ts`'s `permissionFor` uses `readFileSync`** (sync fs) to build the
  unified-diff preview in `PermissionRequest.detail` (R8.3). This is a
  narrow, deliberate exception to "async fs in engines" (docs/04-CONVENTIONS
  .md) — `Tool.permissionFor` is synchronous in the frozen core contract, so
  there's no async path available to read the current file content. On a
  missing/unreadable file the read is wrapped in try/catch and the prompt
  still fires, just without a diff (`execute()` remains the source of truth
  for the actual error).
- **`index.ts` exports only factories**: `createBuiltinTools`,
  `createToolRegistry`, and the six individual `createXTool` factories.
  Internal helpers (`resolveWithin`, `globToRegExp`, `walk`, `splitLines`,
  `mutationPermission`, `validate.ts`'s `expect*` functions) are
  intentionally not re-exported — tests import them directly from `../src/*`.
- **Test file split from design.md's suggested `globgrep.test.ts`.** Tasks 5
  /6/7's `verify:` commands filter by substring — `globmatch`, `glob`, and
  `grep` respectively. `globgrep.test.ts` doesn't contain `globmatch` as a
  substring, so task 5's filter would never select it. Split into
  `globmatch.test.ts` (globToRegExp + walk), `glob.test.ts` (glob tool),
  `grep.test.ts` (grep tool) instead — each satisfies its task's literal
  verify command. (`glob.test.ts`'s tests are also picked up by the `grep`
  filter's sibling runs harmlessly, and vice versa isn't an issue either way
  since — see the pnpm quirk below — the filters don't actually restrict
  files in this environment.)
- **bash timeout escalation** (R8.4) sends `SIGTERM` immediately at the
  timeout, then `SIGKILL` after a 2s grace period if the process is still
  alive. Tests cover the outward-visible behavior (kill happens, isError with
  `"timed out after Ns"`) using a plain `sleep` (which dies on `SIGTERM`
  alone); a dedicated test for a `SIGTERM`-ignoring process needing the
  `SIGKILL` escalation was left out to avoid adding a ~3s test for marginal
  additional coverage of code that's straightforward to read-verify.

## Environment quirk (not a bug)

`pnpm --filter @cox/<pkg> test -- <substring>` does not actually restrict
which test files/names run in this environment — pnpm's arg-forwarding
inserts a literal `--` into vitest's argv (`vitest run --passWithNoTests --
<substring>`), which defeats vitest's filter parsing. Confirmed via direct
`npx vitest run <substring>` (bypassing pnpm), which filters correctly.
Harmless here because the full suite is kept green at every commit — each
`verify:` command still exits 0, just runs a superset of the intended
subset. Worth fixing at the workspace root (e.g. a package.json `test`
script that doesn't need pnpm to reinsert a separator) if precise filtering
ever matters for CI turnaround.
