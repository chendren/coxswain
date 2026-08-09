import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJson, postJson, type LocalPlatformClientDeps } from "../src/client";
import { isCxAdapterError } from "@cox/cx-core";

describe("client", () => {
  let deps: LocalPlatformClientDeps;

  beforeEach(() => {
    deps = { baseUrl: "http://dummy.test" };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? "GET";

        if (u.endsWith("/api/ok")) {
          return new Response(JSON.stringify({ hello: "world" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (u.endsWith("/api/echo") && method === "POST") {
          // Echo the request body back as JSON
          const body = init?.body ? String(init.body) : "{}";
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (u.endsWith("/api/notfound")) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (u.endsWith("/api/broken")) {
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(null, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("getJson returns the parsed response body", async () => {
    const result = await getJson(deps, "/api/ok", "status");
    expect(result).toEqual({ hello: "world" });
  });

  it("postJson sends the body and returns the parsed response", async () => {
    const result = await postJson(deps, "/api/echo", { a: 1 }, "deploy");
    expect(result).toEqual({ a: 1 });
    // verify fetch was called with JSON body and content-type
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/echo"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
        body: JSON.stringify({ a: 1 }),
      }),
    );
  });

  it("throws a non-retryable CxAdapterError on 4xx", async () => {
    try {
      await getJson(deps, "/api/notfound", "status");
      throw new Error("expected getJson to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.phase).toBe("status");
        expect(e.retryable).toBe(false);
      }
    }
  });

  it("throws a retryable CxAdapterError on 5xx", async () => {
    try {
      await getJson(deps, "/api/broken", "status");
      throw new Error("expected getJson to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.retryable).toBe(true);
      }
    }
  });

  it("throws a retryable CxAdapterError on network failure", async () => {
    // Override fetch to simulate network error for this test
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    // baseUrl still dummy — network error is simulated by fetch throwing
    const badDeps: LocalPlatformClientDeps = { baseUrl: "http://127.0.0.1:1" };
    try {
      await getJson(badDeps, "/api/ok", "status");
      throw new Error("expected getJson to throw");
    } catch (e) {
      expect(isCxAdapterError(e)).toBe(true);
      if (isCxAdapterError(e)) {
        expect(e.retryable).toBe(true);
      }
    }
  });
});
