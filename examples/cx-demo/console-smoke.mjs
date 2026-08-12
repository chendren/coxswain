#!/usr/bin/env node
/**
 * Graph Console HTTP smoke (offline).
 * Expects bash already created CWD with seeded proposals for SPEC.
 * path: start_server → health → queue → claim → close
 */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const cwd = process.argv[2];
const specName = process.argv[3] || "smoke-console";

if (!cwd) {
  console.error("usage: node console-smoke.mjs <cwd> [specName]");
  process.exit(2);
}

const consoleUrl = pathToFileURL(join(ROOT, "packages/cx-console/dist/index.js")).href;
const opsUrl = pathToFileURL(join(ROOT, "packages/cx-ops/dist/index.js")).href;

const { startConsoleServer } = await import(consoleUrl);
const { resolveCxRoot, loadProposals } = await import(opsUrl);

const cxRoot = resolveCxRoot(cwd);
const deps = { cxRoot, now: () => new Date().toISOString() };

let props = await loadProposals(deps, specName);
if (props.length === 0) {
  // list any program with open proposals
  try {
    const names = await readdir(cxRoot);
    for (const name of names) {
      const list = await loadProposals(deps, name);
      const open = list.filter((p) => p.status === "open");
      if (open.length) {
        props = open;
        console.log(`note: using proposals from program ${name}`);
        break;
      }
    }
  } catch {
    /* empty workspace */
  }
}

const open = props.find((p) => p.status === "open") ?? props[0];
if (!open) {
  console.error("error: no proposals to claim under", cxRoot);
  process.exit(1);
}

const logs = [];
const server = await startConsoleServer({
  port: 0,
  cwd,
  host: "127.0.0.1",
  write: (s) => logs.push(s),
});
const port = server.port;
const base = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${base}/api/health`);
  if (health.status !== 200) throw new Error(`health status ${health.status}`);
  const hj = await health.json();
  if (!hj.ok) throw new Error("health not ok");

  const fleet = await fetch(`${base}/console/fleet?pack=default`);
  if (fleet.status !== 200) throw new Error(`fleet status ${fleet.status}`);
  const fleetHtml = await fleet.text();
  if (!fleetHtml.includes("CX Graph Console")) throw new Error("fleet missing brand");
  if (/src=["']https?:\/\//i.test(fleetHtml) || /href=["']https?:\/\/(?!127\.0\.0\.1)/i.test(fleetHtml)) {
    // relative-only assets; allow no external
    const bad = [...fleetHtml.matchAll(/\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
    if (bad.length) throw new Error(`external assets: ${bad.join(", ")}`);
  }

  const queue = await fetch(`${base}/console/queue?pack=default`);
  if (queue.status !== 200) throw new Error(`queue status ${queue.status}`);
  const qHtml = await queue.text();
  if (!qHtml.includes("path-audit")) throw new Error("queue missing path-audit");

  const claimUrl =
    `${base}/api/proposal/action?action=claim` +
    `&spec=${encodeURIComponent(open.specName)}` +
    `&id=${encodeURIComponent(open.id)}` +
    `&actor=console-smoke`;
  const claim = await fetch(claimUrl, { method: "GET" });
  const body = await claim.json();
  if (!body.ok) {
    throw new Error(`claim failed: ${body.error ?? JSON.stringify(body)}`);
  }
  if (body.data?.status !== "claimed" && body.data?.action !== "claim") {
    console.log("claim body", JSON.stringify(body));
  }
  console.log(
    `claimed ${open.specName}/${open.id} → task ${body.data?.taskId ?? "?"} path=${(body.path ?? []).join("→")}`,
  );

  // verify persistence
  const after = await loadProposals(deps, open.specName);
  const updated = after.find((p) => p.id === open.id);
  if (!updated || updated.status !== "claimed") {
    throw new Error(`proposal not claimed on disk (status=${updated?.status})`);
  }

  console.log("console-smoke.mjs OK");
} finally {
  await server.close();
}
