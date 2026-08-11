import { renderShell, esc } from "../shell";
import type { IntentScore, RetrievalRoute } from "@cox/cx-core";

export function renderIntentPage(opts: {
  pack: string;
  utterance?: string;
  ranked?: IntentScore[];
  top?: IntentScore;
  route?: RetrievalRoute;
  controlPath: string[];
}): string {
  const { pack, utterance = "", ranked = [], top, route, controlPath } = opts;

  const renderRow = (item: IntentScore) => {
    const scorePct = Math.min(100, Math.max(0, item.score));
    const chips = (item.matched ?? [])
      .map((c: string) => `<span class="chip chip-gray">${esc(c)}</span>`)
      .join(" ");
    return `
      <tr>
        <td class="score-cell">
          <div class="bar-wrap"><div class="bar" style="width:${scorePct}%"></div></div>
          <span class="score-text">${scorePct}</span>
        </td>
        <td><code>${esc(item.intentId)}</code></td>
        <td>${esc(item.name || "")}</td>
        <td>${chips || "-"}</td>
      </tr>`;
  };

  const tableRows = ranked.map(renderRow).join("");
  const emptyState = `
    <div class="empty">
      Type customer language. We only score closed catalog intents — never invent ids.
    </div>`;

  const refuseBanner =
    route?.mode === "refuse"
      ? `<div class="card card-danger" style="margin-bottom:16px;">
         <strong>Refused invent</strong>: ${esc(route.reason)} (risk ${route.risk})
       </div>`
      : "";

  const routeChip = route
    ? `<span class="chip chip-mode">${esc(route.mode)}</span>
       <span class="chip chip-risk">risk ${route.risk}</span>`
    : "";

  const formHtml = `
    <form class="card" action="/console/intent" method="get">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label for="utterance" style="font-weight:600;">Customer utterance</label>
        <textarea id="utterance" name="u" placeholder="e.g., My payment failed and I was double charged" rows="3"
          style="padding:12px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;font-size:0.9rem;">${esc(utterance)}</textarea>
        <input type="hidden" name="pack" value="${esc(pack)}"/>
        <button type="submit" class="btn">Score intents</button>
      </div>
    </form>`;

  const topLine = top
    ? `<p class="lede">Top: <code>${esc(top.intentId)}</code> · score ${top.score} · ${esc(top.name)}</p>`
    : "";

  const resultsTable =
    ranked.length > 0
      ? `
    <h2 style="margin-top:16px;">Ranked closed-world intents</h2>
    <div style="margin-bottom:12px;">${routeChip}</div>
    ${topLine}
    <table class="intent-table">
      <thead>
        <tr>
          <th class="score-th">Score</th>
          <th>Intent ID</th>
          <th>Name</th>
          <th>Matched</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`
      : "";

  return renderShell({
    title: "Intent router",
    active: "intent",
    pack,
    controlPath,
    bodyHtml: `
      <h1>Intent router</h1>
      <p class="lede">Closed-world intent scoring over ontology exemplars. Model proposes later; engines decide here.</p>
      ${formHtml}
      ${refuseBanner}
      ${ranked.length === 0 && !utterance ? emptyState : ""}
      ${ranked.length === 0 && utterance ? `<div class="empty">No intents scored above floor for this utterance.</div>` : ""}
      ${resultsTable}`,
  });
}
