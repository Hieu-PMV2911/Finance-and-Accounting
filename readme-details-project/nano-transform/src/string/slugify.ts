/** Combining diacritical marks left over after Unicode NFD decomposition. */
const MARKS = /[\u0300-\u036f]/g;

/** Characters that do not decompose into an ASCII base + combining mark. */
const SPECIAL = /[đøłßæœð]/g;

/** Anything that is not a lowercase ASCII letter or a digit is a separator. */
const SEPARATORS = /[^a-z0-9]+/g;

/** Leading and trailing hyphens. */
const EDGES = /^-+|-+$/g;

const SPECIAL_MAP: Record<string, string> = {
  đ: 'd',
  ø: 'o',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ð: 'd',
};

function replaceSpecial(char: string): string {
  return SPECIAL_MAP[char];
}

/**
 * Builds a URL-safe slug. Accents are stripped through Unicode decomposition,
 * so Vietnamese and other Latin scripts are handled correctly.
 *
 * ```ts
 * slugify('Thư viện npm siêu nhẹ!'); // 'thu-vien-npm-sieu-nhe'
 * slugify('  Hello,  World  ');      // 'hello-world'
 * ```
 */
export function slugify(value: string): string {
  if (value == null) return value;
  return value
    .normalize('NFD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(SPECIAL, replaceSpecial)
    .replace(SEPARATORS, '-')
    .replace(EDGES, '');
}
