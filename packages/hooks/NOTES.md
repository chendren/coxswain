# @cox/hooks — notes for the integrator

Implements `HookEngine` (`createHookEngine`) and `createFileWatcher` per
`docs/specs/steering-hooks/{requirements,design}.md`. All 28 requirement
ids (R5.1–R11.5) are covered by tests; see `test/coverage.test.ts` for the
automated sweep.

## Sanctioned dependency addition: `yaml`

docs/04-CONVENTIONS.md's allowlist names only `picomatch` for this package.
`yaml` is also a runtime dependency, needed to parse `.cox/hooks/*.md`
agent-hook front matter — design.md explicitly calls this out as a required,
sanctioned addition ("`yaml` is required for agent hook front matter —
record this in NOTES.md"). `src/config.ts` contains a **local duplicate**
of `@cox/steering`'s `parseFrontMatter` (design.md forbids importing
`@cox/steering` — packages only import `@cox/core`). If the front-matter
algorithm ever changes, update both copies.

## Block semantics — integration contract for the CLI/agent wiring

`HookEngine.fire()` never itself blocks anything — it runs every matching
hook and returns every outcome, in execution order (R10.2). **The caller
decides what a `block` outcome means for the event it fired.** Recommended
handling, matching design.md:

- `PreToolUse` block → skip the tool call; feed `outcome.stderr` back to the
  model as the tool's result (as an error) so it can adjust.
- `UserPromptSubmit` block → reject the prompt; show `outcome.stderr` to the
  user instead of sending anything to the model.
- `PreModelCall` block → cancel the model call for this turn.
- Any outcome (`continue` or `block`) may carry `output.tierOverride`; when
  multiple `PreModelCall` outcomes carry one, use the **last** — outcome
  order is execution order, so "last" is well-defined (R10.3).
- Other events (`PostToolUse`, `PostModelCall`, `SessionStart`,
  `SpecPhaseChange`, `TaskComplete`, `Stop`, `SessionEnd`) are
  notification-style; a `block` outcome there has no defined effect in this
  spec pack — treat it as `continue` (log the stderr) unless a later spec
  says otherwise.

Load-time warnings (malformed `hooks.json`, unparseable `.cox/hooks/*.md`)
are surfaced as ordinary `continue` outcomes with `hook` set to the
offending file's path, prepended once to the very next `fire()` call after
they're discovered (R10.4) — the caller doesn't need any special handling
for these beyond normal `continue`/`block` dispatch.

## Watcher fallback caveat

`createFileWatcher` tries `fs.watch(cwd, { recursive: true })` first. On
platforms that throw `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` (older Linux
kernels, mainly), it falls back to a **non-recursive** watch of `cwd`
itself. In fallback mode, `fileSave` hooks only ever see changes to files
**directly in `cwd`** — a save inside any subdirectory is invisible to the
watcher until this is revisited (e.g. with a recursive-directory-walk
polyfill or per-directory watchers). This is a known, accepted v1
limitation per design.md, not a bug. `agentHooks()`/`createHookEngine`
still work fine on such platforms; only the *automatic* fileSave trigger
is degraded — `cox hook run` (manual trigger) is unaffected.

## Test-infra note: mocking Node builtins in this vitest setup

`vi.spyOn(builtinModule, "fn")` throws `Cannot redefine property` for both
`node:child_process`'s `spawn` and `node:fs`'s `watch` in this repo's
vitest setup. Use `vi.mock("node:child_process" | "node:fs", async () => {
const actual = await vi.importActual(...); return { ...actual, fn: (...) =>
{...} }; })` instead — see `test/exec.test.ts` and `test/watcher.test.ts`
for the pattern (a `vi.hoisted()`-declared flag lets one specific test arm
non-default behavior without affecting the rest of the file).
