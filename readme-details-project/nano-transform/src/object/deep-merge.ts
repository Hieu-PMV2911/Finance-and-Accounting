import type { DeepMergeOptions, DeepMergeResult } from '../types/object-types';
import { isObject, isPlainObject } from '../utils/is-object';
import { isUnsafeKey } from '../utils/sanitize-key';
import { cloneValue } from './deep-clone';

type ArrayMode = 'replace' | 'concat';

function merge(
  target: unknown,
  source: unknown,
  arrayMode: ArrayMode,
  seen: WeakMap<object, unknown>,
): unknown {
  if (!isObject(source)) return source;
  const cached = seen.get(source);
  if (cached !== undefined) return cached;
  if (Array.isArray(source)) {
    const list: unknown[] = [];
    seen.set(source, list);
    if (arrayMode === 'concat' && Array.isArray(target)) {
      for (const item of target as unknown[]) list.push(cloneValue(item, seen));
    }
    for (const item of source) list.push(merge(undefined, item, arrayMode, seen));
    return list;
  }
  if (!isPlainObject(source)) return cloneValue(source, seen);
  const result: Record<string, unknown> = {};
  seen.set(source, result);
  const base = isPlainObject(target) ? target : null;
  if (base) {
    for (const key of Object.keys(base)) {
      if (isUnsafeKey(key)) continue;
      result[key] = cloneValue(base[key], seen);
    }
  }
  for (const key of Object.keys(source)) {
    if (isUnsafeKey(key)) continue;
    const next = source[key];
    if (next === undefined) continue;
    result[key] = merge(base ? base[key] : undefined, next, arrayMode, seen);
  }
  return result;
}

/**
 * Deeply merges `source` into `target` and returns a brand-new object: neither
 * input is mutated, and nested objects are copied rather than shared.
 *
 * Keys named `__proto__`, `constructor` and `prototype` are ignored on both
 * sides, which makes the merge safe against prototype-pollution payloads.
 * `undefined` source values never overwrite existing ones.
 *
 * ```ts
 * deepMerge({ db: { host: 'a', port: 5432 } }, { db: { port: 6543 } });
 * // { db: { host: 'a', port: 6543 } }
 *
 * deepMerge({ tags: [1] }, { tags: [2] }, { arrayMode: 'concat' });
 * // { tags: [1, 2] }
 * ```
 */
export function deepMerge<T, U>(
  target: T,
  source: U,
  options?: DeepMergeOptions,
): DeepMergeResult<T, U> {
  if (source == null) return deepCloneForMerge(target) as DeepMergeResult<T, U>;
  if (target == null) return deepCloneForMerge(source) as DeepMergeResult<T, U>;
  return merge(
    target,
    source,
    options?.arrayMode ?? 'replace',
    new WeakMap(),
  ) as DeepMergeResult<T, U>;
}

function deepCloneForMerge<T>(value: T): T {
  return cloneValue(value, new WeakMap()) as T;
}
