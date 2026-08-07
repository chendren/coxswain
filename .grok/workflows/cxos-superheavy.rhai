let meta = #{
    name: "cxos-superheavy",
    description: "SuperHeavy mass-parallel CXOS completion: queue, dashboard, graph query, e2e, demos, runbooks",
    when_to_use: "Maximum concurrent agent blast to complete CXOS OS surfaces",
    phases: [
        #{ title: "Map", detail: "gap inventory" },
        #{ title: "Build", detail: "mass parallel lanes" },
        #{ title: "Verify", detail: "tests + system map" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read-only gap inventory of " + root + " CXOS. Grep packages/cli/src/main.ts for all cx commands; list packages/cx-ops/src; read docs/CXOS-COMPLETE.md checklist. List 12 concrete gaps ranked by operator value for a production CX OS. Use tools. Markdown.",
    #{ label: "map:gaps", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

// Lane ownership is partitioned to reduce file thrash.
let p0 = "In " + root + " packages/cx-ops ONLY: add src/fleet-queue.ts with buildWorkQueue(deps) returning all open proposals and open tasks across listCxSpecs, with age hours and suggested next. Export from index. Unit test test/fleet-queue.test.ts. No em dashes. Do not push. Do not edit packages/cli.";
jobs.push(#{ prompt: p0, label: "build:fleet-queue", capability_mode: "all" });

let p1 = "In " + root + " packages/cx-ops ONLY: add src/dashboard-html.ts pure function renderOpsDashboardHtml(board, queue?) returning a self-contained HTML string (dark ops aesthetic, no external assets). Unit test. Export index. No em dashes. Do not push. Do not edit cli.";
jobs.push(#{ prompt: p1, label: "build:dashboard-html", capability_mode: "all" });

let p2 = "In " + root + " packages/cx-ops ONLY: add src/graph-query.ts with lookupStrongNode(pack, query) searching buildStrongGraph for id/name contains query (case-insensitive), return top 20 matches {id, kind, name}. Unit test. Export. No em dashes. Do not push. Do not edit cli.";
jobs.push(#{ prompt: p2, label: "build:graph-query", capability_mode: "all" });

let p3 = "In " + root + " packages/cli ONLY: wire cox cx queue (print work queue from buildWorkQueue), cox cx dashboard [outFile] writing HTML from board+queue, cox cx graph-find <query> using lookupStrongNode. Imports from @cox/cx-ops. Typecheck. No em dashes. Do not push. Prefer adding handlers at end of commands/cx.ts and main.ts registration near other fleet commands.";
jobs.push(#{ prompt: p3, label: "build:cli-queue-dash", capability_mode: "all" });

let p4 = "In " + root + " packages/cli/test: add test/cx-os-surface.test.ts offline e2e covering init, run, board, catalog, brief, cab-export, snapshot, health-history, archive/restore if stable. Clear LLM keys in beforeAll. No em dashes. Do not push.";
jobs.push(#{ prompt: p4, label: "build:e2e-surface", capability_mode: "all" });

let p5 = "In " + root + " docs: write docs/CXOS-OPERATOR-RUNBOOK.md day-1 and day-2 procedures for PM, SA, Ops, SRE, Compliance with exact commands. Link from CXOS-COMPLETE.md. No em dashes. Do not push.";
jobs.push(#{ prompt: p5, label: "build:runbook", capability_mode: "all" });

let p6 = "In " + root + " examples/cx-demo: add multi-program.sh that creates two specs offline, builds both, prints board and queue. chmod +x. Update README. No em dashes. Do not push.";
jobs.push(#{ prompt: p6, label: "build:multi-demo", capability_mode: "all" });

let p7 = "In " + root + " packages/cx-ops: enhance renderExecBrief to accept optional healthHistory scores line if provided; update brief.ts only + tests if needed. No em dashes. Do not push. Do not edit cli.";
jobs.push(#{ prompt: p7, label: "build:brief-health", capability_mode: "all" });

let p8 = "In " + root + " packages/cx-ops/src/proposals.ts: add proposalUrgencyScore(kind, ageHours) pure function 0-100; export; unit test. Wire nothing else. No em dashes. Do not push.";
jobs.push(#{ prompt: p8, label: "build:urgency-score", capability_mode: "all" });

let p9 = "In " + root + " root package.json: add scripts cx:queue, cx:dashboard, cx:graph-find if missing. No other changes. No em dashes. Do not push.";
jobs.push(#{ prompt: p9, label: "build:pkg-scripts", capability_mode: "all" });

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["fleet-queue", "dashboard-html", "graph-query", "cli-queue-dash", "e2e-surface", "runbook", "multi-demo", "brief-health", "urgency-score", "pkg-scripts"];
for r in results {
    if r != () && r.success { ok += 1; labels.push(names[i] + ":ok"); }
    else { fail += 1; labels.push(names[i] + ":fail"); }
    i += 1;
}
log("build " + ok.to_string() + "/" + results.len().to_string());

phase("Verify");
let vprompt = "In " + root + " SUPERHEAVY verify: OPENAI_API_KEY= pnpm --filter @cox/cx-ops test; packages/cli typecheck + vitest cx-e2e and any cx-os-surface test. Fix merge conflicts and failures from parallel agents. Update docs/CXOS-COMPLETE.md with queue/dashboard/graph-find. Write docs/SUPERHEAVY-SUMMARY.md. Commit if green; do not push.";
let v = agent(vprompt, #{ label: "verify:superheavy", capability_mode: "all" });

let report = "# CXOS SuperHeavy\nbuild_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\nlanes: ";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "verify=ok\n"; } else { report += "verify=check\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }
let p = write_scratch_file("cxos-superheavy-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
