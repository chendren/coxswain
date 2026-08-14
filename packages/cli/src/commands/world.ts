import { resolveCxRoot } from "@cox/cx-ops";
import { tellWorld } from "@cox/cx-world";
import { startConsoleServer } from "@cox/cx-console";

export async function runCxWorld(
  ctx: { cwd: string; write: (s: string) => void },
  name: string,
  ideaParts: string[],
): Promise<number> {
  const idea = ideaParts.join(" ").trim();
  if (!idea) {
    ctx.write("Tell the world in a sentence. Example:");
    ctx.write(`  cox cx world ${name || "northwind"} "Retail returns, loyalty, store pickup"`);
    return 2;
  }
  const deps = { cxRoot: resolveCxRoot(ctx.cwd), now: () => new Date().toISOString() };
  try {
    const r = await tellWorld(deps, name, idea);
    ctx.write(`${r.created ? "Made" : "Updated"} world "${r.specName}"`);
    ctx.write(`This sounds like ${r.wordmap.packId}.`);
    ctx.write(`I heard ${r.wordmap.entries.length} closed-world names.`);
    for (const e of r.wordmap.entries.slice(0, 8)) {
      ctx.write(`  "${e.display}" as ${e.name}`);
    }
    if (r.wordmap.candidates.length) {
      ctx.write(`I will not invent: ${r.wordmap.candidates.map((c) => c.display).join(", ")}`);
    }
    ctx.write(`path: ${r.path.join(" → ")}`);
    ctx.write(`next: cox cx app ${r.specName}`);
    return 0;
  } catch (e) {
    ctx.write(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

export async function runCxApp(
  ctx: { cwd: string; write: (s: string) => void },
  name: string | undefined,
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
      worldSpec: name,
    });
    ctx.write(`World app → http://127.0.0.1:${server.port}/app${name ? `?spec=${encodeURIComponent(name)}` : ""}`);
    ctx.write("Today → /app/today   (Ctrl+C to stop)");
    await new Promise<void>((resolve) => {
      const close = () => {
        void server.close().then(() => resolve());
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.write(`app failed: ${msg}`);
    return 1;
  }
  return 0;
}
