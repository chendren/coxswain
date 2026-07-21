/**
 * R13.1 — the M2 integration test. Calls the *real* buildSession (real
 * loadDeps, real dynamic imports) against this worktree's actual packages.
 * While any lane is still a stub — true for every lane in this worktree,
 * since tui-cli builds against fixtures/local fakes per its own charter —
 * loadDeps throws NotWiredError and this test prints a visible skip notice
 * and passes trivially rather than failing the lane's build. Once every
 * lane lands (the integrator's M2 step), it runs for real.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventBus, configSchema, type AgentEvent } from "@cox/core";
import { buildSession } from "../src/wire";
import { NotWiredError } from "../src/deps";

function waitFor(bus: EventBus, type: AgentEvent["type"], timeoutMs = 5000): Promise<AgentEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const unsubscribe = bus.subscribe((e) => {
      if (e.type === type) {
        clearTimeout(timer);
        unsubscribe();
        resolve(e);
      }
    });
  });
}

describe("R13.1: M2 integration — full stack with a MockChatModel-backed registry", () => {
  it("a submitted prompt produces routing_decision -> ... -> model_call_finished -> turn_done, one ledger line, and a snapshot reflecting the mock's usage", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "cox-wire-"));
    // Best-effort "point providers at the mock adapter" config, per
    // design.md's wire.test.ts note ("see providers spec pack") — providers
    // /design.md's createMockModel takes a script directly rather than
    // being config-driven, and createProviderRegistry(config) builds only
    // anthropic + openaiCompat entries with no documented "mock" special
    // case, so it's genuinely unclear from the published contracts alone
    // how config is meant to select the mock at M2. Flagged in
    // INTEGRATION-NOTES.md (2026-07-21) rather than guessed at further
    // here — this worktree can't verify either way since every lane
    // (including this one, by design — tui-cli builds against fixtures)
    // is still a stub, so the NotWiredError path below is what actually
    // runs and is what's actually verified.
    const cfg = configSchema.parse({
      tiers: {
        scout: { primary: { provider: "mock", model: "mock-scout" }, fallbacks: [] },
        builder: { primary: { provider: "mock", model: "mock-builder" }, fallbacks: [] },
        architect: { primary: { provider: "mock", model: "mock-architect" }, fallbacks: [] },
      },
    });
    const bus = new EventBus();
    const events: AgentEvent[] = [];
    bus.subscribe((e) => events.push(e));

    let session: Awaited<ReturnType<typeof buildSession>>;
    try {
      session = await buildSession(cfg, cwd, bus);
    } catch (err) {
      if (err instanceof NotWiredError) {
        // eslint-disable-next-line no-console
        console.log(`skipped: ${err.message}`);
        return;
      }
      throw err;
    }

    session.controller.submitPrompt("add tests for the parser");
    await waitFor(bus, "turn_done");

    const types = events.map((e) => e.type);
    const routingIdx = types.indexOf("routing_decision");
    const startedIdx = types.indexOf("model_call_started");
    const finishedIdx = types.indexOf("model_call_finished");
    const doneIdx = types.indexOf("turn_done");
    expect(routingIdx).toBeGreaterThanOrEqual(0);
    expect(startedIdx).toBeGreaterThan(routingIdx);
    expect(finishedIdx).toBeGreaterThan(startedIdx);
    expect(doneIdx).toBeGreaterThan(finishedIdx);

    const ledgerRaw = await readFile(join(cwd, ".cox", "ledger.jsonl"), "utf8");
    const ledgerLines = ledgerRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    expect(ledgerLines).toHaveLength(1);
    const entry = JSON.parse(ledgerLines[0]!) as { sessionId: string };
    expect(entry.sessionId).toBe(session.controller.sessionId);

    const snapshot = session.getSnapshot();
    expect(snapshot.usage.inputTokens + snapshot.usage.outputTokens).toBeGreaterThan(0);
  });
});
