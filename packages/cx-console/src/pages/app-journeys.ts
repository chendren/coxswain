import type { WorldRecord } from "@cox/cx-world";
import { heardList, renderAppShell, esc } from "./app-shell.js";

export function renderAppJourneys(opts: {
  specName: string;
  pack: string;
  world: WorldRecord | null;
}): string {
  const brand = opts.world?.wordmap.brand ?? opts.specName;
  const journeys = (opts.world?.wordmap.entries ?? []).filter((e) => e.kind === "journey");
  const rows =
    journeys.length === 0
      ? `<div class="empty">No journeys heard yet. Tell the world in a paragraph.</div>`
      : `<ul class="heard">${journeys
          .map((j) => `<li><strong>${esc(j.display)}</strong> · ${esc(j.name)}</li>`)
          .join("")}</ul>`;
  return renderAppShell({
    title: "Journeys",
    brand,
    active: "journeys",
    specName: opts.specName,
    pack: opts.world?.wordmap.packId ?? opts.pack,
    wordmap: opts.world?.wordmap,
    controlPath: ["app", "journeys", "emit"],
    bodyHtml: `
      <h1>Journeys in this world</h1>
      <p class="lede">Only closed-world paths. Nothing invented.</p>
      ${rows}
      <h2>All I heard</h2>
      ${heardList(opts.world?.wordmap)}
    `,
  });
}
