import type { WorldRecord } from "@cox/cx-world";
import { renderAppShell, esc } from "./app-shell.js";

export function renderAppKnow(opts: {
  specName: string;
  pack: string;
  world: WorldRecord | null;
}): string {
  const brand = opts.world?.wordmap.brand ?? opts.specName;
  const entries = opts.world?.wordmap.entries ?? [];
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${esc(e.display)}</td><td>${esc(e.name)}</td><td><code>${esc(e.uid)}</code></td></tr>`,
    )
    .join("");
  return renderAppShell({
    title: "How we know",
    brand,
    active: "know",
    specName: opts.specName,
    pack: opts.world?.wordmap.packId ?? opts.pack,
    wordmap: opts.world?.wordmap,
    controlPath: opts.world?.wordmap.path ?? ["app", "know", "emit"],
    bodyHtml: `
      <h1>How we know</h1>
      <p class="lede">Strong graph only. Your words map to existing world nodes. We do not invent ids.</p>
      <table class="queue-table">
        <thead><tr><th>your words</th><th>world name</th><th>uid</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `,
  });
}
