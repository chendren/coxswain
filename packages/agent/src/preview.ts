/**
 * R3.3: tool_call_started.summary is "<name>: <input preview>" (preview
 * ≤ 80 chars); tool_call_finished.resultPreview is the first line of the
 * result, truncated to 120 chars. Both helpers guarantee the *returned*
 * string never exceeds maxLen — the truncation ellipsis is inside the
 * budget, not appended on top of it.
 */

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 1)}…`;
}

export function inputPreview(input: unknown, maxLen = 80): string {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      text = JSON.stringify(input) ?? String(input);
    } catch {
      text = String(input);
    }
  }
  return truncate(text.replace(/\s+/g, " ").trim(), maxLen);
}

export function resultPreview(content: string, maxLen = 120): string {
  const firstLine = content.split("\n")[0] ?? "";
  return truncate(firstLine, maxLen);
}
