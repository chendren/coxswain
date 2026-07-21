# steering-hooks — Design

Two packages, no coupling between them. Both import types from `@cox/core`
only. Neither imports `@cox/agent` — agent-hook *execution* is cli's job;
this workstream only parses configs and detects triggers.

## Package `@cox/steering`

### Files

```
src/index.ts        re-exports: createSteeringStore, steeringWarnings, STEERING_TEMPLATES
src/frontmatter.ts  parseFrontMatter(raw): { data: Record<string, unknown> | null; body: string }
src/store.ts        createSteeringStore + loadAll/select implementation
src/templates.ts    STEERING_TEMPLATES constant
test/frontmatter.test.ts
test/load.test.ts
test/select.test.ts
test/warnings.test.ts
```

### Dependencies

`yaml` (front matter), `picomatch` (globs), node builtins. Nothing else.
Add both to `package.json` dependencies; remove `--passWithNoTests` from the
test script when the first test lands (docs/04).

### Factory

```ts
export function createSteeringStore(deps: { config: CoxConfig }): SteeringStore;
```

### `parseFrontMatter(raw)`

- Front matter exists iff the file starts with `---\n` (or `---\r\n`) and a
  closing `---` line follows. Parse the enclosed text with `yaml.parse`.
- Returns `{ data, body }`; on parse failure returns
  `{ data: null, body: raw }` (R1.4 — caller treats as always/full body).

### `loadAll(cwd)` algorithm

1. `readdir` `${cwd}/.cox/steering` (ENOENT → `[]`), keep top-level `*.md`.
2. Per file: `parseFrontMatter`; resolve `inclusion` (`always` default;
   unknown → `always`; `fileMatch` without pattern → `manual` per R1.5);
   `tokens = Math.ceil(body.length / 4)`; `imported: false`.
3. Compat imports (R2), when `deps.config.steering.importCompat`:
   `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md` from `cwd`;
   `imported: true`, `inclusion: "always"`, names `CLAUDE` / `AGENTS` /
   `copilot-instructions`; front matter is NOT parsed for imports (whole file
   is body); skip `AGENTS.md` when byte-identical to `CLAUDE.md`.
4. Return steering docs then imports (stable order; `select` re-sorts anyway).

### `select(docs, touchedFiles, manualNames)` algorithm

- `systemDocs`: `inclusion === "always"`, partitioned `imported:false` first
  then `imported:true`, each partition sorted by `name` (`localeCompare` with
  `"en"` to stay deterministic).
- `contextDocs`: (a) fileMatch docs where
  `picomatch(pattern, { dot: true })` matches any normalized touched path
  (strip leading `./`); (b) manual docs whose `name ∈ manualNames`. Order
  (a)-sorted-by-name then (b)-sorted-by-name; drop duplicates by `path`.
- `totalTokens`: sum over both arrays.
- Pure function of its inputs — no fs access in `select`.

### Warnings (frozen types untouched)

```ts
export function steeringWarnings(
  selection: SteeringSelection,
  warnTokens: number, // pass config.steering.warnTokens
): string[];
```

Per-doc warning when `doc.tokens > warnTokens`
(`steering doc "tech" is ~3.1k tokens (warn threshold 2k)`); total warning
when `selection.totalTokens > 2 * warnTokens`. cli calls this after every
selection and emits the strings as `{type:"error"}`-free info via its own
event choice (integration note for WS6 — likely rendered dim in transcript
and `/context`).

### `STEERING_TEMPLATES`

```ts
export const STEERING_TEMPLATES: Record<"product" | "tech" | "structure", string>;
```

Each template = front matter `---\ninclusion: always\n---\n` + skeleton:

- `product`: `# Product` — Purpose / Users / Core capabilities / Non-goals
  (bulleted prompts to fill, one line of guidance each).
- `tech`: `# Tech` — Languages & runtime / Frameworks & key dependencies /
  Commands (build, test, run) / Conventions.
- `structure`: `# Structure` — Directory layout / Key modules / Data flow /
  Where new code goes.

cli's `cox steer init` writes these files then optionally runs an
architect-tier agent task to fill them (not this workstream).

## Package `@cox/hooks`

### Files

```
src/index.ts        re-exports: createHookEngine, createFileWatcher
src/config.ts       lazy loader for hooks.json files + .cox/hooks/*.md (uses @cox/steering-style front matter parsing — DUPLICATE the ~20-line parser locally; do not import @cox/steering)
src/engine.ts       createHookEngine: matching + spawning + outcome mapping
src/watcher.ts      createFileWatcher
test/config.test.ts
test/matcher.test.ts
test/exec.test.ts
test/watcher.test.ts
```

### Dependencies

