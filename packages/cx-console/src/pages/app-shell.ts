import { CONSOLE_CSS } from "../theme.js";
import { esc } from "../shell.js";
export { esc };
import type { WorldWordmap } from "@cox/cx-world";

export type AppNav = "home" | "today" | "journeys" | "know";

export function renderAppShell(opts: {
  title: string;
  brand: string;
  active: AppNav;
  specName: string;
  pack: string;
  wordmap?: WorldWordmap;
  bodyHtml: string;
  controlPath: string[];
}): string {
  const q = `spec=${encodeURIComponent(opts.specName)}&pack=${encodeURIComponent(opts.pack)}`;
  const nav: { id: AppNav; label: string; href: string }[] = [
    { id: "home", label: "Home", href: `/app?${q}` },
    { id: "today", label: "Today", href: `/app/today?${q}` },
    { id: "journeys", label: "Journeys", href: `/app/journeys?${q}` },
    { id: "know", label: "How we know", href: `/app/know?${q}` },
  ];
  const links = nav
    .map(
      (n) =>
        `<a class="${opts.active === n.id ? "active" : ""}" href="${esc(n.href)}">${esc(n.label)}</a>`,
    )
    .join("");
  const path =
    opts.controlPath.length > 0
      ? `<div class="path-audit">control: ${esc(opts.controlPath.join(" → "))}</div>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(opts.brand)} · ${esc(opts.title)}</title>
<style>${CONSOLE_CSS}
.app-brand { font-size: 1.05rem; letter-spacing: 0.02em; }
.app-sub { color: var(--muted); font-size: 0.75rem; }
</style>
</head>
<body class="app">
  <aside class="rail" aria-label="World">
    <div class="brand-block">
      <div class="brand app-brand">${esc(opts.brand)}</div>
      <div class="subtitle app-sub">your world · closed · offline</div>
    </div>
    <nav class="nav">${links}</nav>
    <div class="rail-foot">
      <span class="chip chip-mode">${esc(opts.wordmap?.packId ? `sounds like ${opts.wordmap.packId}` : "world")}</span>
      <a class="rail-link" href="/console/fleet?pack=${esc(opts.pack)}">Operator console</a>
    </div>
  </aside>
  <div class="stage">
    <header class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">${esc(opts.title)}</h1>
        <span class="subtitle">acts only inside this world</span>
      </div>
    </header>
    <section class="main">${opts.bodyHtml}</section>
    <footer class="footer">
      ${path}
      <details class="handoff">
        <summary>Handoff</summary>
        <p class="lede">Plan-only AWS and CAB live in the engine. Humans apply CloudFormation. Never CreateStack from this app.</p>
        <p><code>cox cx cab-export ${esc(opts.specName)}</code></p>
      </details>
    </footer>
  </div>
</body>
</html>`;
}

export function heardList(wordmap?: WorldWordmap): string {
  if (!wordmap || wordmap.entries.length === 0) {
    return `<div class="empty">Tell this world first: <code>cox cx world ${"{name}"} "how we work…"</code></div>`;
  }
  const items = wordmap.entries
    .slice(0, 12)
    .map((e) => `<li><strong>${esc(e.display)}</strong> <span class="muted">as ${esc(e.name)}</span></li>`)
    .join("");
  return `<ul class="heard">${items}</ul>`;
}
