/**
 * Self-contained HTML ops dashboard (no external CSS/JS CDNs).
 */
import type { OpsBoard } from "./board";
import type { WorkQueue } from "./fleet-queue";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderOpsDashboardHtml(
  board: OpsBoard,
  queue?: WorkQueue,
  generatedAt?: string,
): string {
  const at = generatedAt ?? new Date().toISOString();
  const rows = board.rows
    .map((r) => {
      const ph = `R=${esc(r.phases.requirements)} D=${esc(r.phases.design)} T=${esc(r.phases.tasks)}`;
      return `<tr>
        <td><strong>${esc(r.name)}</strong></td>
        <td>${ph}</td>
        <td>${esc(r.deployments.join(", ") || "-")}</td>
        <td>${r.proposalsOpen}+${r.proposalsClaimed}c</td>
        <td>${r.tasksOpen}</td>
        <td>${r.daemonRunning ? "up" : "off"}</td>
        <td class="idea">${esc(r.idea.slice(0, 100))}</td>
      </tr>`;
    })
    .join("\n");

  let queueHtml = "";
  if (queue) {
    const props = queue.proposals
      .slice(0, 40)
      .map(
        (p) =>
          `<tr><td>${esc(p.specName)}</td><td><code>${esc(p.id)}</code></td><td>${esc(p.status)}</td><td>${esc(p.urgency)}</td><td>${p.ageHours}h</td><td>${esc(p.summary.slice(0, 80))}</td></tr>`,
      )
      .join("\n");
    const tasks = queue.tasks
      .slice(0, 40)
      .map(
        (t) =>
          `<tr><td>${esc(t.specName)}</td><td><code>${esc(t.id)}</code></td><td>${esc(t.status)}</td><td>${t.ageHours}h</td><td>${esc(t.title.slice(0, 80))}</td></tr>`,
      )
      .join("\n");
    queueHtml = `
    <h2>Open proposals (${queue.totals.proposals})</h2>
    <table><thead><tr><th>Spec</th><th>Id</th><th>Status</th><th>Urg</th><th>Age</th><th>Summary</th></tr></thead>
    <tbody>${props || "<tr><td colspan=6>(none)</td></tr>"}</tbody></table>
    <h2>Open tasks (${queue.totals.tasks})</h2>
    <table><thead><tr><th>Spec</th><th>Id</th><th>Status</th><th>Age</th><th>Title</th></tr></thead>
    <tbody>${tasks || "<tr><td colspan=5>(none)</td></tr>"}</tbody></table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CXOS Ops Dashboard</title>
<style>
  :root { --bg:#0b1020; --panel:#141a2e; --text:#e6ecff; --muted:#8b95b5; --accent:#5b8cff; --ok:#3dd68c; --warn:#f5a524; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--text); padding:24px; }
  h1 { font-size:1.4rem; margin:0 0 4px; letter-spacing:0.02em; }
  h2 { font-size:1.05rem; margin:28px 0 10px; color:var(--accent); }
  .meta { color:var(--muted); font-size:0.85rem; margin-bottom:20px; }
  .cards { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
  .card { background:var(--panel); border:1px solid #243056; border-radius:10px; padding:14px 16px; min-width:120px; }
  .card b { display:block; font-size:1.35rem; }
  .card span { color:var(--muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border-radius:10px; overflow:hidden; font-size:0.88rem; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #243056; vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; }
  tr:last-child td { border-bottom:none; }
  td.idea { color:var(--muted); max-width:280px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.82rem; color:#b8d0ff; }
  footer { margin-top:28px; color:var(--muted); font-size:0.75rem; }
</style>
</head>
<body>
  <h1>CXOS Ops Dashboard</h1>
  <div class="meta">Generated ${esc(at)} · closed-world · human-gated · plan-only AWS</div>
  <div class="cards">
    <div class="card"><b>${board.totals.specs}</b><span>Specs</span></div>
    <div class="card"><b>${board.totals.deployedSpecs}</b><span>Deployed</span></div>
    <div class="card"><b>${board.totals.proposalsOpen}</b><span>Proposals open</span></div>
    <div class="card"><b>${board.totals.tasksOpen}</b><span>Tasks open</span></div>
    <div class="card"><b>${board.totals.daemonsRunning}</b><span>Daemons</span></div>
  </div>
  <h2>Fleet board</h2>
  <table>
    <thead><tr><th>Spec</th><th>Phases</th><th>Deps</th><th>Props</th><th>Tasks</th><th>Daemon</th><th>Idea</th></tr></thead>
    <tbody>
      ${rows || "<tr><td colspan=7>(no specs — cox cx init)</td></tr>"}
    </tbody>
  </table>
  ${queueHtml}
  <footer>CXOS dashboard — offline-safe HTML · no external assets · never auto-mutates prod</footer>
</body>
</html>
`;
}
