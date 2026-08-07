let meta = #{
    name: "enhance-cxos-wave3",
    description: "Wave 3 parallel CXOS: operate loop, graph UX, daemon, docs, verification",
    when_to_use: "After wave2 (export-aws, LaunchAgents, metrics, doctor live exit)",
    phases: [
        #{ title: "Map", detail: "gap analysis vs current CXOS surface" },
        #{ title: "Build", detail: "parallel implementation lanes" },
        #{ title: "Verify", detail: "tests smoke and docs sync" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read-only map of " + root + " CXOS after wave2. Read docs/CXOS.md, packages/cli/src/commands/cx.ts (exports and doctor/status/export-aws/run), packages/cx-ops/src/index.ts, packages/cx-ops/README.md, examples/cx-demo/, scripts/macos/. List 6 concrete remaining operator gaps ranked by value. Prefer: proposal claim UX, task dashboard, graph path pretty-print, daemon health line, offline fixtures, docs drift. Return markdown only. Use tools (read_file, grep, list_dir) before answering.",
    #{ label: "map:gaps", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

// Lane A: proposal claim + list filters polish
let p_a = "In " + root + " enhance CXOS proposals UX: ";
p_a += "(1) Ensure cox cx proposals <name> --all works and claim/resolve/dismiss transitions are documented in packages/cx-ops/README.md and examples/cx-demo/README.md. ";
p_a += "(2) If missing, add --status filter passthrough consistency. ";
p_a += "(3) On apply success, print next: cox cx task and cox cx proposal resolved. ";
p_a += "TypeScript only; no em dashes. Do not push. Use read_file/grep first.";
jobs.push(#{
    prompt: p_a,
    label: "build:proposals-ux",
    capability_mode: "all",
});

// Lane B: status/report graph path readability
let p_b = "In " + root + " improve path audit readability for operators: ";
p_b += "(1) Add a small pure helper in packages/cx-ops (e.g. formatPathAudit(path: string[], max?: number)) that collapses long path arrays to first 3 + last 3 with ellipsis when length > 8, else join with ' -> '. ";
p_b += "(2) Unit test. (3) Optionally use it in runCxStatus or runCxReport path lines in packages/cli/src/commands/cx.ts. ";
p_b += "Export from index. No em dashes. Do not push.";
jobs.push(#{
    prompt: p_b,
    label: "build:path-format",
    capability_mode: "all",
});

// Lane C: daemon status enrichment
let p_c = "In " + root + " enhance runCxDaemonStatus / daemon meta: ";
p_c += "(1) When printing daemon status, include last tick time, running bool, pid, and log path if present. ";
p_c += "(2) If not running, print next: cox cx daemon start <name>. ";
p_c += "(3) Touch packages/cli/src/commands/cx.ts and any daemon types in cx-ops only as needed. ";
p_c += "No em dashes. Do not push.";
jobs.push(#{
    prompt: p_c,
    label: "build:daemon-status",
    capability_mode: "all",
});

// Lane D: package scripts + demo README sync
let p_d = "In " + root + " sync operator docs with wave2 features: ";
p_d += "(1) examples/cx-demo/README.md: document pnpm cx:doctor, cx:stack-up, cx:run, cx:golden, export-aws, LaunchAgents install. ";
p_d += "(2) packages/cx-ops/README.md: mention metrics-summary and summarizeDeployments. ";
p_d += "(3) Keep short; no em dashes. Do not invent flags that do not exist (verify with grep). Do not push.";
jobs.push(#{
    prompt: p_d,
    label: "build:docs-sync",
    capability_mode: "all",
});

// Lane E: export-aws + doctor regression test polish
let p_e = "In " + root + " packages/cli/test: ";
p_e += "(1) Ensure OPENAI/XAI/ANTHROPIC keys cleared in beforeAll for cx-e2e and cx-runtime. ";
p_e += "(2) Ensure export-aws e2e asserts AWSTemplateFormatVersion after offline build. ";
p_e += "(3) If doctor live exit-1 is untested, add a tiny unit-level test only if cheap (mock probe is hard; skip mock if needed). ";
p_e += "Run vitest with env cleared. Fix failures. No em dashes. Do not push.";
jobs.push(#{
    prompt: p_e,
    label: "build:test-polish",
    capability_mode: "all",
});

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["proposals-ux", "path-format", "daemon-status", "docs-sync", "test-polish"];
for r in results {
    if r != () && r.success {
        ok += 1;
        labels.push(names[i] + ":ok");
    } else {
        fail += 1;
        labels.push(names[i] + ":fail");
    }
    i += 1;
}
log("build " + ok.to_string() + "/" + results.len().to_string());

phase("Verify");
let vprompt = "In " + root + " verify wave3: ";
vprompt += "(1) git status --short (2) cd packages/cx-ops && OPENAI_API_KEY= npm test && npm run typecheck ";
vprompt += "(3) cd packages/cli && OPENAI_API_KEY= npm run typecheck && ";
vprompt += "OPENAI_API_KEY= XAI_API_KEY= ANTHROPIC_API_KEY= npx vitest run test/cx-e2e.test.ts test/cx-runtime.test.ts 2>&1 ";
vprompt += "(4) Fix any failures you or wave3 introduced. ";
vprompt += "(5) Write short markdown summary of files changed. Do not push; commit only if all green with clear message.";
let v = agent(
    vprompt,
    #{ label: "verify:wave3", capability_mode: "all" },
);

let report = "# CXOS wave3\n\n";
report += "build_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\n";
report += "lanes: ";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "\nverify=ok\n"; } else { report += "\nverify=check logs\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }

let p = write_scratch_file("enhance-cxos-wave3-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
