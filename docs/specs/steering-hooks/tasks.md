# steering-hooks — Tasks

Execute strictly top to bottom. One commit per task:
`ws/steering-hooks: task N — <title>`. A task is done only when `verify`
passes; paste its output into the commit body. Complexity dogfoods our
routing scale (1–2 scout-able, 3 builder).

## @cox/steering

- [x] 1. Steering package scaffolding + front matter parser
      requirements: R1.2, R1.4
      complexity: 2
      accept: `yaml` + `picomatch` added to @cox/steering deps; `--passWithNoTests` removed; `parseFrontMatter` handles: valid block, no block, unclosed block, invalid YAML (returns data:null + full raw body), CRLF delimiters.
      verify: pnpm --filter @cox/steering typecheck && pnpm --filter @cox/steering test

- [x] 2. loadAll for .cox/steering docs
      requirements: R1.1, R1.3, R1.5, R1.6, R1.7
      complexity: 2
      accept: mkdtemp fixtures cover: stem/path/tokens mapping (tokens = ceil(body chars / 4)); default inclusion; fileMatch-without-pattern → manual; missing dir → no throw; subdirs and non-.md ignored.
      verify: pnpm --filter @cox/steering test -- load

- [x] 3. Compat imports (CLAUDE.md / AGENTS.md / copilot-instructions.md)
      requirements: R2.1, R2.2, R2.3
      complexity: 2
      accept: imported docs carry imported:true, inclusion always, names per design; byte-identical CLAUDE/AGENTS dedupes to CLAUDE only; importCompat:false imports nothing; front matter in imported files is left in body untouched.
      verify: pnpm --filter @cox/steering test -- load

- [x] 4. select(): deterministic systemDocs ordering
      requirements: R3.1
      complexity: 2
      accept: non-imported always docs sorted by name precede imported sorted by name; two calls with identical inputs produce byte-identical concatenated bodies (test joins bodies and compares strings).
      verify: pnpm --filter @cox/steering test -- select

- [x] 5. select(): fileMatch + manual contextDocs and totalTokens
      requirements: R3.2, R3.3, R3.4, R3.5
      complexity: 2
      accept: picomatch with dot:true; leading "./" stripped from touched paths; unknown manualNames ignored; ordering fileMatch-then-manual each name-sorted; dedupe by path; totalTokens = sum over both arrays (table test).
      verify: pnpm --filter @cox/steering test -- select

- [x] 6. steeringWarnings helper + STEERING_TEMPLATES
      requirements: R4.1, R4.2, R4.3, R4.4
      complexity: 1
      accept: per-doc and total warnings exactly per design thresholds; oversized docs still present in selection; templates export all three keys, each starting with `---\ninclusion: always\n---` and containing the design's section headings.
      verify: pnpm --filter @cox/steering test -- warnings

- [x] 7. Steering coverage sweep + export surface
      requirements: R1.1–R4.4
      complexity: 1
      accept: every R1–R4 id appears in ≥1 test name; src/index.ts exports exactly createSteeringStore, steeringWarnings, STEERING_TEMPLATES (grep the file in the test).
      verify: pnpm --filter @cox/steering typecheck && pnpm --filter @cox/steering test

## @cox/hooks

- [x] 8. Hook config loading (hooks.json, user then project)
      requirements: R5.1, R5.2, R5.3
      complexity: 2
      accept: user hooks precede project hooks; missing files silent; malformed JSON and unknown-event entries skipped with recorded load warnings; user path resolved from injected env.HOME (tests never read real ~); `yaml`+`picomatch` deps added, `--passWithNoTests` removed.
      verify: pnpm --filter @cox/hooks test -- config

- [x] 9. Agent hook parsing (.cox/hooks/*.md)
      requirements: R6.1, R6.2, R6.3
      complexity: 2
      accept: name=stem, prompt=trimmed body, tier defaults scout; fileSave requires pattern else skipped+warning; invalid tier skipped+warning; empty body skipped+warning; manual trigger parsed; agentHooks() returns configs without firing anything.
      verify: pnpm --filter @cox/hooks test -- config

- [x] 10. Matcher selection table
      requirements: R7.1, R7.2, R7.3, R7.4
      complexity: 2
      accept: table test over (event, matcher, toolName): exact-event match; regex applied only on PreToolUse/PostToolUse; "*"/absent match all; matcher ignored on other events; invalid regex → skipped with continue+stderr outcome naming the pattern.
      verify: pnpm --filter @cox/hooks test -- matcher

- [x] 11. Command execution + exit-code semantics
      requirements: R8.1, R8.2, R8.3, R8.4, R8.5
      complexity: 3
      accept: real /bin/sh spawns (env injected {SHELL:"/bin/sh"}); stdin receives payload JSON (echo-back test with `cat`); exit 0 → continue with stdout JSON object attached and non-Tier tierOverride stripped while other keys survive; exit 2 → block with stderr; exit 3 → continue with stderr; sequential execution order preserved in outcomes.
      verify: pnpm --filter @cox/hooks test -- exec

- [x] 12. Timeout, spawn errors, output caps
      requirements: R9.1, R9.2, R9.3, R9.4
      complexity: 3
      accept: `sleep 5` with timeoutMs:200 SIGKILLed, outcome continue with timeout stderr, test completes <1s; bogus shell path → continue+stderr; stdout/stderr truncated at 1 MiB with marker; command string built without payload interpolation (assert spawn args exactly ["-c", command]).
      verify: pnpm --filter @cox/hooks test -- exec

- [x] 13. fire() aggregation + enabled flag + first-fire load warnings
      requirements: R10.1, R10.2, R10.3, R10.4
      complexity: 2
      accept: hooks.enabled:false → [] and zero spawns (spy on child_process); all matching hooks run even after a block; outcome order = execution order; load warnings appear once on first fire only.
      verify: pnpm --filter @cox/hooks test

- [ ] 14. createFileWatcher (debounced fileSave triggers)
      requirements: R11.1, R11.2, R11.3, R11.4, R11.5
      complexity: 3
      accept: recursive watch with documented fallback on ERR_FEATURE_UNAVAILABLE_ON_PLATFORM (capability probe + describe.skip guard); picomatch dot:true on cwd-relative paths; .git/node_modules/.cox ignored; deleted paths skipped; 500ms trailing debounce collapses rapid writes to one trigger (poll-based assertions, 2s deadline); manual hooks never trigger; close() cancels pending debounces (no trigger after close).
      verify: pnpm --filter @cox/hooks test -- watcher

- [ ] 15. NOTES.md + full green
      requirements: R1.1–R11.5
      complexity: 1
      accept: packages/steering/NOTES.md and packages/hooks/NOTES.md written (≤1 page each: yaml-dep sanction for hooks, block-semantics integration notes for cli, watcher fallback caveat); both packages typecheck + all tests green from a clean `pnpm install`.
      verify: pnpm --filter @cox/steering typecheck && pnpm --filter @cox/steering test && pnpm --filter @cox/hooks typecheck && pnpm --filter @cox/hooks test
