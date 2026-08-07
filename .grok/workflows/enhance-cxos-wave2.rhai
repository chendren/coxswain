let meta = #{
    name: "enhance-cxos-wave2",
    description: "Wave 2 parallel CXOS enhancement: operator stack, quality, export, macOS services",
    when_to_use: "Continue enhancing Coxswain CXOS after wave1 (run, auto-live, docs)",
    phases: [
        #{ title: "Map", detail: "gap analysis vs current CXOS" },
        #{ title: "Build", detail: "parallel implementation lanes" },
        #{ title: "Verify", detail: "tests and smoke" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read-only map of " + root + " CXOS surface. Read docs/CXOS.md, packages/cli/src/main.ts (cx commands only), packages/cx-ops/src/index.ts, scripts/, examples/cx-demo/. List 6 concrete remaining gaps ranked by operator value. Return markdown only.",
    #{ label: "map:gaps", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

// Lane A: package.json scripts + golden path uses cx run
jobs.push(#{
    prompt: "In " + root + ": (1) Add root package.json scripts: \"cx:doctor\", \"cx:stack-up\", \"cx:golden\", \"cx:golden:live\" pointing at pnpm cox / scripts. (2) Update examples/cx-demo/golden-path.sh to prefer `pnpm cox cx run` for the main path while keeping explicit approve/build as comments. (3) Ensure scripts/cx-stack-up.sh is executable and mentioned in package.json. No em dashes. Commit if tests unnecessary. Do not push.",
    label: "build:scripts",
    capability_mode: "all",
});

// Lane B: export-aws command + validate template after build
jobs.push(#{
    prompt: "In " + root + " add `cox cx export-aws <name> [outDir]` that copies .cox/cx/<name>/aws/template.yaml and APPLY.md (and architectureDoc.json if present) to outDir (default ./cx-export/<name>-aws). Wire in packages/cli/src/commands/cx.ts and main.ts. After offline aws build, these files exist. Add a small unit/e2e assertion in packages/cli/test or cx-ops test that template.yaml contains AWSTemplateFormatVersion. Typecheck. No em dashes. Do not push.",
    label: "build:export-aws",
    capability_mode: "all",
});

// Lane C: macOS LaunchAgent templates for ollama + platform
jobs.push(#{
    prompt: "In " + root + " create scripts/macos/ with: (1) com.chendren.ollama.plist.template, (2) com.chendren.nexus-cx.plist.template using labels and ProgramArguments for ollama serve and node server.js with paths as placeholders {{HOME}} {{PLATFORM_DIR}}. (3) scripts/macos/install-launchagents.sh that substitutes HOME and PLATFORM_DIR (default ~/Projects/cx-platform/omnichannel-cx-platform), writes to ~/Library/LaunchAgents, launchctl load. (4) scripts/macos/uninstall-launchagents.sh. Document in docs/CXOS.md under a short Stack services section. No em dashes. Do not push.",
    label: "build:launchagents",
    capability_mode: "all",
});

// Lane D: test isolation + doctor exit code when stack not ready under --live
jobs.push(#{
    prompt: "In " + root + ": (1) packages/cli/test/cx-runtime.test.ts and cx-e2e.test.ts must force process.env.OPENAI_API_KEY='' and XAI_API_KEY='' and ANTHROPIC_API_KEY='' in beforeAll/beforeEach so hybrid tests stay offline. (2) runCxDoctor: if ctx.live or autoLive or mode hybrid/live, return exit code 1 when probeStackHealth().ready is false (still print full doctor output). Offline doctor stays 0 when ontology ok. (3) Add/adjust a tiny test if easy. Typecheck cli, run vitest for those files with env cleared. No em dashes. Do not push.",
    label: "build:quality",
    capability_mode: "all",
});

// Lane E: CX metrics summary pure function + status enrichment
jobs.push(#{
    prompt: "In " + root + " packages/cx-ops: add src/metrics-summary.ts with summarizeDeployments(healthEntries) pure function that returns { healthy, degraded, down, errors, score 0-100 }. Wire runCxStatus in packages/cli/src/commands/cx.ts to print a one-line summary score after per-target lines. Export from index. Unit test in packages/cx-ops/test/metrics-summary.test.ts. Typecheck/test cx-ops. No em dashes. Do not push.",
    label: "build:metrics",
    capability_mode: "all",
});

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["scripts", "export-aws", "launchagents", "quality", "metrics"];
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
let v = agent(
    "In " + root + " verify wave2: (1) git status --short (2) cd packages/cx-ops && OPENAI_API_KEY= npm test && npm run typecheck (3) cd packages/cli && OPENAI_API_KEY= npm run typecheck && OPENAI_API_KEY= XAI_API_KEY= ANTHROPIC_API_KEY= npx vitest run test/cx-e2e.test.ts test/cx-runtime.test.ts 2>&1 (4) Fix any failures you or wave2 introduced. (5) Write a short markdown summary of files changed and how to use new features. Do not push; commit if all green with a clear message.",
    #{ label: "verify:wave2", capability_mode: "all" },
);

let report = "# CXOS wave2\n\n";
report += "build_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\n";
report += "lanes: ";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "\nverify=ok\n"; } else { report += "\nverify=check logs\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }

let p = write_scratch_file("enhance-cxos-wave2-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
