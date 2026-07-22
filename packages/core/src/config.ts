import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config schema — cox.config.json (project) deep-merged over
// ~/.cox/config.json (user) over DEFAULT_CONFIG. API keys come from env vars
// named in the config, never from the config file itself.
// ---------------------------------------------------------------------------

const modelRefSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

const tierEntrySchema = z.object({
  primary: modelRefSchema,
  fallbacks: z.array(modelRefSchema).default([]),
});

export const configSchema = z.object({
  providers: z
    .object({
      anthropic: z
        .object({ apiKeyEnv: z.string().default("ANTHROPIC_API_KEY") })
        .default({}),
      /** OpenAI-compatible endpoints: xAI, OpenAI, Ollama, LM Studio... */
      openaiCompat: z
        .array(
          z.object({
            id: z.string(), // adapter id used in ModelRef.provider
            baseUrl: z.string(),
            apiKeyEnv: z.string().optional(), // omit for local servers
            models: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .default({}),
  tiers: z
    .object({
      scout: tierEntrySchema,
      builder: tierEntrySchema,
      architect: tierEntrySchema,
    })
    .default({
      scout: {
        primary: { provider: "anthropic", model: "claude-haiku-4-5" },
        fallbacks: [],
      },
      builder: {
        primary: { provider: "anthropic", model: "claude-sonnet-5" },
        fallbacks: [],
      },
      architect: {
        primary: { provider: "anthropic", model: "claude-opus-4-8" },
        fallbacks: [{ provider: "anthropic", model: "claude-sonnet-5" }],
      },
    }),
  routing: z
    .object({
      /** Use a scout-tier call to classify ambiguous chat prompts. */
      classifyWithScout: z.boolean().default(true),
      /** Tier used when classification is off/fails. */
      defaultTier: z.enum(["scout", "builder", "architect"]).default("builder"),
      escalation: z
        .object({
          enabled: z.boolean().default(true),
          toolErrorStreak: z.number().int().default(3),
          verificationFailures: z.number().int().default(2),
        })
        .default({}),
      /** Announce every routing decision in the transcript. */
      announce: z.boolean().default(true),
    })
    .default({}),
  budgets: z
    .object({
      sessionUsd: z.number().optional(),
      sessionTokens: z.number().int().optional(),
      specUsd: z.number().optional(),
      warnAt: z.number().min(0).max(1).default(0.8),
      hardStop: z.boolean().default(true),
    })
    .default({}),
  permissions: z
    .object({
      mode: z.enum(["default", "acceptEdits", "plan", "yolo"]).default("default"),
      allowBash: z.array(z.string()).default([]), // prefix allowlist
      denyBash: z.array(z.string()).default([]),
    })
    .default({}),
  steering: z
    .object({
      importCompat: z.boolean().default(true), // read CLAUDE.md/AGENTS.md/etc.
      warnTokens: z.number().int().default(2000),
    })
    .default({}),
  hooks: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({}),
  cx: z
    .object({
      targets: z
        .object({
          local: z.object({ baseUrl: z.string() }).optional(),
          aws: z.object({ profile: z.string().optional(), region: z.string().optional() }).optional(),
        })
        .default({}),
      budgets: z
        .object({
          cxOpsUsd: z.number().optional(),
        })
        .default({}),
      defaultOpsMode: z.enum(["commands", "console", "autonomous"]).default("console"),
      watcherPollIntervalMs: z.number().int().default(60_000),
    })
    .default({}),
});

export type CoxConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: CoxConfig = configSchema.parse({});

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    if (
      v && typeof v === "object" && !Array.isArray(v) &&
      b && typeof b === "object" && !Array.isArray(b)
    ) {
      out[k] = deepMerge(
        b as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** user config < project config; validated; throws ZodError with path info. */
export function loadConfig(cwd: string): CoxConfig {
  const user = readJson(join(homedir(), ".cox", "config.json")) ?? {};
  const project = readJson(join(cwd, "cox.config.json")) ?? {};
  return configSchema.parse(deepMerge(user, project));
}
