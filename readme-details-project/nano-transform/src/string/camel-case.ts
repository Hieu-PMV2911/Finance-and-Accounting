import type { CamelCase } from '../types/string-types';
import { capitalizeWord, words } from '../utils/words';

/**
 * Converts any string into `camelCase`.
 *
 * ```ts
 * camelCase('hello-world');  // 'helloWorld'
 * camelCase('FOO_BAR');      // 'fooBar'
 * camelCase('Thư viện');     // 'thưViện'
 * ```
 */
export function camelCase<S extends string>(value: S): CamelCase<S> {
  if (value == null) return value as unknown as CamelCase<S>;
  let result = '';
  for (const word of words(value)) {
    result += result === '' ? word.toLowerCase() : capitalizeWord(word);
  }
  return result as CamelCase<S>;
}
