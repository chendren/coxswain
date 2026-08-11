/**
 * Nebula Ops theme — night-shift control room CSS.
 * No external assets; pure inline styles for offline cathedral.
 */

export const CONSOLE_CSS = `
/* ── Root tokens (Nebula Ops palette) ─────────────────────────────────────── */
:root {
  --bg: #070b14;
  --panel: #0f1628;
  --border: #1e2a4a;
  --text: #e6ecff;
  --muted: #8b95b5;
  --accent-cyan: #3de7ff;
  --accent-danger: #ff6b6b;
  --accent-warn: #f5a524;
  --accent-ok: #3dd68c;
  --edge-intent: #3de7ff;
  --edge-stage: #f5a524;
  --edge-trigger: #3dd68c;
}

/* ── Base reset ───────────────────────────────────────────────────────────── */
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

/* ── Layout ───────────────────────────────────────────────────────────────── */
.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}
.rail {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 16px 0;
}
.nav { padding: 8px; }
.nav a {
  display: block;
  padding: 10px 12px;
  margin-bottom: 4px;
  color: var(--muted);
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.9rem;
}
.nav a:hover { background: rgba(61, 231, 255, 0.08); color: var(--accent-cyan); }
.nav a.active {
  background: rgba(61, 231, 255, 0.12);
  color: var(--accent-cyan);
  border-left: 3px solid var(--accent-cyan);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.topbar-left { display: flex; align-items: center; gap: 16px; }
.brand {
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--accent-cyan);
}
.subtitle {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.clock { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--accent-cyan); }
.main {
  padding: 20px;
  overflow-y: auto;
}
.footer {
  background: var(--panel);
  border-top: 1px solid var(--border);
  padding: 8px 20px;
  font-size: 0.75rem;
  color: var(--muted);
}

/* ── Cards & chips ────────────────────────────────────────────────────────── */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}
.cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  min-width: 120px;
}
.card .label, .label {
  display: block;
  color: var(--muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.card strong { font-size: 1.35rem; color: var(--text); }
.card-danger {
  border-color: rgba(255, 107, 107, 0.5);
  background: rgba(255, 107, 107, 0.08);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: rgba(30, 42, 74, 0.5);
  border-radius: 999px;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.chip-risk { color: var(--accent-danger); }
.chip-mode { color: var(--accent-cyan); }
.chip-green { color: var(--accent-ok); border: 1px solid rgba(61, 214, 140, 0.35); }
.chip-gray { color: var(--muted); }
.lede { color: var(--muted); max-width: 52rem; margin: 0 0 16px; }
.bar-wrap {
  height: 6px;
  background: rgba(30, 42, 74, 0.8);
  border-radius: 3px;
  overflow: hidden;
  min-width: 64px;
  margin-bottom: 4px;
}
.bar { height: 100%; background: linear-gradient(90deg, var(--accent-cyan), var(--accent-ok)); }

/* ── Tables ───────────────────────────────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
  border-radius: 10px;
  overflow: hidden;
  font-size: 0.85rem;
}
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
tr:last-child td { border-bottom: none; }

/* ── Status tones ─────────────────────────────────────────────────────────── */
.urg-high { color: var(--accent-danger); font-weight: 700; }
.urg-med { color: var(--accent-warn); }
.urg-low { color: var(--muted); }

.band-green { color: var(--accent-ok); }
.band-yellow { color: var(--accent-warn); }
.band-red { color: var(--accent-danger); }

/* ── Path audit ───────────────────────────────────────────────────────────── */
.path-audit {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
}
.path-audit .sep { color: var(--muted); margin: 0 4px; }

/* ── Empty state ──────────────────────────────────────────────────────────── */
.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
}
.empty p { margin-bottom: 16px; }
.empty a { color: var(--accent-cyan); text-decoration: none; }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  background: rgba(61, 231, 255, 0.1);
  border: 1px solid var(--accent-cyan);
  color: var(--accent-cyan);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 120ms ease;
}
.btn:hover { background: rgba(61, 231, 255, 0.2); }
.btn:active { transform: translateY(1px); }
.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--muted);
}
.btn-ghost:hover { color: var(--text); border-color: var(--muted); }
a.btn { text-decoration: none; }

/* ── Graph SVG styles ─────────────────────────────────────────────────────── */
.graph-svg {
  width: 100%;
  height: 480px;
  background: var(--panel);
  border-radius: 10px;
  border: 1px solid var(--border);
}
.g-node circle { fill: #1e2a4a; stroke: var(--accent-cyan); stroke-width: 2; }
.g-node text { font-size: 11px; fill: var(--text); font-family: ui-monospace, monospace; }
.g-edge { stroke: var(--muted); stroke-opacity: 0.45; stroke-width: 1.5; }
.g-edge.on-path { stroke: var(--accent-warn); stroke-opacity: 0.95; stroke-width: 2.5; }
.g-node.sel circle { stroke: var(--accent-warn); stroke-width: 3; fill: rgba(245, 165, 36, 0.15); }
.g-node.d0 circle { fill: rgba(61, 231, 255, 0.2); stroke: var(--accent-cyan); r: 16; }

/* ── Reduced motion ───────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
