# tui-cli — Tasks

Execute top-to-bottom. One commit per task: `ws/tui-cli: task N — <title>`.
A task is done only when `accept:` holds and `verify:` passes (paste output
into the commit body). Never edit `packages/core` or other lanes' packages.

- [x] 1. CLI skeleton: commander program, flags, exit codes
      requirements: R7.1, R7.2
      complexity: 2
      accept: all docs/00 commands + global flags registered (handlers may print "not implemented" and exit 1, except --help/--version); invalid -m tier exits 2 listing valid tiers; usage errors exit 2 via exitOverride; test/args.test.ts covers surface + exit codes by invoking the program with argv arrays.
      verify: pnpm --filter @cox/cli typecheck && pnpm --filter @cox/cli test

- [x] 2. deps.ts NotWiredError boundary
      requirements: R8.2
      complexity: 2
      accept: loadDeps dynamic-imports all 8 engine packages, runtime-checks factory presence, throws NotWiredError naming the missing package; the single permitted unknown-cast is commented; a test asserts NotWiredError for current stubs and that main.ts has no static engine imports (grep-style test over source).
      verify: pnpm --filter @cox/cli test -- deps

- [x] 3. tui scaffold: deps, jsx tsconfig, format helpers
      requirements: R1.4 (formats), R2.1 (formats)
      complexity: 2
      accept: ink/react/ink-testing-library added; tsconfig jsx react-jsx; format.ts implements formatTokens/formatUsd/formatDuration/budgetBar/cachePct per design rules with table-driven tests incl. edge cases (null cost, zero denominators, >1M tokens).
      verify: pnpm --filter @cox/tui typecheck && pnpm --filter @cox/tui test -- format

- [x] 4. Minimal App + Transcript (text path) 
      requirements: R1.1 (partial), R1.2, R1.6
      complexity: 3
      accept: startTui mounts App; user_prompt, text_delta streaming, agent_message dedupe rule, error, turn_done settle behavior render per mapping table; ink-testing-library test streams deltas then agent_message and asserts single occurrence of the text.
      verify: pnpm --filter @cox/tui test -- transcript

- [ ] 5. replay command + snapshot fold
      requirements: R5.1, R5.2, R5.3
      complexity: 3
      accept: cox replay streams fixtures/events-sample.jsonl through real App at 33ms cadence with readonly stub controller; snapshot.ts fold accumulates usage/cost; unknown event lines warn+skip; exits after drain+grace; test pumps the fixture (0ms cadence) and asserts final fold totals match the fixture's model_call_finished sums.
      verify: pnpm --filter @cox/cli test -- replay && pnpm cox replay fixtures/events-sample.jsonl

- [ ] 6. Full event mapping in Transcript
      requirements: R1.1, R1.5
      complexity: 3
      accept: all 17 AgentEvent variants render per the design table (tool transient→settled lines with ✓/✗, hook_fired incl. block stderr, spec_event, session_started, escalation, budget_alert); snapshot tests cover each variant once using fixture-style events.
      verify: pnpm --filter @cox/tui test -- transcript

- [ ] 7. RoutingAnnouncement + receipts
      requirements: R1.3, R1.4
      complexity: 2
      accept: announcement block byte-matches docs/05 §2 shape for the fixture's routing_decision (assert exact 3 lines against a literal); model_call_finished receipt line renders formats incl. cached tokens and n/a cost.
      verify: pnpm --filter @cox/tui test -- routing

- [ ] 8. StatusLine
      requirements: R2.1, R2.2, R2.3
      complexity: 2
      accept: renders mockup segments from SessionSnapshot incl. ∞ when no limit, omitted spec segment, warn/exceeded colors; App refreshes via getSnapshot() on every event (test: snapshot fn call count ≥ event count).
      verify: pnpm --filter @cox/tui test -- statusline

