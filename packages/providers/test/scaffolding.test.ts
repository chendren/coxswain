import { describe, expect, it } from "vitest";

// Task 1: package scaffolding. Proves the whole module graph loads cleanly
// (catches circular imports / syntax errors early) — stays valid as later
// tasks fill in each stub with its real implementation.
describe("@cox/providers package scaffolding", () => {
  it("every src module loads without throwing", async () => {
    const modules = await Promise.all([
      import("../src/index.js"),
      import("../src/errors.js"),
      import("../src/estimate.js"),
      import("../src/capabilities.js"),
      import("../src/anthropic.js"),
      import("../src/openai-compat.js"),
      import("../src/failover.js"),
      import("../src/registry.js"),
      import("../src/mock.js"),
    ]);
    for (const m of modules) {
      expect(m).toBeTruthy();
    }
  });
});
