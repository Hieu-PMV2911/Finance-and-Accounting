import { isPlainObject } from '../utils/is-object';
import { isUnsafeKey } from '../utils/sanitize-key';

/**
 * Deep-copies plain objects and arrays. Primitives, `Date` and `RegExp` are
 * cloned; other exotic objects are preserved by reference. Circular references
 * are reproduced rather than looping forever.
 */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap()) as T;
}

/** Internal clone that shares one `seen` map across a whole traversal. */
export function cloneValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    seen.set(value, list);
    for (const item of value) list.push(cloneValue(item, seen));
    return list;
  }
  if (!isPlainObject(value)) return value;
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const key of Object.keys(value)) {
    if (isUnsafeKey(key)) continue;
    result[key] = cloneValue(value[key], seen);
  }
  return result;
}
