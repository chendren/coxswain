import { renderShell, esc } from "../shell.js";
import { healthBand, type OpsBoard } from "@cox/cx-ops";

/**
 * Derive a day-scan health band from fleet rollup (no live probe).
 * Empty fleet → yellow (needs init). Heavy open work → red. Quiet deployed → green.
 */
export function fleetHealthScore(totals: OpsBoard["totals"]): number {
  if (totals.specs === 0) return 55; // yellow: empty needs attention
  let score = 100;
  score -= Math.min(40, totals.proposalsOpen * 4);
  score -= Math.min(30, totals.tasksOpen * 3);
  if (totals.deployedSpecs === 0 && totals.specs > 0) score -= 10;
  if (totals.daemonsRunning === 0 && totals.proposalsOpen > 0) score -= 5;
  return Math.max(0, Math.min(100, score));
}

export function renderFleetPage(board: OpsBoard, pack: string): string {
  const path = board.path?.length
    ? board.path
    : ["load_workspace", "build_board", "emit"];
  const score = fleetHealthScore(board.totals);
  const band = healthBand(score);
  const bandChip = `<span class="chip band-${band}" title="score ${score}">day ${band}</span>`;

  const cards = `
    <div class="cards fleet-band-${band}">
      <div class="card card-band"><span class="label">day band</span><strong class="band-${band}">${esc(band.toUpperCase())}</strong><span class="meta">score ${score}</span></div>
      <div class="card"><span class="label">specs</span><strong>${board.totals.specs}</strong></div>
      <div class="card"><span class="label">proposals open/claimed</span><strong class="${board.totals.proposalsOpen > 0 ? "band-yellow" : "band-green"}">${board.totals.proposalsOpen}</strong></div>
      <div class="card"><span class="label">tasks open</span><strong class="${board.totals.tasksOpen > 5 ? "band-red" : board.totals.tasksOpen > 0 ? "band-yellow" : "band-green"}">${board.totals.tasksOpen}</strong></div>
      <div class="card"><span class="label">daemons running</span><strong>${board.totals.daemonsRunning}</strong></div>
      <div class="card"><span class="label">deployed specs</span><strong>${board.totals.deployedSpecs}</strong></div>
    </div>`;

  const tableRows = board.rows
    .map((row) => {
      const daemonClass = row.daemonRunning ? "ok" : "off";
      const load = row.proposalsOpen + row.proposalsClaimed + row.tasksOpen;
      const rowBand =
        load === 0 ? "green" : load > 5 ? "red" : "yellow";
      return `
      <tr class="daemon-${daemonClass} row-band-${rowBand}">
        <td><a href="/console/graph?pack=${esc(pack)}&q=${esc(row.name)}">${esc(row.name)}</a></td>
        <td>${esc(row.idea)}</td>
        <td>${esc(row.phases.requirements)} / ${esc(row.phases.design)} / ${esc(row.phases.tasks)}</td>
        <td>${row.deployments.length ? esc(row.deployments.join(", ")) : "-"}</td>
        <td><span class="chip ${row.proposalsOpen + row.proposalsClaimed > 0 ? "chip-yellow" : "chip-green"}">${row.proposalsOpen + row.proposalsClaimed}</span></td>
        <td><span class="chip ${row.tasksOpen > 0 ? "chip-yellow" : "chip-gray"}">${row.tasksOpen}</span></td>
        <td class="daemon-status">
          <span class="chip ${row.daemonRunning ? "chip-green" : "chip-gray"}">${esc(row.daemonRunning ? "running" : "stopped")}</span>
        </td>
      </tr>`;
    })
    .join("");

  const table =
    board.rows.length === 0
      ? ""
      : `
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

  const empty =
    board.rows.length === 0
      ? `<div class="empty" role="status">
          <strong>Fleet is empty.</strong>
          Run <code>cox cx init</code> or <code>cox cx quickstart</code>, then refresh.
          <div class="empty-actions">
            <a href="/console/health?pack=${esc(pack)}">Health</a>
            · offline golden path in engine README
          </div>
        </div>`
      : "";

  return renderShell({
    title: "Fleet",
    active: "fleet",
    pack,
    controlPath: path,
    bodyHtml: `
      <h1>Fleet board ${bandChip}</h1>
      <p class="lede">Closed-world CXOS rollup. No silent prod mutation. Day band is offline rollup (not live platform probe).</p>
      ${cards}
      ${empty}
      ${table}`,
  });
}
