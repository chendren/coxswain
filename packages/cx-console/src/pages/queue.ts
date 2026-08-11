import { renderShell, esc } from "../shell.js";
import type { WorkQueue } from "@cox/cx-ops";

export function renderQueuePage(queue: WorkQueue, pack: string): string {
  const totalsLine = `${queue.totals.proposals} proposals · ${queue.totals.tasks} tasks · ${queue.totals.specsWithWork} specs`;

  // Proposal rows with urgency chip and ageDisplay
  const proposalRows = queue.proposals.map((p) => {
    const urgClass = p.urgency === "high" ? "chip-red" : p.urgency === "med" ? "chip-yellow" : "chip-green";
    return `
      <tr>
        <td><a href="/console/graph?spec=${esc(p.specName)}">${esc(p.specName)}</a></td>
        <td><span class="chip ${urgClass} urg-${p.urgency}">${esc(p.urgency.toUpperCase())}</span></td>
        <td>${esc(p.ageDisplay)}</td>
        <td>${esc(p.summary)}</td>
        <td><code>${esc(p.next)}</code></td>
      </tr>`;
  }).join("");

  // Task rows
  const taskRows = queue.tasks.map((t) => `
    <tr>
      <td><a href="/console/graph?spec=${esc(t.specName)}">${esc(t.specName)}</a></td>
      <td>${esc(t.ageDisplay)}</td>
      <td>${esc(t.title)}</td>
      <td>${t.sourceProposalId ? esc(t.sourceProposalId) : "-"}</td>
    </tr>`);
  const tasksSection = queue.tasks.length
    ? `
      <h2>Tasks</h2>
      <table class="queue-table">
        <thead>
          <tr>
            <th>spec</th>
            <th>age</th>
            <th>title</th>
            <th>source proposal</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>`
    : "";

  return renderShell({
    title: "Queue",
    active: "queue",
    pack,
    controlPath: queue.path ?? ["build_queue", "emit"],
    bodyHtml: `
      <h1>Work Queue</h1>
      <p class="lede">${totalsLine}</p>

      <h2>Proposals (sorted by urgency, then age)</h2>
      <table class="queue-table">
        <thead>
          <tr>
            <th>spec</th>
            <th>urgency</th>
            <th>age</th>
            <th>summary</th>
            <th>next</th>
          </tr>
        </thead>
        <tbody>${proposalRows}</tbody>
      </table>

      ${tasksSection}`,
  });
}
