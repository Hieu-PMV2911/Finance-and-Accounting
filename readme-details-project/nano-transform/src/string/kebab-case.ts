import type { KebabCase } from '../types/string-types';
import { words } from '../utils/words';

/**
 * Converts any string into `kebab-case`.
 *
 * ```ts
 * kebabCase('helloWorld');  // 'hello-world'
 * kebabCase('Hello World'); // 'hello-world'
 * ```
 */
export function kebabCase<S extends string>(value: S): KebabCase<S> {
  if (value == null) return value as unknown as KebabCase<S>;
  return words(value)
    .map((word) => word.toLowerCase())
    .join('-') as KebabCase<S>;
}
