/**
 * Unicode-aware word tokenizer shared by every casing helper.
 *
 * It ignores every character that is not a letter or a digit (so `-`, `_`,
 * spaces, dots, emoji… all act as delimiters) and splits on case transitions:
 *
 * - `helloWorld`  -> ["hello", "World"]
 * - `FOO_BAR`     -> ["FOO", "BAR"]
 * - `HTTPServer`  -> ["HTTP", "Server"]
 * - `thư viện`    -> ["thư", "viện"]
 * - `version 2`   -> ["version", "2"]
 *
 * The RegExp is compiled once at module load, never inside a function.
 */
const WORD_PATTERN =
  /[\p{Lu}]+(?=[\p{Lu}][\p{Ll}])|[\p{Lu}]?[\p{Ll}]+|[\p{Lu}]+|[\p{Lo}\p{Lm}\p{Lt}]+|\p{N}+/gu;

export function words(value: string): string[] {
  return value.match(WORD_PATTERN) ?? [];
}

/** Lower-cases a whole word and upper-cases its first character. */
export function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
