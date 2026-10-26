/** Any value accepted by the lite build: no object maps. */
export type ClassValue = ClassArray | string | number | boolean | null | undefined;

/** Mixed values, flattened recursively. */
export type ClassArray = ClassValue[];

/**
 * Flattens a string, number or nested array into a space-separated class
 * string. Objects are ignored, which is what keeps the lite build small.
 */
function toVal(mix: ClassValue): string {
  let str = '';
  if (Array.isArray(mix)) {
    for (let i = 0; i < mix.length; i++) {
      const val = toVal(mix[i]);
      if (val) str += (str ? ' ' : '') + val;
    }
  } else if ((typeof mix === 'string' || typeof mix === 'number') && mix) {
    str += mix;
  }
  return str;
}

/**
 * Lite `clsx`: strings, numbers and (nested) arrays only. Use it when you never
 * pass `{ key: condition }` maps and want the smallest possible payload.
 *
 * ```ts
 * clsx('btn', ['btn-primary', false], 0 && 'big');
 * // 'btn btn-primary'
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
