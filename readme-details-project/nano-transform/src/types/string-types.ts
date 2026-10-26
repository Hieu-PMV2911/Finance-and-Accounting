/**
 * Compile-time casing utilities.
 *
 * They mirror the runtime helpers exactly: the input is split on every
 * non-alphanumeric character, on case transitions (`fooBar` -> `foo`, `Bar`,
 * `HTTPServer` -> `HTTP`, `Server`) and between letter and digit runs
 * (`user2FA` -> `user`, `2`, `FA`), then re-joined in the target casing.
 */
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** `true` when the character has no lowercase form (uppercase or uncased). */
type IsUpper<C extends string> = C extends Lowercase<C> ? false : true;

/** `true` when the character has no uppercase form (lowercase or uncased). */
type IsLower<C extends string> = C extends Uppercase<C> ? false : true;

type Flush<Current extends string, Acc extends string[]> = Current extends ''
  ? Acc
  : [...Acc, Current];

type Letter = 'a';
type Num = '9';

/** Splits a string literal into its word parts, e.g. `'foo_bar'` -> `['foo', 'bar']`. */
type SplitWords<
  S extends string,
  Current extends string = '',
  Acc extends string[] = [],
  Mode extends Letter | Num = Letter,
> = S extends `${infer Head}${infer Rest}`
  ? IsLower<Head> extends true
    ? SplitWords<
        Rest,
        Mode extends Num ? Head : `${Current}${Head}`,
        Mode extends Num ? Flush<Current, Acc> : Acc,
        Letter
      >
    : IsUpper<Head> extends true
      ? Rest extends `${infer Next}${string}`
        ? IsLower<Next> extends true
          ? SplitWords<Rest, Head, Flush<Current, Acc>, Letter>
          : SplitWords<
              Rest,
              Mode extends Num ? Head : `${Current}${Head}`,
              Mode extends Num ? Flush<Current, Acc> : Acc,
              Letter
            >
        : SplitWords<
            Rest,
            Mode extends Num ? Head : `${Current}${Head}`,
            Mode extends Num ? Flush<Current, Acc> : Acc,
            Letter
          >
      : Head extends Digit
        ? SplitWords<
            Rest,
            Mode extends Letter ? Head : `${Current}${Head}`,
            Mode extends Letter ? Flush<Current, Acc> : Acc,
            Num
          >
        : SplitWords<Rest, '', Flush<Current, Acc>, Letter>
  : Flush<Current, Acc>;

type CamelFromWords<W extends string[], Acc extends string = ''> = W extends [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? CamelFromWords<
      Rest,
      `${Acc}${Acc extends '' ? Lowercase<Head> : Capitalize<Lowercase<Head>>}`
    >
  : Acc;

type JoinWords<
  W extends string[],
  Sep extends string,
  Acc extends string = '',
> = W extends [infer Head extends string, ...infer Rest extends string[]]
  ? JoinWords<Rest, Sep, `${Acc}${Acc extends '' ? '' : Sep}${Lowercase<Head>}`>
  : Acc;

/** True for a wide `string` and for template literal patterns, not for literals. */
type IsWide<S extends string> = string extends S ? true : false;

/** `'FOO_BAR'` -> `'fooBar'`, `'helloWorld'` -> `'helloWorld'`. */
export type CamelCase<S extends string> = IsWide<S> extends true
  ? string
  : CamelFromWords<SplitWords<S>>;

/** `'hello_world'` -> `'HelloWorld'`. */
export type PascalCase<S extends string> = IsWide<S> extends true
  ? string
  : Capitalize<CamelCase<S>>;

/** `'helloWorld'` -> `'hello_world'`. */
export type SnakeCase<S extends string> = IsWide<S> extends true
  ? string
  : JoinWords<SplitWords<S>, '_'>;

/** `'helloWorld'` -> `'hello-world'`. */
export type KebabCase<S extends string> = IsWide<S> extends true
  ? string
  : JoinWords<SplitWords<S>, '-'>;
