import { renderShell, esc } from "../shell";

export interface HealthStats {
  nodes: number;
  edges: number;
  hubs: number;
  byKind: Record<string, number>;
}

export function renderHealthPage(opts: {
  pack: string;
  stats?: HealthStats;
  at?: string;
  controlPath: string[];
}): string {
  const { pack, stats, at = new Date().toISOString(), controlPath } = opts;

  let statsCards = "";
  if (stats) {
    const byKindChips = Object.entries(stats.byKind || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<span class="chip chip-gray">${esc(k)}: ${v}</span>`)
      .join("");

    statsCards = `
      <div class="cards">
        <div class="card"><span class="label">nodes</span><strong>${stats.nodes || 0}</strong></div>
        <div class="card"><span class="label">edges</span><strong>${stats.edges || 0}</strong></div>
        <div class="card"><span class="label">hubs</span><strong>${stats.hubs || 0}</strong></div>
      </div>
      <div style="margin-top:16px;">
        <span class="label">by kind</span>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
          ${byKindChips || '<span class="chip chip-gray">none</span>'}
        </div>
      </div>`;
  } else {
    statsCards = `
      <div class="empty">
        No graph statistics available. Load a pack to compute health metrics.
      </div>`;
  }

  const statusOk = stats ? "ok" : "unknown";
  const statusClass = statusOk === "ok" ? "chip-green" : "chip-gray";

  return renderShell({
    title: "Health",
    active: "health",
    pack,
    controlPath,
    bodyHtml: `
      <h1>Graph health</h1>
      <p class="lede">Strong-graph integrity for pack <code>${esc(pack)}</code>. Offline · no model calls.</p>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <span class="chip ${statusClass}">status: ${esc(statusOk)}</span>
        <time datetime="${esc(at)}" style="color:var(--muted);font-size:0.9rem;">${esc(at)}</time>
      </div>

      <h2>Strong graph</h2>
      ${statsCards}

      <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/console/graph?pack=${esc(pack)}" class="btn">Open graph explorer</a>
        <a href="/legacy?pack=${esc(pack)}" class="btn btn-ghost">Legacy dashboard</a>
      </div>`,
  });
}
