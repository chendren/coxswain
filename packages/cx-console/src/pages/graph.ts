import { renderShell, esc } from "../shell";

export function renderGraphPage(opts: {
  pack: string;
  query?: string;
  findHtml?: string;
  routeChip?: string;
  pathDisplay?: string;
  neighborhoodSvg?: string;
  controlPath: string[];
  from?: string;
  to?: string;
  start?: string;
  k?: number;
}): string {
  const {
    pack,
    query = "",
    findHtml = "",
    routeChip = "",
    pathDisplay = "",
    neighborhoodSvg = "",
    controlPath,
    from = "domain:billing",
    to = "intent:billing.payment_issue",
    start = from,
    k = 2,
  } = opts;

  const searchForm = `
    <form class="card" action="/console/graph" method="get">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="hidden" name="pack" value="${esc(pack)}"/>
        <input type="hidden" name="from" value="${esc(from)}"/>
        <input type="hidden" name="to" value="${esc(to)}"/>
        <input type="hidden" name="start" value="${esc(start)}"/>
        <input type="hidden" name="k" value="${k}"/>
        <input type="text" name="q" placeholder="Search nodes (e.g. billing, domain:billing)" value="${esc(query)}"
          style="flex:1;min-width:200px;padding:8px 12px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;font-size:0.9rem;"/>
        <button type="submit" class="btn">Find</button>
      </div>
    </form>`;

  const routeChipHtml = routeChip
    ? `<div style="margin:12px 0;">${routeChip}</div>`
    : "";

  const findSection = findHtml
    ? `<h2>Find results</h2>${findHtml}`
    : "";

  const pathForm = `
    <form class="card" action="/console/graph" method="get" style="margin-top:16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="hidden" name="pack" value="${esc(pack)}"/>
        <input type="hidden" name="q" value="${esc(query)}"/>
        <span style="color:var(--muted);font-size:0.9rem;">Path</span>
        <input type="text" name="from" value="${esc(from)}" placeholder="domain:billing"
          style="flex:1;min-width:140px;padding:8px 12px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;font-size:0.9rem;"/>
        <span style="color:var(--muted);">→</span>
        <input type="text" name="to" value="${esc(to)}" placeholder="intent:billing.payment_issue"
          style="flex:1;min-width:140px;padding:8px 12px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;font-size:0.9rem;"/>
        <span style="color:var(--muted);font-size:0.9rem;">k-hop</span>
        <input type="number" name="k" value="${k}" min="1" max="8"
          style="width:56px;padding:8px 12px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;"/>
        <input type="hidden" name="start" value="${esc(start)}"/>
        <button type="submit" class="btn">Traverse</button>
      </div>
    </form>`;

  const pathSection = pathDisplay
    ? `<h2 style="margin-top:16px;">Shortest path</h2>
       <div class="card"><code style="color:var(--accent-cyan)">${esc(pathDisplay)}</code></div>`
    : `<h2 style="margin-top:16px;">Shortest path</h2>
       <div class="empty">No path within max hops (or uids missing). Try graph-find first.</div>`;

  const neighborhoodSection = neighborhoodSvg
    ? neighborhoodSvg
    : `<div class="empty">No neighborhood — set start uid.</div>`;

  const clientScript = `
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-uid]');
      if (!t) return;
      const uid = t.getAttribute('data-uid');
      if (!uid) return;
      const fromInput = document.querySelector('input[name="from"]');
      const startInput = document.querySelector('input[name="start"]');
      if (fromInput) fromInput.value = uid;
      if (startInput) startInput.value = uid;
    });
  `;

  return renderShell({
    title: "Graph explorer",
    active: "graph",
    pack,
    controlPath,
    extraScript: `<script>${clientScript}</script>`,
    bodyHtml: `
      <h1>Graph explorer</h1>
      <p class="lede">Failure-aware closed-world navigation. Strong nodes only — multi-hop paths with path audit.</p>
      ${searchForm}
      ${routeChipHtml}
      ${findSection}
      ${pathForm}
      ${pathSection}
      <h2 style="margin-top:20px;">Neighborhood map</h2>
      <p class="lede">Radial k-hop from start. Click a node to set path from. Pure SVG, offline.</p>
      ${neighborhoodSection}`,
  });
}
