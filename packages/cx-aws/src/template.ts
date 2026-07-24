import type { CxArchitectureDoc, CxTargetId } from "@cox/cx-core";
import { createCxAdapterError } from "@cox/cx-core";

/** Formatting reference from the real local omnichannel platform's own
 * cloudformation/main.yaml — Parameters block + nested-stack style. */
const STYLE_EXAMPLE = `AWSTemplateFormatVersion: '2010-09-09'
Description: >
  <short description>
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev`;

export function templatePrompt(journeyMapName: string, stageNames: string): string {
  return `Produce a JSON object with fields "title" (string) and "markdown" (string, containing a complete AWS CloudFormation YAML template) for a CX solution supporting the "${journeyMapName}" customer journey (stages: ${stageNames}). The template should provision Amazon Connect, Amazon Lex, and a Bedrock Agent appropriate for this journey. Follow this formatting style for the Parameters block and overall structure:\n${STYLE_EXAMPLE}\nRespond with JSON only.`;
}

export function parseArchitectureDoc(raw: string, specName: string, targetId: CxTargetId): CxArchitectureDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createCxAdapterError({
      message: `cx-aws: malformed JSON generating architectureDoc: ${raw.slice(0, 200)}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw createCxAdapterError({
      message: `cx-aws: expected a JSON object generating architectureDoc, got ${typeof parsed}`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.title !== "string" || typeof p.markdown !== "string") {
    throw createCxAdapterError({
      message: `cx-aws: response for architectureDoc is missing required fields`,
      targetId,
      phase: "build",
      retryable: false,
    });
  }
  return {
    kind: "architectureDoc",
    id: "architectureDoc",
    provenance: { specName, phase: "design", targetId },
    title: p.title,
    markdown: p.markdown,
  };
}
