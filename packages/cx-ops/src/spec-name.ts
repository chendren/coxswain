/**
 * CX spec name validation.
 * Valid names: starts with letter, then letters/digits/hyphen only, length 1..64
 */

/** Check if a string is a valid CX spec name. */
export function isValidSpecName(name: string): boolean {
  // Regex: starts with letter, then letters/digits/hyphen only, total length 1-64
  const specNameRegex = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;
  return specNameRegex.test(name);
}
