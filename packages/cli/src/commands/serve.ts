/**
 * `cox cx serve` — hosted dashboard via node:http (offline, localhost-only).
 * No auth for now (protected network assumption); offline wiring only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildOpsBoard, buildWorkQueue, renderOpsDashboardHtml } from "@cox/cx-ops";
import { resolveCxRoot } from "@cox/cx-ops";

export interface ServeOpts {
  port: number;
  cwd: string;
  write: (line: string) => void;
}

function workspaceDeps(cwd: string) {
  const cxRoot = resolveCxRoot(cwd);
  const now = () => new Date().toISOString();
  return { cxRoot, now };
}

async function renderDashboard(cwd: string): Promise<string> {
  const ws = workspaceDeps(cwd);
  const board = await buildOpsBoard(ws);
  const queue = await buildWorkQueue(ws);
  return renderOpsDashboardHtml(board, queue, ws.now());
}

export async function runCxServe(ctx: { cwd: string; write: (s: string) => void }, opts: { port: number }): Promise<number> {
  const port = opts.port;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    ctx.write(`invalid --port "${opts.port}" (1-65535)`);
    return 2;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/healthz" || url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, at: new Date().toISOString() }));
      return;
    }
    if (url.pathname !== "/" && url.pathname !== "/dashboard") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    try {
      const html = await renderDashboard(ctx.cwd);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(html);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`dashboard error: ${msg}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  const boundPort = typeof addr === "object" && addr ? addr.port : port;
  ctx.write(`CXOS dashboard serving (offline, no auth) at http://127.0.0.1:${boundPort}/`);
  ctx.write(`health: http://127.0.0.1:${boundPort}/healthz  —  Ctrl+C to stop`);
  ctx.write(`path: serve → listen:${boundPort} → render_html → emit`);

  // Keep alive until SIGINT/SIGTERM or server close
  await new Promise<void>((resolve) => {
    const close = () => {
      server.close(() => resolve());
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    server.once("close", () => resolve());
  });

  return 0;
}
