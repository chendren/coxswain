import { renderShell, esc } from "../shell.js";
import type { AutopilotResult } from "@cox/cx-ops";

export function renderAutopilotPage(opts: {
  pack: string;
  specName?: string;
  utterance?: string;
  apply?: boolean;
  result?: AutopilotResult | null;
  controlPath: string[];
  error?: string;
}): string {
  const {
    pack,
    specName = "",
    utterance = "",
    apply = false,
    result,
    controlPath,
    error,
  } = opts;

  const form = `
    <form class="card" method="get" action="/console/autopilot">
      <input type="hidden" name="pack" value="${esc(pack)}"/>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label><span class="label">Spec name</span>
          <input name="spec" value="${esc(specName)}" placeholder="billing-demo" required
            style="width:100%;padding:10px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;"/>
        </label>
        <label><span class="label">Customer / operator utterance</span>
          <textarea name="u" rows="3" placeholder="My payment failed and I was double charged"
            style="width:100%;padding:10px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;">${esc(utterance)}</textarea>
        </label>
        <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:0.9rem;">
          <input type="checkbox" name="apply" value="1" ${apply ? "checked" : ""}/>
          Apply (open human-gated proposal — never mutates adapters)
        </label>
        <button type="submit" class="btn">Run Graph Autopilot</button>
      </div>
    </form>`;

  let resultHtml = "";
  if (error) {
    resultHtml = `<div class="card card-danger"><strong>Error</strong>: ${esc(error)}</div>`;
  } else if (result) {
    const intents = (result.intents ?? [])
      .slice(0, 6)
      .map(
        (i) =>
          `<tr><td>${i.score}</td><td><code>${esc(i.intentId)}</code></td><td>${esc(i.name)}</td></tr>`,
      )
      .join("");
    const refuse = result.route.mode === "refuse";
    resultHtml = `
      <h2>Result</h2>
      <div class="card ${refuse ? "card-danger" : ""}">
        <div style="margin-bottom:8px;">
          <span class="chip chip-mode">${esc(result.route.mode)}</span>
          <span class="chip chip-risk">risk ${result.route.risk}</span>
          <span class="chip ${result.dryRun ? "chip-gray" : "chip-green"}">${result.dryRun ? "dry-run" : "applied"}</span>
        </div>
        <p><strong>Summary</strong>: ${esc(result.summary)}</p>
        ${
          result.primaryIntent
            ? `<p>Primary intent: <code>${esc(result.primaryIntent.intentId)}</code> (${result.primaryIntent.score})</p>`
            : ""
        }
        ${
          result.nba.primary
            ? `<p>NBA: <code>${esc(result.nba.primary.id)}</code> · ${esc(result.nba.primary.action)} · urgency=${esc(String(result.nba.primary.urgency))}</p>`
            : "<p>NBA: none matched (investigate proposal still possible)</p>"
        }
        ${
          result.proposal
            ? `<p>Proposal kind: <strong>${esc(result.proposal.kind)}</strong><br/><span style="color:var(--muted)">${esc(result.proposal.summary)}</span></p>`
            : ""
        }
        ${
          result.persisted?.length
            ? `<p class="chip chip-green">Opened: ${result.persisted.map((p) => esc(p.id)).join(", ")}</p>
               <p class="lede">Next: <code>cox cx claim ${esc(specName)} ${esc(result.persisted[0]!.id)}</code></p>`
            : result.dryRun && result.proposal?.kind !== "none"
              ? `<p class="lede">Re-run with Apply checked to open a proposal.</p>`
              : ""
        }
      </div>
      ${
        intents
          ? `<h2>Intent ranking</h2>
             <table><thead><tr><th>Score</th><th>Id</th><th>Name</th></tr></thead>
             <tbody>${intents}</tbody></table>`
          : ""
      }
      <h2>Control path</h2>
      <div class="card path-audit">${esc(result.path.join(" → "))}</div>`;
  }

  return renderShell({
    title: "Autopilot",
    active: "autopilot",
    pack,
    controlPath,
    bodyHtml: `
      <h1>Graph Autopilot</h1>
      <p class="lede">Closed-world operate from language: utterance → intent → NBA → human-gated proposal. Zero model invent. Zero adapter mutation.</p>
      ${form}
      ${resultHtml}`,
  });
}