`picomatch` + node builtins (`node:child_process`, `node:fs`,
`node:fs/promises`, `node:path`, `node:os`). YAML front matter for agent
hooks: reuse `yaml` — add it as a dependency here too (allowed: design lists
it; docs/04's table names picomatch for hooks, `yaml` is required for agent
hook front matter — record this in NOTES.md as a sanctioned addition).

### Factories

```ts
export function createHookEngine(deps: {
  cwd: string;
  config: CoxConfig;
  env?: NodeJS.ProcessEnv; // default process.env; tests inject { SHELL: "/bin/sh" }
}): HookEngine;

export function createFileWatcher(opts: {
  cwd: string;
  hooks: AgentHookConfig[];
  onTrigger: (hook: AgentHookConfig, file: string) => void;
}): { close(): void };
```

### Config loading (lazy, cached)

- On first `fire()`/`agentHooks()`: read `~/.cox/hooks.json` then
  `${cwd}/.cox/hooks.json`. Shape: `{ "hooks": CommandHookConfig[] }`.
  Concatenate user-first (R5.1). Entry validation: `event` must be one of the
  ten `HookEventName`s; else skip entry + warning.
- `.cox/hooks/*.md`: front matter →
  `trigger: fileSave` + `pattern` | `manual`; `tier` default `"scout"`,
  must be a `Tier`; body → `prompt` (trimmed, non-empty). Violations skip the
  file + warning (R6.2).
- Load warnings accumulate in a private array; the next `fire()` prepends
  them as `{ hook: <file path>, action: "continue", stderr: <message> }`
  outcomes and clears the array (R10.4).

### `fire(payload)` flow

```
if (!config.hooks.enabled) return [];
outcomes = drainLoadWarnings();
for hook of commandHooks where hook.event === payload.event:
  if (payload.event is PreToolUse|PostToolUse) and matcher not "*"/absent:
    compile regex once per fire (cache per engine by pattern);
    invalid → outcomes.push(warning), continue;
    test against String(payload.data.toolName ?? ""); no match → skip
  outcomes.push(await runOne(hook, payload))
return outcomes
```

`runOne`: `spawn(shell, ["-c", hook.command], { cwd: payload.cwd, env,
stdio: ["pipe","pipe","pipe"] })`; write payload JSON + `\n`, end stdin
(ignore EPIPE); collect stdout/stderr capped at 1 MiB (truncate, append
`…[truncated]`); race a `timeoutMs ?? 30_000` timer → `kill("SIGKILL")` →
timeout outcome (R9.1). Exit-code mapping per R8.2–R8.4; stdout JSON parse:
`JSON.parse(trimmed)` in try/catch, must be a plain object;
`tierOverride` kept only if `"scout"|"builder"|"architect"`, else deleted
(rest of the object preserved). `outcome.hook` = the command string; for
load warnings = the file path.

Block semantics: engine returns everything; **callers** (cli/agent wiring)
treat "any block" as blocked. Document in NOTES.md for the integrator:
PreToolUse block → skip tool, feed stderr to model; UserPromptSubmit block →
reject prompt with message; PreModelCall block → cancel call.

### Watcher

- Try `fs.watch(cwd, { recursive: true })`; on
  `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM` fall back to non-recursive watch of
  `cwd` (limitation logged to NOTES.md, fine for v1).
- On event: build cwd-relative path; ignore if any segment is `.git`,
  `node_modules`, `.cox`, or `existsSync` fails; for each `fileSave` hook
  whose picomatch matcher (compiled once at startup, `dot: true`) matches:
  trailing-edge debounce 500ms keyed `hook.name + "\0" + relPath`, then
  `onTrigger(hook, relPath)`.
- `close()`: close the `FSWatcher`, `clearTimeout` all pending debounces.

### Testing notes

- Exec tests use real spawns of `/bin/sh` one-liners (`printf`, `exit 2`,
  `sleep 5` with `timeoutMs: 200`, `cat` to echo stdin payload back —
  asserting the payload JSON round-trips). Keep timeout tests < 1s.
- Watcher tests: mkdtemp, write files, await trigger with a 2s polling
  deadline; wrap in a capability probe — if recursive watch throws at setup,
  `describe.skip` the recursive cases (R11.1 fallback still tested).
- Matcher tests are a table: (event, matcher, toolName) → selected?
- No test touches the real `~/.cox` (point the engine at a temp HOME via
  injected env — resolve the user hooks path from `env.HOME ?? os.homedir()`;
  document this resolution rule in code).

## Requirement → module map

| Reqs | Module |
|---|---|
| R1.*, R2.* | steering/src/store.ts, frontmatter.ts |
| R3.* | steering/src/store.ts (select) |
| R4.* | steering/src/{store,templates}.ts |
| R5.*, R6.* | hooks/src/config.ts |
| R7.*, R8.*, R9.*, R10.* | hooks/src/engine.ts |
| R11.* | hooks/src/watcher.ts |
