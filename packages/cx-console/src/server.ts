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
  apiAutopilot,
  apiIntent,
  apiNeighborhood,
  apiProposalAction,
  apiQueue,
  packOf,
  type ProposalAction,
} from "./api.js";
import { renderNeighborhoodSvg } from "./graph-svg.js";
import { renderAutopilotPage } from "./pages/autopilot.js";
import { renderFleetPage } from "./pages/fleet.js";
import { renderGraphPage } from "./pages/graph.js";
import { renderHealthPage } from "./pages/health.js";
import { renderIntentPage } from "./pages/intent.js";
import { renderQueuePage } from "./pages/queue.js";
import { esc } from "./shell.js";

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseActionParams(
  req: IncomingMessage,
  url: URL,
): Promise<{
  action: string;
  spec: string;
  id: string;
  actor: string;
  pack: string;
}> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "POST") {
    const raw = await readBody(req);
    const body = new URLSearchParams(raw);
    return {
      action: body.get("action") ?? url.searchParams.get("action") ?? "",
      spec: body.get("spec") ?? url.searchParams.get("spec") ?? "",
      id: body.get("id") ?? url.searchParams.get("id") ?? "",
      actor: body.get("actor") ?? url.searchParams.get("actor") ?? "",
      pack: body.get("pack") ?? url.searchParams.get("pack") ?? "local",
    };
  }
  return {
    action: url.searchParams.get("action") ?? "",
    spec: url.searchParams.get("spec") ?? "",
    id: url.searchParams.get("id") ?? "",
    actor: url.searchParams.get("actor") ?? "",
    pack: url.searchParams.get("pack") ?? "local",
  };
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
    if (url.pathname === "/api/proposal/action") {
      const p = await parseActionParams(req, url);
      const action = p.action as ProposalAction;
      if (action !== "claim" && action !== "dismiss") {
        sendJson(res, 400, {
          ok: false,
          path: ["api_proposal_action", "fail"],
          error: "action must be claim|dismiss",
          at: deps.now(),
        });
        return;
      }
      const result = await apiProposalAction(deps, {
        specName: p.spec,
        id: p.id,
        action,
        actor: p.actor || undefined,
      });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (url.pathname === "/console/queue/action") {
      const p = await parseActionParams(req, url);
      const packQ = packOf(p.pack);
      const action = p.action as ProposalAction;
      if (action !== "claim" && action !== "dismiss") {
        res.writeHead(302, {
          location: `/console/queue?pack=${encodeURIComponent(packQ)}&msg=${encodeURIComponent("invalid action")}`,
          "cache-control": "no-store",
        });
        res.end();
        return;
      }
      const result = await apiProposalAction(deps, {
        specName: p.spec,
        id: p.id,
        action,
        actor: p.actor || undefined,
      });
      const msg = result.ok
        ? action === "claim"
          ? `claimed ${p.id} → task ${(result.data as { taskId?: string })?.taskId ?? ""}`.trim()
          : `dismissed ${p.id}`
        : `error: ${result.error ?? "failed"}`;
      res.writeHead(302, {
        location: `/console/queue?pack=${encodeURIComponent(packQ)}&msg=${encodeURIComponent(msg)}`,
        "cache-control": "no-store",
      });
      res.end();
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
    if (url.pathname === "/api/autopilot") {
      const specName = url.searchParams.get("spec") ?? "";
      const utterance = url.searchParams.get("u") ?? url.searchParams.get("utterance") ?? "";
      const apply = url.searchParams.get("apply") === "1" || url.searchParams.get("apply") === "true";
      if (!specName) {
        sendJson(res, 400, {
          ok: false,
          path: ["api_autopilot", "fail"],
          error: "missing spec",
          at: deps.now(),
        });
        return;
      }
      sendJson(
        res,
        200,
        await apiAutopilot(deps, {
          specName,
          utterance,
          apply,
          pack,
          actor: url.searchParams.get("actor") ?? undefined,
        }),
      );
      return;
    }

    if (url.pathname === "/" || url.pathname === "/console") {
      res.writeHead(302, {
        location: `/console/fleet?pack=${encodeURIComponent(pack)}`,
        "cache-control": "no-store",
      });
      res.end();
      return;
    }
    if (url.pathname === "/console/fleet") {
      const board = await buildOpsBoard(deps);
      send(res, 200, renderFleetPage(board, pack), "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/console/queue") {
      const q = await buildWorkQueue(deps);
      const flash = url.searchParams.get("msg") ?? undefined;
      send(res, 200, renderQueuePage(q, pack, flash ?? undefined), "text/html; charset=utf-8");
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
    if (url.pathname === "/console/autopilot") {
      const specName = url.searchParams.get("spec") ?? "";
      const utterance = url.searchParams.get("u") ?? "";
      const apply =
        url.searchParams.get("apply") === "1" || url.searchParams.get("apply") === "true";
      let result = null as Awaited<ReturnType<typeof apiAutopilot>>["data"] | null | undefined;
      let error: string | undefined;
      let controlPath = ["autopilot_page", "emit"];
      if (specName && utterance) {
        const api = await apiAutopilot(deps, { specName, utterance, apply, pack });
        if (!api.ok && api.error) error = api.error;
        result = api.data;
        controlPath = api.path ?? controlPath;
      }
      send(
        res,
        200,
        renderAutopilotPage({
          pack,
          specName,
          utterance,
          apply,
          result: result ?? null,
          error,
          controlPath,
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

async function listenOn(
  server: ReturnType<typeof createServer>,
  port: number,
  host: string,
): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : port;
}

/**
 * Bind loopback for both IPv4 and IPv6 when possible.
 * Safari/Chrome often hit http://localhost → ::1; IPv4-only bind looks "broken".
 */
export async function startConsoleServer(
  opts: ConsoleServerOpts,
): Promise<{ close: () => Promise<void>; port: number }> {
  const deps = workspace(opts.cwd);
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    void handleConsoleRequest(req, res, deps);
  };

  // Explicit host wins (single bind).
  if (opts.host) {
    const server = createServer(handler);
    const bound = await listenOn(server, opts.port, opts.host);
    opts.write(`CX Graph Console (offline) http://${opts.host}:${bound}/console/fleet`);
    opts.write(`API health http://${opts.host}:${bound}/api/health  - Ctrl+C to stop`);
    opts.write(`path: serve → console_router → emit`);
    return {
      port: bound,
      close: () => new Promise((resolve) => server.close(() => resolve())),
    };
  }

  // Dual loopback: 127.0.0.1 + ::1 (skip ::1 if unavailable).
  // Fixed port required so both share the same number; port 0 uses IPv4 only.
  const servers: Array<ReturnType<typeof createServer>> = [];
  const v4 = createServer(handler);
  const bound = await listenOn(v4, opts.port, "127.0.0.1");
  servers.push(v4);

  if (opts.port !== 0) {
    try {
      const v6 = createServer(handler);
      await listenOn(v6, bound, "::1");
      servers.push(v6);
    } catch {
      opts.write(`note: IPv6 ::1 bind skipped (use http://127.0.0.1:${bound}/console/fleet)`);
    }
  }

  opts.write(`CX Graph Console (offline)`);
  opts.write(`  open → http://127.0.0.1:${bound}/console/fleet`);
  opts.write(`  open → http://localhost:${bound}/console/fleet`);
  opts.write(`  api  → http://127.0.0.1:${bound}/api/health`);
  opts.write(`path: serve → console_router → emit  (Ctrl+C to stop)`);

  return {
    port: bound,
    close: () =>
      Promise.all(
        servers.map(
          (s) =>
            new Promise<void>((resolve) => {
              s.close(() => resolve());
            }),
        ),
      ).then(() => undefined),
  };
}
