/**
 * Weak-node generation via OpenAI-compatible Chat Completions API.
 * Used when Anthropic keys are absent but OPENAI_API_KEY (or XAI) is set.
 */
import type { Tier } from "@cox/core";
import { extractJsonText } from "@cox/cx-ops";

export interface OpenAiGenerateOpts {
  apiKey: string;
  baseUrl?: string;
  /** Override model per tier. */
  models?: Partial<Record<Tier, string>>;
}

const DEFAULT_MODELS: Record<Tier, string> = {
  scout: "gpt-4o-mini",
  builder: "gpt-4o-mini",
  architect: "gpt-4o",
};

export function resolveOpenAiGenerateOpts(): OpenAiGenerateOpts | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    };
  }
  if (process.env.XAI_API_KEY) {
    return {
      apiKey: process.env.XAI_API_KEY,
      baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
      models: {
        scout: "grok-3-mini",
        builder: "grok-3-mini",
        architect: "grok-3",
      },
    };
  }
  return null;
}

export async function generateViaOpenAi(
  prompt: string,
  tier: Tier,
  opts: OpenAiGenerateOpts,
): Promise<string> {
  const model = opts.models?.[tier] ?? DEFAULT_MODELS[tier];
  const base = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are Coxswain CXOS. Respond with JSON only when asked. Stay inside closed ontology ids. No markdown fences.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`openai-compat ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return extractJsonText(text);
}
