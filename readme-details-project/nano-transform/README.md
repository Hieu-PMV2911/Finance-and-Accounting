# @nano/transform

Ultra-lightweight, zero-dependency string casing and deep object transformation for TypeScript.

- **Zero dependencies**, fully tree-shakable (`sideEffects: false`).
- **Dual ESM + CJS** with a dedicated entry per module (`@nano/transform/string`, `@nano/transform/object`).
- **Exact type inference** through template literal types: `camelCase('hello-world')` is typed as `'helloWorld'`, `camelCaseKeys` rewrites your object type.
- **Hardened**: prototype-pollution keys are dropped, circular references are handled, and `null`/`undefined` never throw.

| Entry                        | minified | gzipped |
| ---------------------------- | -------- | ------- |
| `@nano/transform/string`     | 895 B    | 490 B   |
| `@nano/transform/object`     | 2.4 KB   | 987 B   |
| `@nano/transform` (both)     | 2.9 KB   | 1.2 KB  |
| one function, tree-shaken    | 346 B    | 238 B   |

## Install

```bash
pnpm add @nano/transform
# or: npm i @nano/transform / yarn add @nano/transform
```

## String casing

```ts
import { camelCase, snakeCase, kebabCase, pascalCase, slugify } from '@nano/transform/string';

camelCase('hello-world');            // 'helloWorld'
camelCase('Hello World');            // 'helloWorld'
camelCase('FOO_BAR');                // 'fooBar'
camelCase('HTTPServer');             // 'httpServer'
camelCase('Thư viện');               // 'thưViện'

snakeCase('helloWorld');             // 'hello_world'
kebabCase('helloWorld');             // 'hello-world'
pascalCase('hello_world');           // 'HelloWorld'

slugify('Thư viện npm siêu nhẹ!');    // 'thu-vien-npm-sieu-nhe'
slugify('Café Ångström');            // 'cafe-angstrom'
```

All casing helpers split on **any** non-alphanumeric character (`-`, `_`, space, `.`, `/`, `@`, emoji…) and on case transitions, so `foo.bar/baz@qux` becomes `fooBarBazQux` and `HTTPServer` becomes `httpServer` (acronym aware). Unicode letters are preserved as long as they carry case information.

`slugify` is different: it is meant for URLs and therefore emits **ASCII only**. It first decomposes the string with Unicode NFD, removes combining marks, maps letters that do not decompose (`đ → d`, `ß → ss`, `ø → o`, `ł → l`, `æ → ae`, `œ → oe`, `ð → d`), lowercases, then collapses every remaining run of non-`[a-z0-9]` characters into a single hyphen and trims hyphens from both ends.

## Object transformation

```ts
import { camelCaseKeys, snakeCaseKeys } from '@nano/transform/object';

camelCaseKeys({
  user_name: 'An',
  'created-at': new Date(),
  nested_obj: { item_list: [{ item_id: 1 }] },
});
// {
//   userName: 'An',
//   createdAt: Date,
//   nestedObj: { itemList: [{ itemId: 1 }] },
// }
```

- Works recursively through plain objects and arrays and returns a **new** structure — inputs are never mutated.
- `Date`, `RegExp`, `Map`, `Set`, `Buffer`/typed arrays, `Blob`/`File` and class instances keep their identity *and* their keys.
- Circular references are preserved (`output.self === output`).
- Keys `__proto__`, `constructor` and `prototype` are skipped.

### deepMerge

```ts
deepMerge({ db: { host: 'a', port: 5432 } }, { db: { port: 6543 } });
// { db: { host: 'a', port: 6543 } }

deepMerge({ tags: [1] }, { tags: [2] });                                // { tags: [2] }
deepMerge({ tags: [1] }, { tags: [2] }, { arrayMode: 'concat' });      // { tags: [1, 2] }
```

- Returns a brand-new object; nested objects from `target` are cloned rather than shared.
- Arrays are replaced by default, or concatenated (`target` items first) with `{ arrayMode: 'concat' }`.
- A source value of `undefined` never overwrites the target value.
- `Date`/`RegExp` values are cloned, `Map`/`Set` and other exotic objects are kept by reference.
- Both sides are filtered for prototype-pollution keys; circular structures are supported.
- `deepMerge(target, null)` returns a clone of `target`, `deepMerge(null, source)` a clone of `source`.

### deepClone

```ts
const copy = deepClone({ a: { b: [1, 2] }, when: new Date() });
```

Deep-copies plain objects and arrays, clones `Date` and `RegExp`, keeps other exotic objects by reference, skips prototype-pollution keys and reproduces cycles.

### pick / omit

```ts
pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b']);      // { a: 1, c: 3 }
```

Both are shallow by design (values keep their identity), copy only own enumerable properties, ignore inherited and prototype-pollution keys, and infer `Pick<T, K>` / `Omit<T, K>`.

## Types

Every helper ships a matching type, exported from the same entry:

```ts
import type { CamelCase, SnakeCase, KebabCase, PascalCase } from '@nano/transform/string';
import type { CamelCaseKeys, SnakeCaseKeys, DeepMergeResult } from '@nano/transform/object';

type A = CamelCase<'FOO_BAR'>;                  // 'fooBar'
type B = SnakeCase<'helloWorld'>;               // 'hello_world'
type C = CamelCaseKeys<{ user_name: string }>;  // { userName: string }

const merged = deepMerge({ a: 1 }, { b: 'x' }); // { a: number } & { b: string }
```

The type-level splitter mirrors the runtime tokenizer (delimiters, case transitions, letter/digit boundaries), so literal arguments give literal results — including `Date`, `Map`, functions and nested arrays staying untouched.

## Security & edge cases

- `null` / `undefined` inputs are returned as-is by every function; nothing throws.
- `__proto__`, `constructor` and `prototype` are ignored when keys are read, written or created, which blocks the classic JSON prototype-pollution payloads (covered by `tests/security.test.ts`).
- `deepClone` and `deepMerge` track visited objects in a `WeakMap`, so cyclic data does not cause infinite recursion.
- Non-object runtime values (numbers, strings, booleans) pass through key-transforming helpers unchanged.

## Limitations

- `slugify` intentionally drops scripts without ASCII transliteration (Cyrillic, CJK, Thai…). Latin accents and Vietnamese are supported.
- `deepClone` and `pick`/`omit` do not clone `Map`, `Set` or class instances; they are preserved by reference. `deepMerge` merges only plain objects.
- Type inference is a literal-level approximation of the runtime tokenizer; very long strings may hit TypeScript's instantiation depth limit.

## Development

```bash
pnpm install
pnpm test            # vitest
pnpm run test:coverage   # 100% thresholds on statements/branches/functions/lines
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsup -> dist (ESM + CJS + d.ts)
```

## License

MIT
