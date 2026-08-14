import type { WorldRecord } from "@cox/cx-world";
import { heardList, renderAppShell, esc } from "./app-shell.js";

export function renderAppHome(opts: {
  specName: string;
  pack: string;
  world: WorldRecord | null;
}): string {
  const brand = opts.world?.wordmap.brand ?? opts.specName;
  const pack = opts.world?.wordmap.packId ?? opts.pack;
  const empty = !opts.world
    ? `<div class="empty" role="status"><strong>This world is unnamed.</strong> Describe how you work:
        <code>cox cx world ${esc(opts.specName)} "…"</code></div>`
    : "";
  const cands = opts.world?.wordmap.candidates ?? [];
  const teach =
    cands.length > 0
      ? `<p class="lede">I will not invent: ${cands.map((c) => esc(c.display)).join(", ")}. Teach later.</p>`
      : "";
  return renderAppShell({
    title: "Home",
    brand,
    active: "home",
    specName: opts.specName,
    pack,
    wordmap: opts.world?.wordmap,
    controlPath: opts.world?.wordmap.path ?? ["app", "home", "emit"],
    bodyHtml: `
      <h1>${esc(brand)}</h1>
      <p class="lede">I heard your world. I will only act inside it.</p>
      ${empty}
      <h2>I heard</h2>
      ${heardList(opts.world?.wordmap)}
      ${teach}
      <p><a class="btn btn-primary" href="/app/today?spec=${esc(opts.specName)}&pack=${esc(pack)}">What is happening today?</a></p>
    `,
  });
}
