import type { PascalCase } from '../types/string-types';
import { capitalizeWord, words } from '../utils/words';

/**
 * Converts any string into `PascalCase`.
 *
 * ```ts
 * pascalCase('hello_world'); // 'HelloWorld'
 * pascalCase('helloWorld');  // 'HelloWorld'
 * ```
 */
export function pascalCase<S extends string>(value: S): PascalCase<S> {
  if (value == null) return value as unknown as PascalCase<S>;
  return words(value).map(capitalizeWord).join('') as PascalCase<S>;
}
