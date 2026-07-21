/**
 * R6.3: per-session "allowAlways" memory. Once a tool call is allowed
 * "always" for a session, matching calls skip the prompt for the rest of
 * that session (the runner instance's lifetime — sessions don't expire
 * here; a new session id just starts with an empty set).
 */
export interface Allowlist {
  has(sessionId: string, key: string): boolean;
  remember(sessionId: string, key: string): void;
}

export function createAllowlist(): Allowlist {
  const bySession = new Map<string, Set<string>>();
  return {
    has(sessionId, key) {
      return bySession.get(sessionId)?.has(key) ?? false;
    },
    remember(sessionId, key) {
      let set = bySession.get(sessionId);
      if (!set) {
        set = new Set();
        bySession.set(sessionId, set);
      }
      set.add(key);
    },
  };
}

/** Allowlist key: bash -> first whitespace-separated token; others -> tool name. */
export function permissionKey(toolName: string, input: unknown): string {
  if (toolName === "bash" && typeof input === "object" && input !== null) {
    const command = (input as Record<string, unknown>).command;
    if (typeof command === "string") {
      const first = command.trim().split(/\s+/)[0];
      if (first) return first;
    }
  }
  return toolName;
}
