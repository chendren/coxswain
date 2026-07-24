import type { AgentDefinition, CxTargetId } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

export function agentPrompt(journeyMapName: string): string {
  return `Produce a JSON object with fields "name" (string), "systemPrompt" (string), and "tools" (string[]) describing a Bedrock Agent's behavior for handling the "${journeyMapName}" customer journey. "tools" should list the action-group names the agent would use. Respond with JSON only.`;
}

export function parseAgentDefinition(raw: string, specName: string, targetId: CxTargetId): AgentDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCxAdapterError({
      message: `cx-aws: malformed JSON generating agentDefinition: ${raw.slice(0, 200)}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw createCxAdapterError({
      message: `cx-aws: expected a JSON object generating agentDefinition, got ${typeof parsed}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.name !== "string" || typeof p.systemPrompt !== "string" || !Array.isArray(p.tools)) {
    throw createCxAdapterError({
      message: `cx-aws: response for agentDefinition is missing required fields`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  return {
    kind: "agentDefinition",
    id: "agentDefinition",
    provenance: { specName, phase: "design", targetId },
    name: p.name,
    systemPrompt: p.systemPrompt,
    tools: p.tools as string[],
  };
}
