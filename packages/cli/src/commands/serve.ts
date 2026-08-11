/**
 * `cox cx serve` — CX Graph Console (offline, localhost-only).
 * Multi-page Nebula Ops UI + JSON API. No auth (protected network assumption).
 */
import { startConsoleServer } from "@cox/cx-console";

export async function runCxServe(
  ctx: { cwd: string; write: (s: string) => void },
  opts: { port: number },
): Promise<number> {
  const port = opts.port;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    ctx.write(`invalid --port "${opts.port}" (1-65535)`);
    return 2;
  }

  const server = await startConsoleServer({
    port,
    cwd: ctx.cwd,
    write: ctx.write,
  });

  await new Promise<void>((resolve) => {
    const close = () => {
      void server.close().then(() => resolve());
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });

  return 0;
}
