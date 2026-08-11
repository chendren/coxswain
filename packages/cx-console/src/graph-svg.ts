export interface SvgNode {
  uid: string;
  label: string;
  kind: string;
  distance: number;
}

/** Radial layout: center start, rings by distance */
export function layoutRadial(
  distances: Record<string, number>,
  opts?: { width?: number; height?: number },
): Array<SvgNode & { x: number; y: number }> {
  const width = opts?.width ?? 720;
  const height = opts?.height ?? 480;
  const cx = width / 2;
  const cy = height / 2;
  // group by distance
  const byD = new Map<number, string[]>();
  for (const [uid, d] of Object.entries(distances)) {
    const list = byD.get(d) ?? [];
    list.push(uid);
    byD.set(d, list);
  }
  const out: Array<SvgNode & { x: number; y: number }> = [];
  for (const [d, uids] of [...byD.entries()].sort((a, b) => a[0] - b[0])) {
    const radius = d === 0 ? 0 : 60 + d * 70;
    uids.forEach((uid, i) => {
      const angle = (2 * Math.PI * i) / Math.max(uids.length, 1) - Math.PI / 2;
      const x = d === 0 ? cx : cx + radius * Math.cos(angle);
      const y = d === 0 ? cy : cy + radius * Math.sin(angle);
      const kind = uid.split(":")[0] ?? "node";
      const label = uid.length > 28 ? uid.slice(0, 26) + "…" : uid;
      out.push({ uid, label, kind, distance: d, x, y });
    });
  }
  return out;
}

export function renderNeighborhoodSvg(
  distances: Record<string, number>,
  highlightPath: string[] = [],
): string {
  const width = 720;
  const height = 480;
  const nodes = layoutRadial(distances, { width, height });
  const byUid = new Map(nodes.map((n) => [n.uid, n]));
  // edges: connect each node to nearest lower-distance neighbor (heuristic) OR only draw rings
  // Simple: for each node with d>0, connect to a parent candidate with d-1 (first in list)
  const parents = new Map<number, string[]>();
  for (const n of nodes) {
    const list = parents.get(n.distance) ?? [];
    list.push(n.uid);
    parents.set(n.distance, list);
  }
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.distance <= 0) continue;
    const cands = parents.get(n.distance - 1) ?? [];
    const parentUid = cands[0];
    if (!parentUid) continue;
    const p = byUid.get(parentUid);
    if (!p) continue;
    const onPath =
      highlightPath.includes(n.uid) && highlightPath.includes(p.uid);
    lines.push(
      `<line x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}" class="g-edge${onPath ? " on-path" : ""}"/>`,
    );
  }
  const circles = nodes
    .map((n) => {
      const sel = highlightPath.includes(n.uid) ? " sel" : "";
      return `<g class="g-node d${n.distance}${sel}" data-uid="${escAttr(n.uid)}">
        <circle cx="${n.x}" cy="${n.y}" r="${n.distance === 0 ? 16 : 11}"/>
        <text x="${n.x}" y="${n.y + 28}" text-anchor="middle">${escAttr(n.label)}</text>
      </g>`;
    })
    .join("\n");
  return `<svg class="graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Strong graph neighborhood">${lines.join("")}${circles}</svg>`;
}

function escAttr(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}
