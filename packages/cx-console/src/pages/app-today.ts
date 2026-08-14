import type { AutopilotResult } from "@cox/cx-ops";
import type { WorldRecord } from "@cox/cx-world";
import { displayForUid } from "@cox/cx-world";
import { renderAppShell, esc } from "./app-shell.js";

export function renderAppToday(opts: {
  specName: string;
  pack: string;
  world: WorldRecord | null;
  utterance: string;
  result?: AutopilotResult | null;
  error?: string;
  flash?: string;
}): string {
  const brand = opts.world?.wordmap.brand ?? opts.specName;
  const pack = opts.world?.wordmap.packId ?? opts.pack;
  const wm = opts.world?.wordmap;

  const form = `
    <form class="card" method="get" action="/app/today">
      <input type="hidden" name="spec" value="${esc(opts.specName)}"/>
      <input type="hidden" name="pack" value="${esc(pack)}"/>
      <label><span class="label">What is happening?</span>
        <textarea name="u" rows="3" placeholder="Refunds backing up in stores after the holiday"
          style="width:100%;padding:10px;background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;">${esc(opts.utterance)}</textarea>
      </label>
      <p><button class="btn btn-primary" type="submit">Listen</button></p>
    </form>`;

  const flash = opts.flash ? `<div class="banner" role="status">${esc(opts.flash)}</div>` : "";

  let resultHtml = "";
  if (opts.error) {
    resultHtml = `<div class="empty">${esc(opts.error)}</div>`;
  } else if (opts.result) {
    const refuse = opts.result.route.mode === "refuse";
    const intentName = opts.result.primaryIntent
      ? wm
        ? displayForUid(
            wm,
            `intent:${opts.result.primaryIntent.intentId}`,
            opts.result.primaryIntent.name,
          )
        : opts.result.primaryIntent.name
      : "something in this world";
    const nba = opts.result.nba.primary;
    const nbaLabel = nba
      ? wm
        ? displayForUid(wm, `nba_rule:${nba.id}`, nba.action)
        : nba.action
      : "look more carefully; do not invent a new journey";
    const opened = opts.result.persisted?.[0];
    const take = opened
      ? `<form class="inline-act" method="POST" action="/app/today/take">
           <input type="hidden" name="spec" value="${esc(opts.specName)}"/>
           <input type="hidden" name="id" value="${esc(opened.id)}"/>
           <input type="hidden" name="pack" value="${esc(pack)}"/>
           <button class="btn btn-primary" type="submit">I'll take this</button>
         </form>
         <form class="inline-act" method="POST" action="/console/queue/action">
           <input type="hidden" name="action" value="dismiss"/>
           <input type="hidden" name="spec" value="${esc(opts.specName)}"/>
           <input type="hidden" name="id" value="${esc(opened.id)}"/>
           <input type="hidden" name="pack" value="${esc(pack)}"/>
           <button class="btn btn-ghost" type="submit">Not that</button>
         </form>`
      : "";
    resultHtml = `
      <div class="card ${refuse ? "card-danger" : ""}">
        ${
          refuse
            ? `<p><strong>I will not invent a new reason.</strong> Teach me, or pick from the world.</p>`
            : `<p>This sounds like <strong>${esc(intentName)}</strong>.</p>
               <p>Next: <strong>${esc(nbaLabel)}</strong>.</p>`
        }
        ${take}
      </div>
      <details>
        <summary>How we know</summary>
        <pre class="evidence-body">${esc(opts.result.summary)}\n${opts.result.path.join(" → ")}</pre>
      </details>`;
  }

  return renderAppShell({
    title: "Today",
    brand,
    active: "today",
    specName: opts.specName,
    pack,
    wordmap: wm,
    controlPath: opts.result?.path ?? ["app", "today", "emit"],
    bodyHtml: `
      <h1>Today</h1>
      <p class="lede">Say what is happening. I will only move inside this world.</p>
      ${flash}
      ${form}
      ${resultHtml}
    `,
  });
}
