import { renderShell, esc } from "../shell.js";
import type { WorkQueue } from "@cox/cx-ops";

export function renderQueuePage(
  queue: WorkQueue,
  pack: string,
  flash?: string,
): string {
  const totalsLine = `${queue.totals.proposals} proposals · ${queue.totals.tasks} tasks · ${queue.totals.specsWithWork} specs`;

  const flashHtml = flash
    ? `<div class="banner" role="status">${esc(flash)}</div>`
    : "";

  const emptyProposals =
    queue.proposals.length === 0
      ? `<div class="empty">Queue is empty. Run <code>cox cx seed-operate &lt;name&gt;</code> or Autopilot with apply, then refresh.</div>`
      : "";

  const proposalRows = queue.proposals
    .map((p) => {
      const urgClass =
        p.urgency === "high"
          ? "chip-red"
          : p.urgency === "med"
            ? "chip-yellow"
            : "chip-green";
      const canClaim = p.status === "open";
      const canDismiss = p.status === "open" || p.status === "claimed";
      const claimForm = canClaim
        ? `<form class="inline-act" method="POST" action="/console/queue/action">
            <input type="hidden" name="action" value="claim"/>
            <input type="hidden" name="spec" value="${esc(p.specName)}"/>
            <input type="hidden" name="id" value="${esc(p.id)}"/>
            <input type="hidden" name="pack" value="${esc(pack)}"/>
            <button type="submit" class="btn btn-primary">Claim</button>
          </form>`
        : "";
      const dismissForm = canDismiss
        ? `<form class="inline-act" method="POST" action="/console/queue/action">
            <input type="hidden" name="action" value="dismiss"/>
            <input type="hidden" name="spec" value="${esc(p.specName)}"/>
            <input type="hidden" name="id" value="${esc(p.id)}"/>
            <input type="hidden" name="pack" value="${esc(pack)}"/>
            <button type="submit" class="btn btn-ghost">Dismiss</button>
          </form>`
        : "";
      const cli =
        p.status === "open"
          ? `cox cx claim ${p.specName} ${p.id}`
          : p.status === "claimed"
            ? `cox cx proposal ${p.specName} ${p.id} resolved`
            : p.next;
      return `
      <tr>
        <td><a href="/console/graph?pack=${esc(pack)}&q=${esc(p.specName)}">${esc(p.specName)}</a></td>
        <td><code>${esc(p.id)}</code></td>
        <td><span class="chip chip-gray">${esc(p.status)}</span></td>
        <td><span class="chip ${urgClass} urg-${p.urgency}">${esc(p.urgency.toUpperCase())}</span></td>
        <td>${esc(p.ageDisplay)}</td>
        <td>${esc(p.summary)}</td>
        <td><code>${esc(cli)}</code></td>
        <td class="actions">${claimForm}${dismissForm}</td>
      </tr>`;
    })
    .join("");

  const taskRows = queue.tasks
    .map(
      (t) => `
    <tr>
      <td><a href="/console/graph?pack=${esc(pack)}">${esc(t.specName)}</a></td>
      <td>${esc(t.ageDisplay)}</td>
      <td>${esc(t.title)}</td>
      <td>${t.sourceProposalId ? esc(t.sourceProposalId) : "-"}</td>
      <td><code>cox cx task ${esc(t.specName)} ${esc(t.id)} done</code></td>
    </tr>`,
    )
    .join("");
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
            <th>next CLI</th>
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
      <p class="lede">${totalsLine}. Human-gated: Claim creates a task; Dismiss closes without adapter mutation.</p>
      ${flashHtml}
      ${emptyProposals}

      <h2>Proposals (sorted by urgency, then age)</h2>
      <table class="queue-table">
        <thead>
          <tr>
            <th>spec</th>
            <th>id</th>
            <th>status</th>
            <th>urgency</th>
            <th>age</th>
            <th>summary</th>
            <th>next CLI</th>
            <th>act</th>
          </tr>
        </thead>
        <tbody>${proposalRows}</tbody>
      </table>

      ${tasksSection}`,
  });
}
