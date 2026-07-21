# steering-hooks — Requirements

Workstream: `@cox/steering` (SteeringStore) + `@cox/hooks` (HookEngine, file watcher).
Contracts: `SteeringDoc`, `SteeringSelection`, `SteeringStore`, `HookEventName`,
`HookPayload`, `CommandHookConfig`, `AgentHookConfig`, `HookOutcome`, `HookEngine`
in `packages/core/src/types.ts` (frozen). Config fields: `config.steering.*`,
`config.hooks.enabled`.

Requirement ids are `R<story>.<criterion>`. Every id must be referenced by at
least one test name.

## Story 1 — Load steering docs

As a user, I keep persistent project context in `.cox/steering/*.md` so the
agent is steered without me repeating myself.

- **R1.1** WHEN `loadAll(cwd)` runs and `.cox/steering/` contains `*.md` files,
  THE SYSTEM SHALL return one `SteeringDoc` per file with `name` = file stem,
  `path` = absolute path, `body` = content after front matter, and
  `tokens` = `ceil(body.length / 4)`.
- **R1.2** WHEN a file starts with a YAML front matter block delimited by
  `---` lines, THE SYSTEM SHALL read `inclusion` and `fileMatchPattern` from
  it and exclude the block from `body`.
- **R1.3** IF a file has no front matter block, THEN THE SYSTEM SHALL default
  `inclusion` to `"always"` with the whole file as `body`.
- **R1.4** IF front matter fails to parse as YAML or `inclusion` holds an
  unknown value, THEN THE SYSTEM SHALL treat the doc as `inclusion: "always"`
  with the full raw file content as `body` (nothing silently dropped).
- **R1.5** IF `inclusion` is `"fileMatch"` and `fileMatchPattern` is missing
  or empty, THEN THE SYSTEM SHALL downgrade the doc to `inclusion: "manual"`.
- **R1.6** IF `.cox/steering/` does not exist, THEN `loadAll` SHALL return
  only compat imports (R2) without throwing.
- **R1.7** WHERE files other than top-level `*.md` exist under
  `.cox/steering/` (subdirectories, other extensions), THE SYSTEM SHALL
  ignore them.

## Story 2 — Compatibility imports

As a user migrating from Claude Code / Copilot / other agents, my existing
instruction files keep working.

- **R2.1** WHILE `config.steering.importCompat` is true, `loadAll` SHALL also
  import `CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md` from
  `cwd` (when present) as docs with `imported: true`, `inclusion: "always"`,
  and `name` = `"CLAUDE"`, `"AGENTS"`, `"copilot-instructions"` respectively.
- **R2.2** IF `CLAUDE.md` and `AGENTS.md` have byte-identical content, THEN
  THE SYSTEM SHALL import only `CLAUDE.md`.
- **R2.3** WHILE `config.steering.importCompat` is false, THE SYSTEM SHALL
  import none of the compat files.

## Story 3 — Deterministic selection

As the cli's prompt assembler, I need a stable, cache-friendly doc selection.

- **R3.1** WHEN `select(docs, touchedFiles, manualNames)` runs, `systemDocs`
  SHALL contain exactly the `inclusion: "always"` docs, ordered:
  non-imported sorted by `name`, then imported sorted by `name` (byte-stable
  across calls with the same inputs, per docs/01 cache discipline).
- **R3.2** WHEN any `touchedFiles` entry matches a fileMatch doc's
  `fileMatchPattern` (picomatch, `dot: true`, patterns and paths relative to
  cwd with leading `./` stripped), THE SYSTEM SHALL include that doc in
  `contextDocs`.
- **R3.3** WHEN `manualNames` contains the `name` of an `inclusion: "manual"`
  doc, THE SYSTEM SHALL include it in `contextDocs`; names that match no
  manual doc SHALL be ignored without error.
- **R3.4** `contextDocs` SHALL be ordered fileMatch-selected first then
  manual-selected, each group sorted by `name`, with no duplicates.
- **R3.5** `totalTokens` SHALL equal the sum of `tokens` over
  `systemDocs` + `contextDocs`.

## Story 4 — Token-weight visibility

As a frugality-conscious user, oversized steering must be visible, never
silently expensive.

- **R4.1** WHEN `steeringWarnings(selection, warnTokens)` is called and a
  selected doc's `tokens` > `warnTokens`, THE SYSTEM SHALL return a warning
  string naming the doc and its token count.
- **R4.2** WHEN `selection.totalTokens` > `2 × warnTokens`, THE SYSTEM SHALL
  return an additional total-weight warning string.
