import { isUnsafeKey } from '../utils/sanitize-key';

/**
 * Returns a new object without the requested own keys.
 *
 * ```ts
 * omit({ a: 1, b: 2, c: 3 }, ['b']); // { a: 1, c: 3 }
 * ```
 */
export function omit<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  if (value == null) return value as unknown as Omit<T, K>;
  const excluded = new Set<PropertyKey>(keys);
  const result: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (excluded.has(key)) continue;
    if (typeof key === 'string' && isUnsafeKey(key)) continue;
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
    result[key] = (value as Record<PropertyKey, unknown>)[key];
  }
  return result as unknown as Omit<T, K>;
}
