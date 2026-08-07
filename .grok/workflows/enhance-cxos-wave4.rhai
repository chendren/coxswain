let meta = #{
    name: "enhance-cxos-wave4",
    description: "Wave 4 CXOS operate loop: claim edges, task board, daemon health, apply --resolve",
    when_to_use: "After wave3 operate UX; deepen human-gated proposals/tasks/daemon",
    phases: [
        #{ title: "Map", detail: "confirm remaining operate gaps" },
        #{ title: "Build", detail: "parallel lanes" },
        #{ title: "Verify", detail: "tests and docs" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read-only check of " + root + " operate surface. Grep/read packages/cx-ops/src/proposals.ts, tasks.ts, daemon.ts and packages/cli/src/commands/cx.ts for: legal proposal transitions, apply resolve option, task done auto-resolve, task rollup, daemon open-proposal health, console apply next IDs. List what is already done vs still missing in 5 bullets. Use tools. Markdown only.",
    #{ label: "map:operate", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

let p_a = "In " + root + " packages/cx-ops/src/proposals.ts: ";
p_a += "Add isLegalProposalTransition(from,to) with edges open→claimed|dismissed|resolved, claimed→resolved|dismissed|open, dismissed→open, resolved terminal. ";
p_a += "transitionProposal rejects illegal edges (throw Error with clear message). Unit tests. No em dashes. Do not push.";
jobs.push(#{ prompt: p_a, label: "build:proposal-edges", capability_mode: "all" });

let p_b = "In " + root + " packages/cx-ops/src/tasks.ts: ";
p_b += "Fix applyProposal so opts.resolve===true marks proposal resolved else claimed. ";
p_b += "transitionTask(opts?: { resolveSource?: boolean }) when status done and sourceProposalId, default resolveSource true → transition proposal resolved. ";
p_b += "Add summarizeTasks pure rollup. Unit tests in cfn-tasks or new file. No em dashes. Do not push.";
jobs.push(#{ prompt: p_b, label: "build:tasks-resolve", capability_mode: "all" });

let p_c = "In " + root + " packages/cli: wire apply --resolve flag; runCxApply passes resolve. ";
p_c += "runCxConsole after persist prints next: cox cx apply <name> <id> for each added. ";
p_c += "runCxProposals shows next hint (apply|resolve|dismiss) per row. ";
p_c += "runCxTasks prints rollup counts + remediation= path when sourceProposalId. ";
p_c += "runCxDaemonStatus one health line with ticks last/max and open proposal count. ";
p_c += "Typecheck. No em dashes. Do not push.";
jobs.push(#{ prompt: p_c, label: "build:cli-operate", capability_mode: "all" });

let p_d = "In " + root + " docs: short section in docs/CXOS.md or docs/WAVE4-SUMMARY.md for claim/apply/task/daemon health. ";
p_d += "Update packages/cx-ops/README.md proposals/tasks rows. No em dashes. Do not push.";
jobs.push(#{ prompt: p_d, label: "build:docs", capability_mode: "all" });

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["proposal-edges", "tasks-resolve", "cli-operate", "docs"];
for r in results {
    if r != () && r.success { ok += 1; labels.push(names[i] + ":ok"); }
    else { fail += 1; labels.push(names[i] + ":fail"); }
    i += 1;
}
log("build " + ok.to_string() + "/" + results.len().to_string());

phase("Verify");
let vprompt = "In " + root + " verify wave4: OPENAI_API_KEY= tests for cx-ops and cli cx-e2e/cx-runtime. ";
vprompt += "Fix failures. Write docs/WAVE4-SUMMARY.md if missing. Commit if green; do not push.";
let v = agent(vprompt, #{ label: "verify:wave4", capability_mode: "all" });

let report = "# CXOS wave4\n\nbuild_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\nlanes: ";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "verify=ok\n"; } else { report += "verify=check\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }
let p = write_scratch_file("enhance-cxos-wave4-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
