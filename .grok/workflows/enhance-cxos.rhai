let meta = #{
    name: "enhance-cxos",
    description: "Parallel enhancement of Coxswain CXOS: product loop, quality, docs",
    when_to_use: "Enhance CXOS product surface, doctor, run command, tests, docs",
    phases: [
        #{ title: "Map", detail: "read-only gap analysis" },
        #{ title: "Build", detail: "parallel implementation lanes" },
        #{ title: "Verify", detail: "tests and integration" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map_jobs = [];
map_jobs.push(#{
    prompt: "Explore " + root + " packages/cx-ops, packages/cli/src/commands/cx.ts, packages/cli/src/cx, packages/cx-core/src/ontology. Summarize: (1) what CXOS can do today as a product loop, (2) top 5 gaps for a real CX Operating System, (3) which files own each gap. Use list_dir/grep/read_file only. Return markdown with headings Gaps and Owners.",
    label: "map:product",
    capability_mode: "read-only",
});
map_jobs.push(#{
    prompt: "Explore " + root + " packages/cx-local, packages/cx-aws, packages/cx-artifacts, examples/cx-demo, scripts. Summarize live vs offline wiring quality and missing operator ergonomics. Use read-only tools. Return markdown.",
    label: "map:adapters",
    capability_mode: "read-only",
});
let maps = parallel(map_jobs);
log("map panels done");

phase("Build");
let build_jobs = [];

// Lane 1: cox cx run one-shot + e2e test
build_jobs.push(#{
    prompt: "In " + root + " implement a production-grade `cox cx run <name> [idea...]` command that: creates spec if missing, auto-approves requirements if draft, builds all targets (artifacts first), runs status, optional simulate for local, report, and prints next ops steps. Wire it in packages/cli/src/commands/cx.ts and packages/cli/src/main.ts. Add packages/cli/test/cx-e2e.test.ts that runs offline create/approve/build/status path using createOfflineCxRuntime and orchestrate helpers (no network). Follow existing CLI patterns (CliExit, cxCtx). Run typecheck/tests for affected packages. Commit message style: complete sentences. Do not push.",
    label: "build:cx-run-e2e",
    capability_mode: "all",
});

// Lane 2: report/console NBA from design journey + stack doctor polish
build_jobs.push(#{
    prompt: "In " + root + " enhance CXOS operate quality: (1) packages/cli/src/commands/cx.ts runCxReport and runCxConsole/runCxWatch should use journey id from workspace design.journeyMaps[0].id when present for NBA context, and pick a non-terminal stage from ontology if possible (use nextStages/getJourney from @cox/cx-core). (2) Ensure doctor already probes stack - if not, wire probeStackHealth. (3) Add packages/cx-ops/test/nba-context.test.ts if you add pure helpers - prefer putting pure helper resolveNbaContextFromSpec in packages/cx-ops/src/nba.ts. Run cx-ops and cli typecheck/tests. Do not push.",
    label: "build:operate-nba",
    capability_mode: "all",
});

// Lane 3: CXOS project memory + operator docs
build_jobs.push(#{
    prompt: "In " + root + " write CXOS operator memory: create packages/cx-ops/README.md (API surface table for workspace/orchestrate/console/proposals/tasks/daemon/stack-health). Update or create docs/CXOS.md as the product north-star (offline loop, live hybrid, graph-node practice, commands cheat sheet). Update examples/cx-demo/README.md with `cox cx run` and stack-up. No em dashes. Keep accurate to code on disk - read files first. Do not invent APIs. Do not push.",
    label: "build:docs",
    capability_mode: "all",
});

// Lane 4: default hybrid when platform up without --live
build_jobs.push(#{
    prompt: "In " + root + " packages/cli/src/cx/runtime.ts and packages/cli/src/commands/cx.ts: when mode is offline by default, still allow doctor/build to auto-upgrade to hybrid if platform is healthy OR if args.mode not set and CX_AUTO_LIVE=1. Better approach: add optional autoLive to CxCommandContext; when --auto-live flag or env CX_AUTO_LIVE=1, use mode hybrid. Wire --auto-live on build/status/doctor/run. Probe platform in createCxRuntime already. Document in examples/cx-demo. Run typecheck. Do not push.",
    label: "build:auto-live",
    capability_mode: "all",
});

let builds = parallel(build_jobs);
let ok = 0;
let fail = 0;
for b in builds {
    if b != () && b.success { ok += 1; } else { fail += 1; }
}
log("build ok=" + ok.to_string() + " fail=" + fail.to_string());

phase("Verify");
let v = agent(
    "In " + root + " run: cd packages/cx-ops && npm test && npm run typecheck; cd ../cli && npm run typecheck && npx vitest run test/cx-e2e.test.ts test/cx-runtime.test.ts test/args.test.ts 2>&1. Fix any failures you introduced. Summarize test results and key files changed across the repo (git status/diff --stat). Do not push.",
    #{ label: "verify:tests", capability_mode: "all" },
);

let report = "CXOS enhance complete. build_ok=" + ok.to_string() + " build_fail=" + fail.to_string();
if v != () && v.success { report += " verify=ok"; } else { report += " verify=check"; }
let p = write_scratch_file("enhance-cxos-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
