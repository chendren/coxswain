/**
 * Optional outbound notify (webhook). Never mutates CX state beyond fire-and-forget HTTP.
 * Env: CX_WEBHOOK_URL — POST JSON payload when set.
 */
export interface NotifyPayload {
  event: string;
  specName?: string;
  message: string;
  ref?: string;
  actor?: string;
  at: string;
  extra?: Record<string, unknown>;
}

export async function notifyWebhook(
  payload: Omit<NotifyPayload, "at"> & { at?: string },
  opts?: { url?: string; fetchImpl?: typeof fetch },
): Promise<{ sent: boolean; status?: number; error?: string }> {
  const url = (opts?.url ?? process.env.CX_WEBHOOK_URL ?? "").trim();
  if (!url) return { sent: false };
  const body: NotifyPayload = {
    ...payload,
    at: payload.at ?? new Date().toISOString(),
  };
  const fetchFn = opts?.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) return { sent: false, error: "fetch unavailable" };
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { sent: true, status: res.status };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
