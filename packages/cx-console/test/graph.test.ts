/**
 * Tests for graph-svg and pages/graph.
 */
import { describe, it, expect } from "vitest";
import {
  layoutRadial,
  renderNeighborhoodSvg,
} from "../src/graph-svg.js";
import { renderGraphPage } from "../src/pages/graph.js";

describe("graph-svg", () => {
  describe("layoutRadial", () => {
    it("places center node (distance 0) at middle of canvas", () => {
      const result = layoutRadial({ "start:node": 0 }, { width: 720, height: 480 });
      expect(result).toHaveLength(1);
      const node = result[0]!;
      expect(node.x).toBeCloseTo(360); // width/2
      expect(node.y).toBeCloseTo(240); // height/2
    });

    it("places distance-1 nodes on first ring", () => {
      const result = layoutRadial(
        { "start:node": 0, "a": 1, "b": 1 },
        { width: 720, height: 480 }
      );
      expect(result).toHaveLength(3);
      // Find the distance-1 nodes
      const d1Nodes = result.filter((n) => n.distance === 1);
      expect(d1Nodes).toHaveLength(2);
      // They should be on a circle with radius ~130 (60 + 1*70)
      const cx = 360;
      const cy = 240;
      for (const n of d1Nodes) {
        const distFromCenter = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
        expect(distFromCenter).toBeGreaterThan(120);
        expect(distFromCenter).toBeLessThan(140);
      }
    });

    it("places distance-2 nodes on second ring", () => {
      const result = layoutRadial(
        { "start:node": 0, "a": 1, "b": 1, "c": 2 },
        { width: 720, height: 480 }
      );
      const d2Nodes = result.filter((n) => n.distance === 2);
      expect(d2Nodes).toHaveLength(1);
      // Radius should be ~200 (60 + 2*70)
      const cx = 360;
      const cy = 240;
      const distFromCenter = Math.sqrt((d2Nodes[0]!.x - cx) ** 2 + (d2Nodes[0]!.y - cy) ** 2);
      expect(distFromCenter).toBeGreaterThan(190);
      expect(distFromCenter).toBeLessThan(210);
    });
  });

  describe("renderNeighborhoodSvg", () => {
    it("contains <svg element", () => {
      const svg = renderNeighborhoodSvg({ "start:node": 0 });
      expect(svg).toContain("<svg");
    });

    it("contains circle elements for nodes", () => {
      const svg = renderNeighborhoodSvg({ "a": 0, "b": 1 });
      expect(svg).toContain("<circle");
    });

    it("includes data-uid attributes on node groups", () => {
      const svg = renderNeighborhoodSvg({ "domain:billing": 0 });
      expect(svg).toContain('data-uid="domain:billing"');
    });

    it("escapes special characters in labels", () => {
      const svg = renderNeighborhoodSvg({
        'domain:test&<>"': 0,
      });
      expect(svg).not.toContain('<g class="g-node d0" data-uid="domain:test&<>"');
      // Should be escaped
      expect(svg).toContain("&amp;");
    });

    it("highlights path nodes with sel class", () => {
      const svg = renderNeighborhoodSvg(
        { "a": 0, "b": 1 },
        ["a", "b"]
      );
      expect(svg).toContain('class="g-node d0 sel"');
      expect(svg).toContain('class="g-node d1 sel"');
    });

    it("draws edges between nodes of consecutive distances", () => {
      const svg = renderNeighborhoodSvg(
        { "a": 0, "b": 1 },
        []
      );
      expect(svg).toContain("<line");
    });
  });
});

describe("pages/graph", () => {
  describe("renderGraphPage", () => {
    it('contains "Graph explorer" title', () => {
      const html = renderGraphPage({
        pack: "default",
        controlPath: ["test"],
      });
      expect(html).toContain("Graph explorer");
    });

    it("includes search form with GET method", () => {
      const html = renderGraphPage({
        pack: "default",
        query: "billing",
        controlPath: ["test"],
      });
      expect(html).toContain('action="/console/graph"');
      expect(html).toContain('method="get"');
    });

    it("includes path form with from/to inputs", () => {
      const html = renderGraphPage({
        pack: "default",
        controlPath: ["test"],
      });
      expect(html).toContain('name="from"');
      expect(html).toContain('name="to"');
    });

    it("does not include CDN references", () => {
      const html = renderGraphPage({
        pack: "default",
        controlPath: ["test"],
      });
      expect(html).not.toMatch(/http:\/\//);
      expect(html).not.toMatch(/cdn/);
    });

    it("includes neighborhood SVG when provided", () => {
      const svgContent = '<svg class="graph-svg" viewBox="0 0 720 480">test</svg>';
      const html = renderGraphPage({
        pack: "default",
        neighborhoodSvg: svgContent,
        controlPath: ["test"],
      });
      expect(html).toContain(svgContent);
    });

    it("includes path display when provided", () => {
      const html = renderGraphPage({
        pack: "default",
        pathDisplay: "domain:start → intent:end",
        controlPath: ["test"],
      });
      expect(html).toContain("domain:start → intent:end");
    });

    it("includes find results when provided", () => {
      const html = renderGraphPage({
        pack: "default",
        findHtml: '<div class="hits">Found 3</div>',
        controlPath: ["test"],
      });
      expect(html).toContain('Found 3');
    });

    it("includes route chip when provided", () => {
      const html = renderGraphPage({
        pack: "default",
        routeChip: '<span class="chip chip-mode">mode:fast</span>',
        controlPath: ["test"],
      });
      expect(html).toContain('mode:fast');
    });

    it("includes client script for click-to-fill", () => {
      const html = renderGraphPage({
        pack: "default",
        controlPath: ["test"],
      });
      expect(html).toContain("document.addEventListener('click'");
      expect(html).toContain('[data-uid]');
    });

    it("uses renderShell with active=graph", () => {
      const html = renderGraphPage({
        pack: "default",
        controlPath: ["test"],
      });
      // Check for graph nav link marked as active
      expect(html).toMatch(/<a class="active".*href="\/console\/graph"/);
    });

    it("escapes query parameter in search input", () => {
      const html = renderGraphPage({
        pack: "default",
        query: '<script>alert(1)</script>',
        controlPath: ["test"],
      });
      // Check that the script tag is escaped in the input value
      expect(html).not.toContain('value="<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it("includes pack badge", () => {
      const html = renderGraphPage({
        pack: "local",
        controlPath: ["test"],
      });
      expect(html).toContain("pack: local");
    });
  });
});
