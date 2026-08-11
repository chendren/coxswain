import { renderShell, esc } from "../shell.js";
import type { OpsBoard } from "@cox/cx-ops";

export function renderFleetPage(board: OpsBoard, pack: string): string {
  const path = board.path?.length ? board.path : ["load_workspace", "build_board", "emit"];

  // Totals cards
  const cards = `
    <div class="cards">
      <div class="card"><span class="label">specs</span><strong>${board.totals.specs}</strong></div>
      <div class="card"><span class="label">proposals open/claimed</span><strong>${board.totals.proposalsOpen}</strong></div>
      <div class="card"><span class="label">tasks open</span><strong>${board.totals.tasksOpen}</strong></div>
      <div class="card"><span class="label">daemons running</span><strong>${board.totals.daemonsRunning}</strong></div>
      <div class="card"><span class="label">deployed specs</span><strong>${board.totals.deployedSpecs}</strong></div>
    </div>`;

  // Table rows
  const tableRows = board.rows.map((row) => {
    const daemonClass = row.daemonRunning ? "ok" : "off";
    return `
      <tr class="daemon-${daemonClass}">
        <td><a href="/console/graph?spec=${esc(row.name)}">${esc(row.name)}</a></td>
        <td>${esc(row.idea)}</td>
        <td>${esc(row.phases.requirements)} / ${esc(row.phases.design)} / ${esc(row.phases.tasks)}</td>
        <td>${row.deployments.length ? esc(row.deployments.join(", ")) : "-"}</td>
        <td>${row.proposalsOpen + row.proposalsClaimed}</td>
        <td>${row.tasksOpen}</td>
        <td class="daemon-status">
          <span class="chip ${row.daemonRunning ? "chip-green" : "chip-gray"}">${esc(row.daemonRunning ? "running" : "stopped")}</span>
        </td>
      </tr>`;
  }).join("");

  const table = `
    <table class="fleet-table">
      <thead>
        <tr>
          <th>spec</th>
          <th>idea</th>
          <th>phases (req/dsg/tasks)</th>
          <th>deployments</th>
          <th>proposals</th>
          <th>tasks open</th>
          <th>daemon</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;

  const empty = board.rows.length === 0
    ? `<div class="empty">Fleet is empty. Run cox cx init or quickstart.</div>`
    : "";

  return renderShell({
    title: "Fleet",
    active: "fleet",
    pack,
    controlPath: path,
    bodyHtml: `
      <h1>Fleet board</h1>
      <p class="lede">Closed-world CXOS rollup. No silent prod mutation.</p>
      ${cards}
      ${empty}
      ${table}`,
  });
}
