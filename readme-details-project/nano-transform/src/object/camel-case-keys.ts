import { camelCase } from '../string/camel-case';
import type { CamelCaseKeys } from '../types/object-types';
import { transformKeys } from '../utils/transform-keys';

/**
 * Recursively converts every key of a plain object (and of the objects inside
 * its arrays) to `camelCase`.
 *
 * ```ts
 * camelCaseKeys({ user_name: 'An', 'created-at': new Date() });
 * // { userName: 'An', createdAt: Date }
 * ```
 */
export function camelCaseKeys<T>(value: T): CamelCaseKeys<T> {
  return transformKeys(value, camelCase) as CamelCaseKeys<T>;
}
