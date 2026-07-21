import { describe, expect, it } from "vitest";
import { isRetryable, providerError, withRetries } from "../src/errors.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

/** Builds an `attempt` that fails `failures` times then (optionally) yields. */
function attemptThatFails(
  failures: number,
  opts: { retryable: boolean; thenYield?: number[] },
): { attempt: () => AsyncIterable<number>; calls: () => number } {
  let calls = 0;
  const attempt = async function* (): AsyncIterable<number> {
    calls++;
    if (calls <= failures) {
      throw providerError(`fail #${calls}`, opts.retryable);
    }
    for (const v of opts.thenYield ?? []) yield v;
  };
  return { attempt, calls: () => calls };
}

describe("providerError / isRetryable", () => {
  it("R3.2: providerError sets a retryable marker that isRetryable reads back", () => {
    const retryable = providerError("rate limited", true);
    const notRetryable = providerError("bad request", false);
    expect(isRetryable(retryable)).toBe(true);
    expect(isRetryable(notRetryable)).toBe(false);
    expect(retryable.message).toBe("rate limited");
  });

  it("isRetryable is false for plain errors and non-error values", () => {
    expect(isRetryable(new Error("plain"))).toBe(false);
    expect(isRetryable("not an error")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("withRetries", () => {
  it("R3.1: retries up to 2 times with 500ms/1000ms (+jitter) backoff before throwing", async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const { attempt, calls } = attemptThatFails(99, { retryable: true });

    await expect(
      collect(withRetries(attempt, { sleep: fakeSleep, random: () => 0 })),
    ).rejects.toMatchObject({ message: "fail #3", retryable: true });

    expect(calls()).toBe(3); // initial + 2 retries
    expect(sleeps).toEqual([500, 1000]);
  });

  it("R3.1: jitter is added on top of the base backoff", async () => {
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleeps.push(ms);
    };
    const { attempt } = attemptThatFails(99, { retryable: true });

    await expect(
      collect(withRetries(attempt, { sleep: fakeSleep, random: () => 1 })),
    ).rejects.toBeTruthy();

    expect(sleeps).toEqual([750, 1250]); // 500+250*1, 1000+250*1
  });

  it("R3.2: retries exhausted throws an Error with retryable:true marker", async () => {
    const { attempt } = attemptThatFails(99, { retryable: true });
    let thrown: unknown;
    try {
      await collect(withRetries(attempt, { sleep: async () => {} }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("fail #3");
    expect(isRetryable(thrown)).toBe(true);
  });

  it("R3.1: succeeds after transient retryable failures without exhausting retries", async () => {
    const sleeps: number[] = [];
    const { attempt, calls } = attemptThatFails(1, {
      retryable: true,
      thenYield: [1, 2, 3],
    });

    const result = await collect(
      withRetries(attempt, {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0,
      }),
    );

    expect(result).toEqual([1, 2, 3]);
    expect(calls()).toBe(2); // 1 failure + 1 successful retry
    expect(sleeps).toEqual([500]);
  });

  it("R3.3: a non-retryable failure throws immediately with no retry and no sleep", async () => {
    let sleepCalls = 0;
    const { attempt, calls } = attemptThatFails(99, { retryable: false });

    await expect(
      collect(
        withRetries(attempt, {
          sleep: async () => {
            sleepCalls++;
          },
        }),
      ),
    ).rejects.toMatchObject({ message: "fail #1", retryable: false });

    expect(calls()).toBe(1);
    expect(sleepCalls).toBe(0);
  });

  it("R3.4: a failure after events were already yielded is not retried internally", async () => {
    let calls = 0;
    let sleepCalls = 0;
    const attempt = async function* (): AsyncIterable<number> {
      calls++;
      yield 1;
      yield 2;
      throw providerError("dropped mid-stream", true); // retryable, but too late
    };

    const out: number[] = [];
    await expect(async () => {
      for await (const item of withRetries(attempt, {
        sleep: async () => {
          sleepCalls++;
        },
      })) {
        out.push(item);
      }
    }).rejects.toMatchObject({ message: "dropped mid-stream", retryable: true });

    expect(out).toEqual([1, 2]);
    expect(calls).toBe(1); // no retry attempted
    expect(sleepCalls).toBe(0);
  });
});