- [ ] 9. PermissionPrompt modal
      requirements: R3.1, R3.2
      complexity: 3
      accept: modal shows summary+scrollable detail; y/a/n/Esc map to allow/allowAlways/deny/deny; resolvePermission called exactly once; input disabled while open (stdin writes during modal produce no submitPrompt calls).
      verify: pnpm --filter @cox/tui test -- permission

- [ ] 10. Input: slash grammar, completion, interrupt
      requirements: R4.1–R4.4
      complexity: 3
      accept: non-slash → submitPrompt; valid slash → submitCommand(cmd,args) per grammar; unknown slash renders local error, controller untouched; Tab completes the six top-level commands; Esc (no modal) → interrupt().
      verify: pnpm --filter @cox/tui test -- input

- [ ] 11. Plain renderer + --print runner
      requirements: R6.1–R6.3
      complexity: 2
      accept: createPlainRenderer emits mapping-table content as plain lines (no ANSI cursor codes); print.ts wires auto-deny (default) / auto-allow (--yolo) permission policy and exit codes 0/1 by stop reason; tests capture write() lines for the fixture and assert permission + exit behavior with a scripted run.
      verify: pnpm --filter @cox/tui test -- plain && pnpm --filter @cox/cli test -- print

- [ ] 12. One-shot commands (explain/suggest)
      requirements: R9.1, R9.2
      complexity: 2
      accept: oneshot.ts routes kind:"oneshot", streams a tool-less ChatModel call, prints text, writes a LedgerEntry directly; suggest's last stdout line is the bare command; test uses an inline fake ChatModel + fake Router/Ledger (local test doubles only — no @cox/providers import).
      verify: pnpm --filter @cox/cli test -- oneshot

- [ ] 13. Composition root: wire.ts + session.ts + ledger writer
      requirements: R8.1, R8.3, R8.4
      complexity: 4
      accept: wire.ts builds the graph in design order with the route/preToolUse/postToolUse/phase-hook closures; session.ts implements submitPrompt (hook gate → steering assembly stable-first → agent.run with abort), resolvePermission bridging, history retention; ledger-writer pairs routing_decision+model_call_finished into entries and emits budget_alert on level≠ok; unit-tested with local fakes for every engine (NotWired paths untouched).
      verify: pnpm --filter @cox/cli test -- session

- [ ] 14. Command handlers: /model /context /ledger /budget, spec/steer/hook/ledger/models CLI commands
      requirements: R8.5, R11.1, R11.2, R12.1
      complexity: 3
      accept: submitCommand dispatch complete; /model auto clears override; /budget extend mutates retained budgets object (visible in next budgetState); /context panel lists docs with token weights + system size; renderLedgerTable output matches docs/05 table shape for a synthetic LedgerSummary (literal assertion); cox ledger/models print via shared renderers; steer init writes missing templates only and prompts before agent fill-in (fill-in path behind TTY check, tested via injected prompt fn).
      verify: pnpm --filter @cox/cli test -- commands && pnpm --filter @cox/tui test -- ledgertable

- [ ] 15. doctor
      requirements: R10.1
      complexity: 2
      accept: checks node/config/key-env/.cox-writability/(reachability unless --offline); ✓/✗ lines; exit 1 on any failure; tests cover pass and each failure class with temp dirs + env manipulation (no network — reachability injected as fn).
      verify: pnpm --filter @cox/cli test -- doctor

- [ ] 16. M2 integration test + NOTES.md + green sweep
      requirements: R13.1
      complexity: 3
      accept: wire.test.ts runs full-stack with MockChatModel-config when loadDeps succeeds, else prints "skipped: <NotWired msg>"; asserts event order, parsed ledger line, snapshot totals; packages/{tui,cli}/NOTES.md summarize decisions/deviations (≤1 page); full lane green.
      verify: pnpm --filter @cox/tui typecheck && pnpm --filter @cox/tui test && pnpm --filter @cox/cli typecheck && pnpm --filter @cox/cli test
