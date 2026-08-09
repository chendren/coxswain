/**
 * Stack health probes for CXOS doctor (graph path: probe_ollama → probe_platform → emit).
 * Pure network checks — no adapter mutation.
 */

export interface OllamaHealth {
  ok: boolean;
  baseUrl: string;
  models: string[];
  hasEmbed: boolean;
  hasLlm: boolean;
  error?: string;
}

export interface PlatformHealth {
  ok: boolean;
  baseUrl: string;
  httpStatus: number;
  status?: string;
  checks?: Record<string, boolean>;
  error?: string;
}

export interface StackHealth {
  path: string[];
  ollama: OllamaHealth;
  platform: PlatformHealth;
  ready: boolean;
}

export async function probeOllama(
  baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  timeoutMs = 2500,
): Promise<OllamaHealth> {
  const root = baseUrl.replace(/\/$/, "");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${root}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      return {
        ok: false,
        baseUrl: root,
        models: [],
        hasEmbed: false,
        hasLlm: false,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (data.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
    const hasEmbed = models.some((n) => n.startsWith("nomic-embed") || n.startsWith("qwen") || n.startsWith("bge-") || n.includes("embed"));
    const hasLlm = models.some((n) => n.startsWith("nemotron") || n.startsWith("qwen") || n.startsWith("llama") || n.startsWith("mistral"));
    return {
      ok: true,
      baseUrl: root,
      models,
      hasEmbed,
      hasLlm,
    };
  } catch (e) {
    return {
      ok: false,
      baseUrl: root,
      models: [],
      hasEmbed: false,
      hasLlm: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function probePlatformReady(
  baseUrl = process.env.CX_LOCAL_BASE_URL ?? "http://127.0.0.1:3143",
  timeoutMs = 2500,
): Promise<PlatformHealth> {
  const root = baseUrl.replace(/\/$/, "");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${root}/api/health/ready`, { signal: ctrl.signal });
    clearTimeout(t);
    let body: { status?: string; checks?: Record<string, boolean> } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* empty */
    }
    const checks = body.checks ?? {};
    const ready =
      res.status === 200 &&
      (body.status === "ready" || body.status === "ok" || body.status === "healthy") &&
      checks.ollama !== false;
    return {
      ok: ready,
      baseUrl: root,
      httpStatus: res.status,
      status: body.status,
      checks,
      error: ready ? undefined : `status=${body.status ?? "?"} http=${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      baseUrl: root,
      httpStatus: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function probeStackHealth(opts?: {
  ollamaBaseUrl?: string;
  platformBaseUrl?: string;
}): Promise<StackHealth> {
  const path = ["probe_ollama", "probe_platform", "emit"];
  const ollama = await probeOllama(opts?.ollamaBaseUrl);
  const platform = await probePlatformReady(opts?.platformBaseUrl);
  return {
    path,
    ollama,
    platform,
    ready: ollama.ok && ollama.hasLlm,
  };
}
