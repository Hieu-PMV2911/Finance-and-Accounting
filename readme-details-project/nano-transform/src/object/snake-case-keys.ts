import { snakeCase } from '../string/snake-case';
import type { SnakeCaseKeys } from '../types/object-types';
import { transformKeys } from '../utils/transform-keys';

/**
 * Recursively converts every key of a plain object (and of the objects inside
 * its arrays) to `snake_case`.
 *
 * ```ts
 * snakeCaseKeys({ userName: 'An', createdAt: new Date() });
 * // { user_name: 'An', created_at: Date }
 * ```
 */
export function snakeCaseKeys<T>(value: T): SnakeCaseKeys<T> {
  return transformKeys(value, snakeCase) as SnakeCaseKeys<T>;
}
