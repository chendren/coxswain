/**
 * Split text into lines, dropping the phantom empty trailing element that
 * `String.split("\n")` produces when the text ends with a newline (so a
 * file's reported line count matches what an editor would show).
 */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const parts = text.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "" && text.endsWith("\n")) {
    parts.pop();
  }
  return parts;
}
