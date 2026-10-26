import type { SnakeCase } from '../types/string-types';
import { words } from '../utils/words';

/**
 * Converts any string into `snake_case`.
 *
 * ```ts
 * snakeCase('helloWorld');  // 'hello_world'
 * snakeCase('Hello World'); // 'hello_world'
 * ```
 */
export function snakeCase<S extends string>(value: S): SnakeCase<S> {
  if (value == null) return value as unknown as SnakeCase<S>;
  return words(value)
    .map((word) => word.toLowerCase())
    .join('_') as SnakeCase<S>;
}
