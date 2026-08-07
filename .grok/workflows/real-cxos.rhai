let meta = #{
    name: "real-cxos",
    description: "Real CX OS wave: catalog, fleet, health history, archive, operate, claim, docs",
    when_to_use: "After complete-cxos; deepen into production-shaped OS surfaces",
    phases: [
        #{ title: "Map", detail: "real OS gaps" },
        #{ title: "Build", detail: "parallel real-OS lanes" },
        #{ title: "Verify", detail: "tests and system map" },
    ],
};

let root = if args == () { "/Users/chadhendren/coxswain" } else if args.root == () { "/Users/chadhendren/coxswain" } else { args.root };

phase("Map");
let map = agent(
    "Read " + root + " packages/cli/src/main.ts cx commands and packages/cx-ops/src/index.ts. List REAL OS capabilities present (catalog, fleet-status, health-history, archive, snapshot, claim, operate) vs missing. Use tools. Markdown bullets only.",
    #{ label: "map:real", capability_mode: "read-only" },
);
log("map done");

phase("Build");
let jobs = [];

let a = "In " + root + " ensure packages/cx-ops catalog.ts health-history.ts archive.ts snapshot.ts exist and export from index. Unit tests. No em dashes. Do not push.";
jobs.push(#{ prompt: a, label: "build:ops-real", capability_mode: "all" });

let b = "In " + root + " wire CLI if missing: catalog, claim, operate, archive, restore, snapshot, health-history, fleet-status. Typecheck. No em dashes. Do not push.";
jobs.push(#{ prompt: b, label: "build:cli-real", capability_mode: "all" });

let c = "In " + root + " update docs/CXOS-COMPLETE.md with REAL OS commands (catalog fleet health-history archive snapshot claim operate). Update package.json scripts. No em dashes. Do not push.";
jobs.push(#{ prompt: c, label: "build:docs-real", capability_mode: "all" });

let d = "In " + root + " packages/cx-ops/README.md document catalog health-history archive snapshot. No em dashes. Do not push.";
jobs.push(#{ prompt: d, label: "build:readme", capability_mode: "all" });

let e = "In " + root + " OPENAI_API_KEY= run cx-ops tests and cli typecheck + vitest cx-e2e. Fix failures. Write docs/REAL-CXOS-SUMMARY.md. Commit if green; do not push.";
jobs.push(#{ prompt: e, label: "build:verify", capability_mode: "all" });

let results = parallel(jobs);
let ok = 0;
let fail = 0;
let labels = [];
let i = 0;
let names = ["ops-real", "cli-real", "docs-real", "readme", "verify"];
for r in results {
    if r != () && r.success { ok += 1; labels.push(names[i] + ":ok"); }
    else { fail += 1; labels.push(names[i] + ":fail"); }
    i += 1;
}
log("build " + ok.to_string() + "/" + results.len().to_string());

phase("Verify");
let v = agent(
    "In " + root + " final real-cxos check: git status; tests green; ensure CXOS-COMPLETE lists new commands. Fix if needed. Do not push.",
    #{ label: "verify:real", capability_mode: "all" },
);

let report = "# Real CXOS\nbuild_ok=" + ok.to_string() + " build_fail=" + fail.to_string() + "\n";
for lab in labels { report += lab + " "; }
report += "\n";
if v != () && v.success { report += "verify=ok\n"; }
if map != () && map.success { report += "\n## Map\n" + map.output + "\n"; }
let p = write_scratch_file("real-cxos-report.md", report);
complete(#{ path: p, report: report, build_ok: ok, build_fail: fail });
