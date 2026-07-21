/**
 * Render-format helpers (docs/specs/tui-cli/design.md "format.ts rules").
 * Pure functions, no ink/react — shared by transcript rendering, the status
 * line, the plain renderer, and `cox ledger`/`cox models`.
 */
import type { TokenUsage } from "@cox/core";

function trimTrailingZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** `<1000` -> "612"; `<1M` -> "12.4k" (1dp, trailing .0 dropped); else "1.2M". */
export function formatTokens(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}${Math.round(abs)}`;
  if (abs < 1_000_000) return `${sign}${trimTrailingZero((abs / 1000).toFixed(1))}k`;
  return `${sign}${trimTrailingZero((abs / 1_000_000).toFixed(1))}M`;
}

/** null -> "n/a"; `>= 0.01` -> 2dp; else 3dp; always `$`-prefixed. */
export function formatUsd(n: number | null): string {
  if (n === null) return "n/a";
  const dp = Math.abs(n) >= 0.01 ? 2 : 3;
  return `$${n.toFixed(dp)}`;
}

/** `<1000` -> "450ms"; else 1dp seconds -> "9.5s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** `"█".repeat(filled) + "░".repeat(rest)`, filled = clamp(round(width*spent/limit), 0..width). */
export function budgetBar(spent: number, limit: number, width: number): string {
  const ratio = limit > 0 ? spent / limit : 0;
  const filled = Math.min(width, Math.max(0, Math.round(width * ratio)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** round(100*cacheRead/(inputTokens+cacheRead)), 0 when the denominator is 0. */
export function cachePct(u: TokenUsage): number {
  const denom = u.inputTokens + u.cacheReadTokens;
  if (denom === 0) return 0;
  return Math.round((100 * u.cacheReadTokens) / denom);
}
