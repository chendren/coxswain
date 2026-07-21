/**
 * R3 — error taxonomy & retries. Adapters classify failures at their call
 * site (HTTP status / network error → providerError(msg, retryable)); this
 * module only knows how to read/act on that marker, not how to produce it.
 */

/** Creates an Error carrying a `retryable` marker property (R3.2/R3.3). */
export function providerError(message: string, retryable: boolean): Error {
  const err = new Error(message) as Error & { retryable: boolean };
  err.retryable = retryable;
  return err;
}

/** True iff `err` is an Error (or error-like) with `retryable === true`. */
export function isRetryable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { retryable?: unknown }).retryable === true
  );
}

export interface WithRetriesDeps {
  /** Injectable for tests; defaults to a real `setTimeout`-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for deterministic jitter in tests; defaults to `Math.random`. */
  random?: () => number;
  /** Retry attempts after the first try. Default 2 (R3.1). */
  maxRetries?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-invokes `attempt` on retryable failures, but only when the failed
 * attempt yielded zero items — a partial stream is never internally replayed
 * (R3.4). Backoff between attempt n and n+1 is `500 * 2^n + random(0..250)`
 * ms. Exhausting `maxRetries` (R3.1) rethrows the last (already-classified)
 * error unchanged, preserving its `retryable` marker (R3.2). A non-retryable
 * failure (R3.3) or a failure after any yield (R3.4) rethrows immediately,
 * with no sleep and no further attempts.
 */
export async function* withRetries<T>(
  attempt: () => AsyncIterable<T>,
  deps: WithRetriesDeps = {},
): AsyncIterable<T> {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const maxRetries = deps.maxRetries ?? 2;

  for (let retry = 0; ; retry++) {
    let yielded = 0;
    try {
      for await (const item of attempt()) {
        yielded++;
        yield item;
      }
      return;
    } catch (err) {
      if (yielded === 0 && isRetryable(err) && retry < maxRetries) {
        await sleep(500 * 2 ** retry + random() * 250);
        continue;
      }
      throw err;
    }
  }
}
