/**
 * `cox cx serve` — CX Graph Console (offline, localhost-only).
 * Multi-page Nebula Ops UI + JSON API. No auth (protected network assumption).
 */
import { startConsoleServer } from "@cox/cx-console";

export async function runCxServe(
  ctx: { cwd: string; write: (s: string) => void },
  opts: { port: number; host?: string },
): Promise<number> {
  const port = opts.port;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    ctx.write(`invalid --port "${opts.port}" (1-65535)`);
    return 2;
  }

  try {
    const server = await startConsoleServer({
      port,
      cwd: ctx.cwd,
      write: ctx.write,
      host: opts.host,
    });

    await new Promise<void>((resolve) => {
      const close = () => {
        void server.close().then(() => resolve());
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.write(`serve failed: ${msg}`);
    if (msg.includes("EADDRINUSE")) {
      ctx.write(`port ${port} in use — try --port 8787`);
    }
    if (msg.includes("Cannot find module") || msg.includes("ERR_MODULE")) {
      ctx.write("tip: run  pnpm --filter @cox/cx-console build  then retry");
    }
    return 1;
  }

  return 0;
}
