import type { CxAdapterErrorPhase } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export interface LocalPlatformClientDeps {
  baseUrl: string;
}

async function doFetch(
  deps: LocalPlatformClientDeps,
  path: string,
  phase: CxAdapterErrorPhase,
  init?: RequestInit,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${deps.baseUrl}${path}`, init);
  } catch (err) {
    throw createCxAdapterError({
      message: `cx-local: network error calling ${path}: ${(err as Error).message}`,
      targetId: "local",
      phase,
      retryable: true,
    });
  }
  if (!res.ok) {
    throw createCxAdapterError({
      message: `cx-local: ${path} returned HTTP ${res.status}`,
      targetId: "local",
      phase,
      retryable: res.status >= 500,
    });
  }
  return res.json();
}

export async function getJson(
  deps: LocalPlatformClientDeps,
  path: string,
  phase: CxAdapterErrorPhase,
): Promise<unknown> {
  return doFetch(deps, path, phase);
}

export async function postJson(
  deps: LocalPlatformClientDeps,
  path: string,
  body: unknown,
  phase: CxAdapterErrorPhase,
): Promise<unknown> {
  return doFetch(deps, path, phase, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
