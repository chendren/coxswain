let meta = #{
    name: "complete-cxos",
    description: "Blow up CXOS into a complete operating system: board, brief, CAB, audit, docs, tests",
    when_to_use: "True CX OS completeness pass after waves 1-4",
    phases: [
        #{ title: "Map", detail: "gap analysis vs complete OS" },
        #{ title: "Build", detail: "parallel completeness lanes" },
        #{ title: "Verify", detail: "tests typecheck docs" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read-only map of " + root + " for a COMPLETE CX OS. Grep packages/cli/src/main.ts for all cox cx commands; read packages/cx-ops/src/index.ts; docs/CXOS.md; docs/CXOS-PERSONAS-USE-CASES.md section 10 expansion vectors. List what is already present (board, brief, cab-export, audit, journeys, init if any) vs still missing for a true OS. Use tools. Markdown.",
    #{ label: "map:complete", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

let p1 = "In " + root + ": Ensure packages/cx-ops has board.ts, brief.ts, cab-export.ts, audit.ts, journeys.ts exported from index. ";
p1 += "If missing, implement. Unit tests. No em dashes. Do not push.";
jobs.push(#{ prompt: p1, label: "build:ops-modules", capability_mode: "all" });

let p2 = "In " + root + " packages/cli: wire cox cx board, brief, cab-export, audit, journeys, init if not wired in main.ts and commands/cx.ts. ";
p2 += "Typecheck cli. No em dashes. Do not push.";
jobs.push(#{ prompt: p2, label: "build:cli-os", capability_mode: "all" });

let p3 = "In " + root + " write or expand docs/CXOS-COMPLETE.md as the complete operating system map: ";
p3 += "layers, all CLI commands by lifecycle (design/build/operate/govern/fleet), package map, offline/live, human gates, personas link. ";
p3 += "Update docs/CXOS.md to link CXOS-COMPLETE.md. No em dashes. Do not push.";
jobs.push(#{ prompt: p3, label: "build:docs-complete", capability_mode: "all" });

let p4 = "In " + root + " root package.json: add scripts cx:board, cx:init if missing. ";
p4 += "Update examples/cx-demo/README.md with board/brief/cab-export/audit/journeys/init tracks. No em dashes. Do not push.";
jobs.push(#{ prompt: p4, label: "build:scripts-demo", capability_mode: "all" });

let p5 = "In " + root + " packages/cx-ops/README.md: document board, brief, cab-export, audit, journeys modules. ";
p5 += "Add path-audit formatPathByPhase if present. No em dashes. Do not push.";
jobs.push(#{ prompt: p5, label: "build:ops-readme", capability_mode: "all" });

let p6 = "In " + root + ": run OPENAI_API_KEY= tests for cx-ops and cli typecheck + cx-e2e/cx-runtime. ";
p6 += "Fix any failures from complete-cxos work. Commit if green; do not push.";
jobs.push(#{ prompt: p6, label: "build:verify-lane", capability_mode: "all" });

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["ops-modules", "cli-os", "docs-complete", "scripts-demo", "ops-readme", "verify-lane"];
for r in results {
    if r != () && r.success { ok += 1; labels.push(names[i] + ":ok"); }
    else { fail += 1; labels.push(names[i] + ":fail"); }
    i += 1;
}
log("build " + ok.to_string() + "/" + results.len().to_string());

phase("Verify");
let vprompt = "In " + root + " final complete-cxos verify: ";
vprompt += "git status; OPENAI_API_KEY= pnpm --filter @cox/cx-ops test; packages/cli typecheck + vitest cx-e2e cx-runtime; ";
vprompt += "Write docs/COMPLETE-CXOS-SUMMARY.md listing new commands and files. Commit if green; do not push.";
let v = agent(vprompt, #{ label: "verify:complete", capability_mode: "all" });

let report = "# Complete CXOS\n\nbuild_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\nlanes: ";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "verify=ok\n"; } else { report += "verify=check\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }
let p = write_scratch_file("complete-cxos-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
