import { isUnsafeKey } from '../utils/sanitize-key';

/**
 * Returns a new object holding only the requested own keys.
 *
 * ```ts
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
 * ```
 */
export function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> {
  if (value == null) return value as unknown as Pick<T, K>;
  const result: Record<PropertyKey, unknown> = {};
  for (const key of keys) {
    if (typeof key === 'string' && isUnsafeKey(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    result[key] = (value as Record<PropertyKey, unknown>)[key];
  }
  return result as unknown as Pick<T, K>;
}
