/** Any value accepted by `clsx`: strings, numbers, arrays and key/value maps. */
export type ClassValue =
  | ClassArray
  | ClassDictionary
  | string
  | number
  | boolean
  | null
  | undefined;

/** Keys are class names; values decide whether the key is kept. */
export type ClassDictionary = Record<string, unknown>;

/** Mixed values, flattened recursively. */
export type ClassArray = ClassValue[];

/**
 * Flattens a single input into a space-separated class string.
 * Falsy values (`0`, `''`, `false`, `null`, `undefined`) and `true` are dropped.
 */
function toVal(mix: ClassValue): string {
  let str = '';
  if ((typeof mix === 'string' || typeof mix === 'number') && mix) {
    str += mix;
  } else if (typeof mix === 'object' && mix) {
    if (Array.isArray(mix)) {
      for (let i = 0; i < mix.length; i++) {
        const val = toVal(mix[i]);
        if (val) str += (str ? ' ' : '') + val;
      }
    } else {
      for (const key in mix) {
        if (mix[key]) str += (str ? ' ' : '') + key;
      }
    }
  }
  return str;
}

/**
 * Builds a className string out of any mix of strings, numbers, arrays and
 * objects. Falsy values (`false`, `0`, `''`, `null`, `undefined`) and `true`
 * are dropped; object keys are kept only when their value is truthy.
 *
 * ```ts
 * clsx('foo', { bar: true, duck: false }, 'baz', [0, 'hello']);
 * // 'foo bar baz hello'
 * ```
 */
export function clsx(...args: ClassValue[]): string {
  let str = '';
  for (let i = 0; i < args.length; i++) {
    const val = toVal(args[i]);
    if (val) str += (str ? ' ' : '') + val;
  }
  return str;
}

export default clsx;
