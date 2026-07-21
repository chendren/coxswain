/**
 * Manual input validation for tool inputs. No zod (tools has no deps beyond
 * @cox/core). Every thrown error names the tool, the field, and what went
 * wrong so it can be surfaced verbatim as an isError ToolResult.
 */

export function expectObject(
  input: unknown,
  toolName: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(
      `${toolName}: input must be an object, got ${describeType(input)}`,
    );
  }
  return input as Record<string, unknown>;
}

export function expectString(
  input: Record<string, unknown>,
  key: string,
  toolName: string,
): string {
  const v = input[key];
  if (typeof v !== "string") {
    throw new Error(
      `${toolName}: "${key}" must be a string, got ${describeType(v)}`,
    );
  }
  return v;
}

export function expectOptionalString(
  input: Record<string, unknown>,
  key: string,
  toolName: string,
): string | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    throw new Error(
      `${toolName}: "${key}" must be a string when provided, got ${describeType(v)}`,
    );
  }
  return v;
}

export function expectNumber(
  input: Record<string, unknown>,
  key: string,
  toolName: string,
): number {
  const v = input[key];
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(
      `${toolName}: "${key}" must be a number, got ${describeType(v)}`,
    );
  }
  return v;
}

export function expectOptionalNumber(
  input: Record<string, unknown>,
  key: string,
  toolName: string,
): number | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(
      `${toolName}: "${key}" must be a number when provided, got ${describeType(v)}`,
    );
  }
  return v;
}

function describeType(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