- **R4.3** Oversized docs SHALL still be included in the selection (warn,
  don't drop).
- **R4.4** THE SYSTEM SHALL export `STEERING_TEMPLATES` constants for
  `product`, `tech`, and `structure` matching the skeletons in design.md, so
  cli's `cox steer init` can write them.

## Story 5 — Command hook configuration

As a user, I configure shell hooks in `hooks.json` at user and project level.

- **R5.1** WHEN the engine loads, THE SYSTEM SHALL read command hooks from
  `~/.cox/hooks.json` then `.cox/hooks.json` (project), concatenated
  user-first.
- **R5.2** IF a hooks file is missing, THEN it contributes no hooks and no
  error.
- **R5.3** IF a hooks file contains malformed JSON or an entry with an
  unknown `event`, THEN THE SYSTEM SHALL skip the file/entry and surface a
  warning outcome on the next `fire()` only (R10.4).

## Story 6 — Agent hooks (Kiro-style automations)

As a user, I define prompt automations in `.cox/hooks/*.md`.

- **R6.1** WHEN `agentHooks()` is called, THE SYSTEM SHALL return one
  `AgentHookConfig` per parseable `.cox/hooks/*.md` with `name` = file stem,
  `prompt` = trimmed body, `tier` from front matter defaulting to `"scout"`.
- **R6.2** IF `trigger.type` is `fileSave` without a non-empty `pattern`, or
  the body is empty, or `tier` is not a valid `Tier`, THEN THE SYSTEM SHALL
  skip the file and record a load warning (surfaced per R10.4).
- **R6.3** WHERE front matter declares `trigger: { type: manual }` (or
  equivalent YAML), THE SYSTEM SHALL return it with a manual trigger.

## Story 7 — Hook matching

- **R7.1** WHEN `fire(payload)` runs, THE SYSTEM SHALL select command hooks
  whose `event` equals `payload.event`.
- **R7.2** WHERE `payload.event` is `PreToolUse` or `PostToolUse`, a hook's
  `matcher` SHALL be applied as a regex against
  `String(payload.data.toolName ?? "")`; `"*"` or absent matches all.
- **R7.3** WHERE the event is any other `HookEventName`, `matcher` SHALL be
  ignored.
- **R7.4** IF `matcher` is an invalid regex, THEN THE SYSTEM SHALL skip that
  hook and include a `continue` outcome whose `stderr` names the bad pattern.

## Story 8 — Hook execution semantics

- **R8.1** WHEN a selected hook runs, THE SYSTEM SHALL spawn
  `$SHELL -c <command>` (from injected `env.SHELL`, fallback `/bin/sh`) with
  `cwd = payload.cwd`, write `JSON.stringify(payload)` to stdin, and capture
  stdout/stderr without inheriting stdio.
- **R8.2** WHEN the process exits 0, the outcome SHALL be
  `action: "continue"`; IF trimmed stdout parses as a JSON object, THEN it
  SHALL be attached as `outcome.output`, with `output.tierOverride` kept only
  when it is a valid `Tier`.
- **R8.3** WHEN the process exits 2, the outcome SHALL be
  `action: "block"` with captured stderr.
- **R8.4** WHEN the process exits with any other code, the outcome SHALL be
  `action: "continue"` with stderr attached (warning).
- **R8.5** Hooks SHALL run sequentially in configuration order (user file
  order first, then project).

## Story 9 — Safety limits

- **R9.1** WHEN a hook exceeds `timeoutMs` (default 30_000), THE SYSTEM SHALL
  SIGKILL it and produce `action: "continue"` with a timeout message in
  `stderr` — a timeout SHALL never block.
- **R9.2** IF spawning fails (e.g. shell missing), THEN the outcome SHALL be
  `action: "continue"` with the error in `stderr`.
- **R9.3** Captured stdout and stderr SHALL each be truncated at 1 MiB.
- **R9.4** THE SYSTEM SHALL never interpolate payload data into the command
  string; the payload reaches hooks via stdin only.

## Story 10 — fire() aggregation

- **R10.1** WHILE `config.hooks.enabled` is false, `fire()` SHALL return `[]`
  without spawning anything.
- **R10.2** `fire()` SHALL run all matching hooks and return every outcome in
  execution order (callers decide that any `block` blocks).
- **R10.3** WHERE multiple `PreModelCall` outcomes carry
  `output.tierOverride`, consumers use the last one; THE SYSTEM SHALL
  preserve outcome order to make that well-defined.
- **R10.4** WHEN configuration load recorded warnings (R5.3, R6.2), THE
  SYSTEM SHALL prepend them once as `continue` outcomes to the first `fire()`
  result after load, then clear them.

## Story 11 — File watcher for agent hooks

- **R11.1** WHEN `createFileWatcher` starts, THE SYSTEM SHALL watch `cwd`
  recursively where supported, falling back to non-recursive top-level watch
  on platforms that throw.
- **R11.2** WHEN a watched file changes and matches a `fileSave` hook's
  `pattern` (picomatch, `dot: true`, cwd-relative path), THE SYSTEM SHALL
  call `onTrigger(hook, relativePath)` at most once per 500ms per
  (hook, file) pair (trailing-edge debounce).
- **R11.3** THE SYSTEM SHALL ignore events under `.git/`, `node_modules/`,
  and `.cox/`, and events for paths that no longer exist.
- **R11.4** WHEN `close()` is called, THE SYSTEM SHALL stop all watchers and
  cancel pending debounced triggers.
- **R11.5** Manual-trigger hooks SHALL never fire from the watcher.
