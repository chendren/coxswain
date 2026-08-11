/**
 * Tests for shell renderer.
 */
import { describe, it, expect } from "vitest";
import { renderShell, esc } from "../src/index.js";

describe("shell", () => {
  describe("esc", () => {
    it("escapes < as &lt;", () => {
      expect(esc("<")).toBe("&lt;");
    });

    it("escapes > as &gt;", () => {
      expect(esc(">")).toBe("&gt;");
    });

    it("escapes & as &amp;", () => {
      expect(esc("&")).toBe("&amp;");
    });

    it('escapes " as &quot;', () => {
      expect(esc('"')).toBe("&quot;");
    });

    it("escapes multiple characters", () => {
      expect(esc('<div class="x">')).toBe("&lt;div class=&quot;x&quot;&gt;");
    });
  });

  describe("renderShell", () => {
    const baseOpts = {
      title: "Test Page",
      active: "fleet" as const,
      pack: "default",
      bodyHtml: "<p>Hello</p>",
      controlPath: ["load_strong", "route_retrieval", "emit"],
    };

    it("includes CX Graph Console brand", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain("CX Graph Console");
    });

    it("marks active fleet nav link", () => {
      const html = renderShell({ ...baseOpts, active: "fleet" });
      expect(html).toMatch(/class="active"[^>]*href="\/console\/fleet/);
    });

    it("does not mark inactive nav links as active", () => {
      const html = renderShell({ ...baseOpts, active: "queue" });
      expect(html).not.toMatch(/class="active"[^>]*href="\/console\/fleet\?/);
    });

    it("includes pack badge", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain("pack: default");
    });

    it("emits control path in footer", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain("control:");
      expect(html).toContain("load_strong → route_retrieval → emit");
    });

    it("includes CONSOLE_CSS styles", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain(":root {");
      expect(html).toContain("--bg: #070b14;");
    });

    it("has correct title format", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain("<title>CXOS · Test Page</title>");
    });

    it("includes keyboard shortcuts script without TypeScript syntax", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain('document.addEventListener("keydown"');
      expect(html).toContain('location.href = "/console/fleet"');
      expect(html).not.toContain("KeyboardEvent");
      expect(html).not.toContain("ev:");
    });

    it("has no external CDN references", () => {
      const html = renderShell(baseOpts);
      expect(html).not.toMatch(/cdn\./i);
      expect(html).not.toMatch(/https?:\/\/fonts/);
    });

    it("uses stage layout wrapper", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain('class="stage"');
      expect(html).toContain('id="main"');
    });
  });
});
