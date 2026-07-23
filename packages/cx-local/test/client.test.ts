import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getJson, postJson, type LocalPlatformClientDeps } from "../src/client";
import { isCxAdapterError } from "@cox/cx-core";

describe("client", () => {
  let server: Server;
  let deps: LocalPlatformClientDeps;

  beforeEach(async () => {
    server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ hello: "world" }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/echo") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(body);
        });
        return;
      }
      if (req.url === "/api/notfound") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      if (req.url === "/api/broken") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "internal" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as AddressInfo;
    deps = { baseUrl: `http://127.0.0.1:${addr.port}` };
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("getJson returns the parsed response body", async () => {
    const result = await getJson(deps, "/api/ok", "status");
    expect(result).toEqual({ hello: "world" });
  });

  it("postJson sends the body and returns the parsed response", async () => {
    const result = await postJson(deps, "/api/echo", { a: 1 }, "deploy");
    expect(result).toEqual({ a: 1 });
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
