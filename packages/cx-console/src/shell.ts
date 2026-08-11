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
    .map(
      (n) =>
        `<a class="${active === n.id ? "active" : ""}" href="${esc(n.href)}">${esc(n.label)}</a>`,
    )
    .join("\n");

  const controlPathHtml =
    opts.controlPath.length > 0
      ? `<div class="path-audit">control: ${formatPathAudit(opts.controlPath)}</div>`
      : "";

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
  <aside class="rail">
    <div class="nav">
      <a href="/console" class="${active === "fleet" ? "active" : ""}">Home</a>
      ${navLinks}
    </div>
  </aside>

  <main>
    <header class="topbar">
      <div class="topbar-left">
        <span class="brand">CX Graph Console</span>
        <span class="subtitle">closed-world · human-gated · offline</span>
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <span class="chip" style="color:var(--accent-cyan)">pack: ${esc(opts.pack)}</span>
        <time class="clock" datetime="${esc(at)}">${esc(new Date().toLocaleTimeString())}</time>
      </div>
    </header>

    <section class="main">
      ${opts.bodyHtml}
    </section>

    <footer class="footer">
      ${controlPathHtml}
    </footer>
  </main>

  <script>
    // Keyboard shortcuts: g f → fleet, g q → queue, g g → graph, g i → intent
    document.addEventListener("keydown", (e) => {
      if (e.key === "g" || e.key === "G") {
        let timeout = setTimeout(() => {}, 0);
        clearTimeout(timeout);
        const nextKey = (ev: KeyboardEvent) => {
          ev.preventDefault();
          clearTimeout(timeout);
          switch (ev.key.toLowerCase()) {
            case "f": window.location.href = "/console/fleet"; break;
            case "q": window.location.href = "/console/queue"; break;
            case "g": window.location.href = "/console/graph"; break;
            case "i": window.location.href = "/console/intent"; break;
          }
        };
        document.addEventListener("keydown", nextKey, { once: true });
      }
    });
  </script>
  ${opts.extraScript ?? ""}
</body>
</html>`;
}
