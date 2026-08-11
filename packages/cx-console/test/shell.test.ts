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

    it("escapes \" as &quot;", () => {
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
      expect(html).toMatch(/<a class="active".*href="\/console\/fleet"/);
    });

    it("does not mark inactive nav links as active", () => {
      const html = renderShell({ ...baseOpts, active: "queue" });
      expect(html).not.toMatch(/<a class="active".*href="\/console\/fleet"/);
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

    it("includes keyboard shortcuts script", () => {
      const html = renderShell(baseOpts);
      expect(html).toContain('document.addEventListener("keydown"');
      expect(html).toContain('window.location.href = "/console/fleet"');
    });

    it("does not include http:// or cdn in output", () => {
      const html = renderShell(baseOpts);
      expect(html).not.toMatch(/http:\/\//);
      expect(html).not.toMatch(/cdn/);
    });

    it("handles empty control path", () => {
      const html = renderShell({ ...baseOpts, controlPath: [] });
      // Should still have footer but with no path text
      expect(html).toContain("<footer");
    });

    it("supports extraHead and extraScript", () => {
      const html = renderShell({
        ...baseOpts,
        extraHead: '<meta name="test" content="value"/>',
        extraScript: "<script>console.log('ok');</script>",
      });
      expect(html).toContain('<meta name="test" content="value"/>');
      expect(html).toContain("<script>console.log('ok');</script>");
    });

    it("includes generatedAt timestamp", () => {
      const html = renderShell({ ...baseOpts, generatedAt: "2025-01-01T00:00:00Z" });
      expect(html).toContain('datetime="2025-01-01T00:00:00Z"');
    });

    it("uses current time when generatedAt omitted", () => {
      const html = renderShell(baseOpts);
      // Should contain a valid ISO timestamp
      expect(html).toMatch(/datetime="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/);
    });
  });
});
