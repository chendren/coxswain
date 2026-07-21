# Conventions (all workstreams)

## Toolchain

- Node ≥ 20 (repo developed on 23), **pnpm** workspaces, TypeScript 5.6+,
  **vitest** for tests, `tsx` as the dev runtime (`pnpm cox` runs the CLI).
- ESM everywhere (`"type": "module"`). `moduleResolution: "bundler"` — write
  relative imports **without** file extensions in new code (core uses `.js`
  extensions; both resolve fine — do not "fix" existing imports).
- No build step in v1: packages export TypeScript source directly
  (`"main": "src/index.ts"`); `tsx` executes it. Bundling is a v2 concern.
- Strict mode is on, including `noUncheckedIndexedAccess` — index access
  yields `T | undefined`; handle it.

## Dependencies (allowlist)

| Package | Allowed runtime deps |
|---|---|
| core | zod (already there — frozen) |
| providers | `@anthropic-ai/sdk`; plain `fetch` for openai-compat (no openai sdk) |
| router, ledger, spec, steering, tools | none beyond `@cox/core` (node builtins fine) |
| steering | exception: `yaml` for front matter, `picomatch` for globs |
| hooks | exception: `picomatch`; watcher uses `node:fs` `watch` (no chokidar in v1) |
| agent | none beyond `@cox/core` |
| tui | `ink@^5`, `react@^18` |
| cli | `commander@^12` |

Zod usage is **v3 API** (`z.object`, `.default()`, `safeParse`) — do not use
zod v4 idioms.

## Code style

- Match `packages/core` style: named exports, no default exports, no classes
  where a closure-factory does (`createRouter(deps): Router`), interfaces
  from core — never redeclared locally.
- Comments only for constraints code can't express (see core for the bar).
  No banner comments, no changelog comments.
- Errors: `throw new Error("edit: old_string matched 3 times in src/x.ts — must match exactly once")`
  — actionable, includes the operand. No custom error class hierarchies in v1.
- Async: `AbortSignal` threaded through anything that awaits network or
  subprocesses. No floating promises (`void x()` is banned; await or return).
- Filesystem: `node:fs/promises` in engines; sync fs only in config loading
  and CLI startup. All paths absolute internally; `cwd` passed explicitly —
  never `process.cwd()` outside `@cox/cli`.

## Testing

- `pnpm --filter @cox/<pkg> test` runs vitest; `--passWithNoTests` is set on
  stubs — remove it once you add your first test.
- Test names reference requirement ids: `it("R2.1: falls back to next model on 429", ...)`.
- No network, no real API keys, no `~/.cox` writes in tests — use `mktemp`
  dirs (`fs.mkdtemp`) and the mock model. Tests must pass with zero env vars.
- Determinism: inject clocks (`now: () => string` dep) where timestamps land
  in persisted output.

## Git

- Branch per workstream: `ws/providers`, `ws/router-ledger`, etc.
- Commit per task: `ws/providers: task 3 — anthropic streaming adapter`.
- Never commit: `.cox/ledger.jsonl`, `node_modules`, `.env`, transcripts.

## Security & safety (binding)

- Command hooks and bash tool run user-configured shell commands — that's
  by design — but: bash tool must enforce `permissions.allowBash`/`denyBash`
  prefix rules **before** the permission prompt; hooks get a hard timeout
  (default 30s) and their stdout/stderr are captured, never inherited.
- Never send file contents to any endpoint except the configured provider
  base URLs. No telemetry of any kind in v1.
- API keys only from env vars named in config; never logged, never in
  ledger entries, never in error messages.
- Path safety: `edit`/`write` tools resolve paths and refuse targets outside
  `cwd` unless the user explicitly approves via permission prompt
  (`summary` must then say "OUTSIDE PROJECT").

## Docs each package maintains

- `packages/<pkg>/NOTES.md` — decisions/deviations for the integrator.
- Checked-off `docs/specs/<ws>/tasks.md` — the progress ledger for humans.
