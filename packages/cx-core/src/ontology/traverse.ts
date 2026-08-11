import type { CxStrongGraph, GraphEdgeKind, StrongNode } from "./graph";

export interface GraphPath {
  /** Node uids including start and end */
  nodes: string[];
  /** Edge kinds for each hop (length = nodes.length - 1) */
  edges: GraphEdgeKind[];
  hops: number;
}

export interface TraverseOptions {
  maxHops?: number; // default 3
  edgeKinds?: GraphEdgeKind[]; // if set, only these edges
  directed?: boolean; // default true (follow e.from → e.to only). false = treat edges undirected
}

function adjList(
  graph: CxStrongGraph,
  opts: TraverseOptions,
): Map<string, Array<{ to: string; kind: GraphEdgeKind }>> {
  const directed = opts.directed !== false;
  const allow = opts.edgeKinds ? new Set(opts.edgeKinds) : null;
  const m = new Map<string, Array<{ to: string; kind: GraphEdgeKind }>>();
  const push = (from: string, to: string, kind: GraphEdgeKind) => {
    if (allow && !allow.has(kind)) return;
    const list = m.get(from) ?? [];
    list.push({ to, kind });
    m.set(from, list);
  };
  for (const e of graph.edges) {
    push(e.from, e.to, e.kind);
    if (!directed) push(e.to, e.from, e.kind);
  }
  return m;
}

/** k-hop neighborhood (BFS). Includes start at distance 0. */
export function kHopNeighborhood(
  graph: CxStrongGraph,
  startUid: string,
  k: number = 2,
  opts: TraverseOptions = {},
): Map<string, number> {
  const maxHops = Math.max(0, Math.floor(k));
  const adj = adjList(graph, opts);
  const dist = new Map<string, number>();
  if (!graph.nodes.has(startUid)) return dist;
  const q: string[] = [startUid];
  dist.set(startUid, 0);
  while (q.length) {
    const u = q.shift()!;
    const d = dist.get(u)!;
    if (d >= maxHops) continue;
    for (const { to } of adj.get(u) ?? []) {
      if (dist.has(to)) continue;
      dist.set(to, d + 1);
      q.push(to);
    }
  }
  return dist;
}

/** Shortest path (BFS) between two strong uids. undefined if none within maxHops. */
export function shortestPath(
  graph: CxStrongGraph,
  fromUid: string,
  toUid: string,
  opts: TraverseOptions = {},
): GraphPath | undefined {
  const maxHops = opts.maxHops ?? 3;
  if (!graph.nodes.has(fromUid) || !graph.nodes.has(toUid)) return undefined;
  if (fromUid === toUid) return { nodes: [fromUid], edges: [], hops: 0 };
  const adj = adjList(graph, opts);
  const prev = new Map<string, { from: string; kind: GraphEdgeKind }>();
  const dist = new Map<string, number>([[fromUid, 0]]);
  const q: string[] = [fromUid];
  while (q.length) {
    const u = q.shift()!;
    const d = dist.get(u)!;
    if (d >= maxHops) continue;
    for (const { to, kind } of adj.get(u) ?? []) {
      if (dist.has(to)) continue;
      dist.set(to, d + 1);
      prev.set(to, { from: u, kind });
      if (to === toUid) {
        // reconstruct
        const nodes: string[] = [toUid];
        const edges: GraphEdgeKind[] = [];
        let cur = toUid;
        while (cur !== fromUid) {
          const p = prev.get(cur)!;
          edges.unshift(p.kind);
          nodes.unshift(p.from);
          cur = p.from;
        }
        return { nodes, edges, hops: edges.length };
      }
      q.push(to);
    }
  }
  return undefined;
}

/** All simple paths up to maxHops (cap results). */
export function findPaths(
  graph: CxStrongGraph,
  fromUid: string,
  toUid: string,
  opts: TraverseOptions & { limit?: number } = {},
): GraphPath[] {
  const maxHops = opts.maxHops ?? 3;
  const limit = opts.limit ?? 20;
  const out: GraphPath[] = [];
  if (!graph.nodes.has(fromUid) || !graph.nodes.has(toUid)) return out;
  const adj = adjList(graph, opts);

  function dfs(u: string, nodes: string[], edges: GraphEdgeKind[], visited: Set<string>): void {
    if (out.length >= limit) return;
    if (u === toUid && nodes.length > 1) {
      out.push({ nodes: [...nodes], edges: [...edges], hops: edges.length });
      return;
    }
    if (edges.length >= maxHops) return;
    for (const { to, kind } of adj.get(u) ?? []) {
      if (visited.has(to)) continue;
      visited.add(to);
      nodes.push(to);
      edges.push(kind);
      dfs(to, nodes, edges, visited);
      edges.pop();
      nodes.pop();
      visited.delete(to);
    }
  }
  dfs(fromUid, [fromUid], [], new Set([fromUid]));
  return out;
}

/** Resolve hop distances to StrongNode lists by distance. */
export function nodesAtDistance(
  graph: CxStrongGraph,
  startUid: string,
  distance: number,
  opts: TraverseOptions = {},
): StrongNode[] {
  const dist = kHopNeighborhood(graph, startUid, distance, opts);
  const out: StrongNode[] = [];
  for (const [uid, d] of dist) {
    if (d === distance) {
      const n = graph.nodes.get(uid);
      if (n) out.push(n);
    }
  }
  return out;
}

/** Compact path display: "domain:billing → HAS_INTENT → intent:billing.payment_issue" */
export function formatGraphPath(path: GraphPath): string {
  if (path.nodes.length === 0) return "";
  if (path.nodes.length === 1) return path.nodes[0]!;
  const parts: string[] = [path.nodes[0]!];
  for (let i = 0; i < path.edges.length; i++) {
    parts.push(path.edges[i]!);
    parts.push(path.nodes[i + 1]!);
  }
  return parts.join(" → ");
}
