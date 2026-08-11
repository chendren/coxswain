/**
 * Shell renderer for Nebula Ops console.
 * Self-contained HTML with no external assets (CDNs, fonts, analytics).
 */
import { CONSOLE_CSS } from "./theme.js";

export interface ShellOpts {
  title: string;
  active: "fleet" | "queue" | "graph" | "intent" | "health";
  pack: string;
  bodyHtml: string;
  controlPath: string[];
  generatedAt?: string;
  extraHead?: string;
  extraScript?: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPathAudit(path: string[]): string {
  if (path.length === 0) return "";
  const max = 8;
  if (path.length <= max) return path.join(" → ");
  const head = path.slice(0, 3);
  const tail = path.slice(-3);
  return [...head, "...", ...tail].join(" → ");
}

export function renderShell(opts: ShellOpts): string {
  const at = opts.generatedAt ?? new Date().toISOString();
  const active = opts.active;
  const navItems: { id: typeof active; label: string; href: string }[] = [
    { id: "fleet", label: "Fleet", href: "/console/fleet" },
    { id: "queue", label: "Queue", href: "/console/queue" },
    { id: "graph", label: "Graph", href: "/console/graph" },
    { id: "intent", label: "Intent", href: "/console/intent" },
    { id: "health", label: "Health", href: "/console/health" },
  ];

  const navLinks = navItems
    .map((n) => {
      const href = `${n.href}?pack=${encodeURIComponent(opts.pack)}`;
      return `<a class="${active === n.id ? "active" : ""}" href="${esc(href)}">${esc(n.label)}</a>`;
    })
    .join("\n");

  const controlPathHtml =
    opts.controlPath.length > 0
      ? `<div class="path-audit">control: ${esc(formatPathAudit(opts.controlPath))}</div>`
      : "";

  // Valid browser JS only (no TypeScript annotations).
  const keyboardScript = `
<script>
(function () {
  var armed = false;
  var timer = null;
  document.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!armed && (e.key === "g" || e.key === "G")) {
      armed = true;
      clearTimeout(timer);
      timer = setTimeout(function () { armed = false; }, 800);
      return;
    }
    if (!armed) return;
    armed = false;
    clearTimeout(timer);
    var pack = ${JSON.stringify(opts.pack)};
    var q = pack ? ("?pack=" + encodeURIComponent(pack)) : "";
    var k = e.key.toLowerCase();
    if (k === "f") location.href = "/console/fleet" + q;
    else if (k === "q") location.href = "/console/queue" + q;
    else if (k === "g") location.href = "/console/graph" + q;
    else if (k === "i") location.href = "/console/intent" + q;
    else if (k === "h") location.href = "/console/health" + q;
  });
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CXOS · ${esc(opts.title)}</title>
<style>${CONSOLE_CSS}</style>
${opts.extraHead ?? ""}
</head>
<body class="app">
  <aside class="rail" aria-label="Primary">
    <div class="brand-block">
      <div class="brand">CX Graph Console</div>
      <div class="subtitle">closed-world · offline</div>
    </div>
    <nav class="nav">
      <a href="/console/fleet?pack=${esc(opts.pack)}" class="${active === "fleet" ? "active" : ""}">Fleet</a>
      ${navLinks}
    </nav>
    <div class="rail-foot">
      <span class="chip chip-mode">pack ${esc(opts.pack)}</span>
      <a class="rail-link" href="/legacy">Legacy HTML</a>
      <a class="rail-link" href="/api/health">/api/health</a>
    </div>
  </aside>

  <div class="stage">
    <header class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">${esc(opts.title)}</h1>
        <span class="subtitle">human-gated · plan-only AWS</span>
      </div>
      <div class="topbar-right">
        <span class="chip" style="color:var(--accent-cyan)">pack: ${esc(opts.pack)}</span>
        <time class="clock" datetime="${esc(at)}">${esc(at)}</time>
      </div>
    </header>

    <section class="main" id="main">
      ${opts.bodyHtml}
    </section>

    <footer class="footer">
      ${controlPathHtml}
      <span class="footer-hint">Prefer 127.0.0.1 if localhost fails (IPv6).</span>
    </footer>
  </div>
  ${keyboardScript}
  ${opts.extraScript ?? ""}
</body>
</html>`;
}
