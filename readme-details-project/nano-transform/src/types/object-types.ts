import type { CamelCase, SnakeCase } from './string-types';

/**
 * Values that keep their identity: their keys are never rewritten and they are
 * never walked into.
 */
type Preserved =
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | ((...args: never[]) => unknown);

type RewriteKeys<T, C extends 'camel' | 'snake'> = T extends Preserved
  ? T
  : T extends readonly (infer Item)[]
    ? RewriteKeys<Item, C>[]
    : T extends object
      ? {
          [K in keyof T as K extends string
            ? C extends 'camel'
              ? CamelCase<K>
              : SnakeCase<K>
            : K]: RewriteKeys<T[K], C>;
        }
      : T;

/** Object type produced by `camelCaseKeys`. */
export type CamelCaseKeys<T> = RewriteKeys<T, 'camel'>;

/** Object type produced by `snakeCaseKeys`. */
export type SnakeCaseKeys<T> = RewriteKeys<T, 'snake'>;

/**
 * Result of `deepMerge`: the intersection of both shapes, except that a
 * `null`/`undefined` side is ignored instead of collapsing the whole type to
 * `never`.
 */
export type DeepMergeResult<T, U> = [T] extends [null | undefined]
  ? [U] extends [null | undefined]
    ? T
    : U
  : [U] extends [null | undefined]
    ? T
    : T & U;

/** Options accepted by `deepMerge`. */
export interface DeepMergeOptions {
  /**
   * How arrays are combined when both sides hold an array.
   * - `'replace'` (default): the source array wins.
   * - `'concat'`: target items followed by source items.
   */
  arrayMode?: 'replace' | 'concat';
}
