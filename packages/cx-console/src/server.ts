/**
 * CX Graph Console HTTP router — offline localhost Graph-Node AI surface.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  buildOpsBoard,
  buildWorkQueue,
  renderOpsDashboardHtml,
  resolveCxRoot,
  type CxWorkspaceDeps,
} from "@cox/cx-ops";
import {
  apiFleet,
  apiGraphFind,
  apiGraphPath,
  apiGraphStats,
  apiHealth,
  apiIntent,
  apiNeighborhood,
  apiQueue,
  packOf,
} from "./api";
import { renderNeighborhoodSvg } from "./graph-svg";
import { renderFleetPage } from "./pages/fleet";
import { renderGraphPage } from "./pages/graph";
import { renderHealthPage } from "./pages/health";
import { renderIntentPage } from "./pages/intent";
import { renderQueuePage } from "./pages/queue";
import { esc } from "./shell";

export interface ConsoleServerOpts {
  port: number;
  cwd: string;
  write: (s: string) => void;
  host?: string;
}

function workspace(cwd: string): CxWorkspaceDeps {
  return { cxRoot: resolveCxRoot(cwd), now: () => new Date().toISOString() };
}

function send(res: ServerResponse, code: number, body: string, type: string): void {
  res.writeHead(code, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");
}

function hitsHtml(
  hits: Array<{ uid: string; kind: string; name: string; hubKey: string }>,
): string {
  if (hits.length === 0) {
    return `<div class="empty">No strong-node hits. Try a domain/intent fragment.</div>`;
  }
  const rows = hits
    .map(
      (h) =>
        `<tr data-uid="${esc(h.uid)}">
          <td><code>${esc(h.uid)}</code></td>
          <td>${esc(h.kind)}</td>
          <td>${esc(h.name)}</td>
          <td><code>${esc(h.hubKey)}</code></td>
        </tr>`,
    )
    .join("\n");
  return `<table><thead><tr><th>uid</th><th>kind</th><th>name</th><th>hub</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function handleConsoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CxWorkspaceDeps,
): Promise<void> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const pack = packOf(url.searchParams.get("pack") ?? "local");

  try {
    if (url.pathname === "/api/health" || url.pathname === "/healthz" || url.pathname === "/health") {
      sendJson(res, 200, apiHealth());
      return;
    }
    if (url.pathname === "/api/fleet") {
      sendJson(res, 200, await apiFleet(deps));
      return;
    }
    if (url.pathname === "/api/queue") {
      sendJson(res, 200, await apiQueue(deps));
      return;
    }
    if (url.pathname === "/api/graph/find") {
      sendJson(res, 200, apiGraphFind(pack, url.searchParams.get("q") ?? ""));
      return;
    }
    if (url.pathname === "/api/graph/path") {
      sendJson(
        res,
        200,
        apiGraphPath(
          pack,
          url.searchParams.get("from") ?? "",
          url.searchParams.get("to") ?? "",
          Number(url.searchParams.get("maxHops") ?? 4),
        ),
      );
      return;
    }
    if (url.pathname === "/api/graph/neighborhood") {
      sendJson(
        res,
        200,
        apiNeighborhood(
          pack,
          url.searchParams.get("start") ?? "",
          Number(url.searchParams.get("k") ?? 2),
        ),
      );
      return;
    }
    if (url.pathname === "/api/intent") {
      sendJson(res, 200, apiIntent(pack, url.searchParams.get("u") ?? ""));
      return;
    }
    if (url.pathname === "/api/graph/stats") {
      sendJson(res, 200, apiGraphStats(pack));
      return;
    }

    if (url.pathname === "/" || url.pathname === "/console" || url.pathname === "/console/fleet") {
      const board = await buildOpsBoard(deps);
      send(res, 200, renderFleetPage(board, pack), "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/console/queue") {
      const q = await buildWorkQueue(deps);
      send(res, 200, renderQueuePage(q, pack), "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/console/graph") {
      const q = url.searchParams.get("q") ?? "";
      const from = url.searchParams.get("from") ?? "domain:billing";
      const to = url.searchParams.get("to") ?? "intent:billing.payment_issue";
      const start = url.searchParams.get("start") ?? from;
      const k = Number(url.searchParams.get("k") ?? 2);
      const find = q ? apiGraphFind(pack, q) : null;
      const pathR = apiGraphPath(pack, from, to, Math.max(k, 4));
      const neigh = apiNeighborhood(pack, start, k);
      const distances = neigh.data?.distances ?? {};
      const svg = renderNeighborhoodSvg(distances, pathR.data?.path?.nodes ?? []);
      const route = find?.data?.route ?? pathR.data?.route;
      const routeChip = route
        ? `<span class="chip chip-mode">${esc(route.mode)}</span> <span class="chip chip-risk">risk ${route.risk}</span> <span class="chip chip-gray">${esc(route.reason)}</span>`
        : "";
      const html = renderGraphPage({
        pack,
        query: q,
        findHtml: find ? hitsHtml(find.data?.result.hits ?? []) : "",
        routeChip,
        pathDisplay: pathR.data?.pathDisplay,
        neighborhoodSvg: svg,
        from,
        to,
        start,
        k,
        controlPath: ["serve", "route_retrieval", "shortest_path", "k_hop", "emit"],
      });
      send(res, 200, html, "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/console/intent") {
      const u = url.searchParams.get("u") ?? "";
      const result = u ? apiIntent(pack, u) : null;
      send(
        res,
        200,
        renderIntentPage({
          pack,
          utterance: u,
          ranked: result?.data?.ranked,
          top: result?.data?.top,
          route: result?.data?.route,
          controlPath: result?.path ?? ["intent_page", "emit"],
        }),
        "text/html; charset=utf-8",
      );
      return;
    }
    if (url.pathname === "/console/health") {
      const stats = apiGraphStats(pack);
      send(
        res,
        200,
        renderHealthPage({
          pack,
          stats: stats.data,
          controlPath: stats.path,
          at: stats.at,
        }),
        "text/html; charset=utf-8",
      );
      return;
    }
    if (url.pathname === "/legacy" || url.pathname === "/dashboard") {
      const board = await buildOpsBoard(deps);
      const queue = await buildWorkQueue(deps);
      send(res, 200, renderOpsDashboardHtml(board, queue, deps.now()), "text/html; charset=utf-8");
      return;
    }

    send(res, 404, "not found", "text/plain; charset=utf-8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    send(res, 500, `console error: ${msg}`, "text/plain; charset=utf-8");
  }
}

export async function startConsoleServer(
  opts: ConsoleServerOpts,
): Promise<{ close: () => Promise<void>; port: number }> {
  const deps = workspace(opts.cwd);
  const host = opts.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    void handleConsoleRequest(req, res, deps);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, host, () => resolve());
  });
  const addr = server.address();
  const bound = typeof addr === "object" && addr ? addr.port : opts.port;
  opts.write(`CX Graph Console (offline) http://${host}:${bound}/console`);
  opts.write(`API health http://${host}:${bound}/api/health  — Ctrl+C to stop`);
  opts.write(`path: serve → console_router → emit`);
  return {
    port: bound,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
