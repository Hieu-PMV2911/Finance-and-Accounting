/**
 * Returns `true` for any non-null object (including arrays and class instances).
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Returns `true` only for plain objects: literals, `Object.create(null)`
 * and objects whose prototype is `Object.prototype`.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}
