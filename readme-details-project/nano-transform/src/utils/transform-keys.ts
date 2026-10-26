import { isPlainObject } from './is-object';
import { isUnsafeKey } from './sanitize-key';

export type KeyConverter = (key: string) => string;

/**
 * Deeply rebuilds plain objects and arrays with every key passed through
 * `convert`. Non-plain values (`Date`, `RegExp`, `Map`, `Set`, buffers, class
 * instances…) are returned untouched, unsafe keys are dropped and circular
 * structures are preserved instead of overflowing the stack.
 */
export function transformKeys(
  value: unknown,
  convert: KeyConverter,
  seen: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  if (!isPlainObject(value)) {
    if (!Array.isArray(value)) return value;
    const cached = seen.get(value);
    if (cached !== undefined) return cached;
    const list: unknown[] = [];
    seen.set(value, list);
    for (const item of value) list.push(transformKeys(item, convert, seen));
    return list;
  }
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const key of Object.keys(value)) {
    if (isUnsafeKey(key)) continue;
    result[convert(key)] = transformKeys(value[key], convert, seen);
  }
  return result;
}
