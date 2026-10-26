# @core/clsx

A tiny, zero-dependency utility for constructing `className` strings conditionally.

```ts
clsx('foo', { bar: true, duck: false }, 'baz', [0, 'hello']);
// 'foo bar baz hello'
```

| Build             | minified | gzip (level 9) | budget |
| ----------------- | -------- | -------------- | ------ |
| `@core/clsx`      | 380 B    | **221 B**      | 230 B  |
| `@core/clsx/lite` | 311 B    | **195 B**      | 230 B  |
| CJS `index.cjs`   | 452 B    | 275 B          | —      |

The gzip numbers are reported by `pnpm size`, which compresses the published ESM
files with Node's `zlib` (no file name / timestamp in the gzip header, the same
measurement bundlers and size tools use).

## Install

```bash
pnpm add @core/clsx
# or: npm i @core/clsx / yarn add @core/clsx
```

Ships ESM (`.mjs`), CommonJS (`.cjs`) and TypeScript declarations, is
`sideEffects: false` and has no runtime dependencies.

## Usage

```ts
import clsx from '@core/clsx';
// or: import { clsx } from '@core/clsx';

clsx('btn', 'btn-primary');                              // 'btn btn-primary'
clsx('btn', isActive && 'btn-active');                   // conditionals
clsx({ 'btn-active': isActive, 'btn-disabled': !isActive });
clsx(['btn', ['btn-lg', isLarge && 'shadow']]);          // nested arrays
clsx('count', 42);                                       // numbers
```

| Input                              | Output                |
| ---------------------------------- | --------------------- |
| `'btn'`, `123`                     | `'btn 123'`           |
| `null`, `undefined`, `false`, `0`, `''` | dropped          |
| `true`                             | dropped               |
| `{ active: true, disabled: false }`| `'active'`            |
| `['btn', ['active', false]]`       | `'btn active'`        |
| `('foo', { bar: true, duck: false }, 'baz', [0, 'hello'])` | `'foo bar baz hello'` |

Rules in detail:

- Strings and numbers are appended verbatim; values are joined with a single space.
- Any falsy value (`false`, `0`, `''`, `null`, `undefined`, `NaN`) and `true` are dropped at every nesting level.
- Object keys are kept when their value is truthy. Like a `for..in` loop, inherited enumerable keys are visited too, so pass plain maps.
- Arrays are flattened recursively, in order.
- Class names are not trimmed or normalised; `clsx('  a  ', 'b')` returns `'  a   b'`.
- Calling `clsx()` returns `''`.

### `@core/clsx/lite`

Same runtime without object-map support, for code that only passes strings,
numbers and arrays:

```ts
import { clsx } from '@core/clsx/lite';

clsx('btn', ['btn-primary', false], 0 && 'big'); // 'btn btn-primary'
```

Objects are ignored (not scanned) by the lite build, which makes it ~26 B
gzipped smaller and measurably faster on hot paths.

### TypeScript

```ts
import clsx, { type ClassValue, type ClassDictionary, type ClassArray } from '@core/clsx';

const values: ClassValue[] = ['a', { b: true }, ['c', null, false]];
const className: string = clsx(...values);
```

`ClassDictionary` is `Record<string, unknown>` (not `any`), so values are type
checked when they are written but never treated as class names.

## Benchmarks

`pnpm bench` runs [tinybench](https://github.com/tinylibs/tinybench) against
[`classnames`](https://github.com/JedWatson/classnames) on Node 22 (Apple
Silicon), 500 ms per task:

| Scenario | `@core/clsx`      | `@core/clsx/lite` | `classnames`    |
| -------- | ----------------- | ----------------- | --------------- |
| strings  | 10.4M ops/s       | 10.3M ops/s       | 8.8M ops/s      |
| objects  | 8.3M ops/s        | —                 | 8.1M ops/s      |
| arrays   | 5.3M ops/s        | 6.7M ops/s        | 4.9M ops/s      |
| falsy    | 10.7M ops/s       | 16.4M ops/s       | 10.8M ops/s     |

`@core/clsx` is consistently at or slightly above `classnames` (roughly 1.0–1.6×
depending on the shape of the input); the lite build is the fastest of the three.
Treat absolute numbers as machine-dependent and re-run on the target hardware
before making performance claims.

## Development

```bash
pnpm install
pnpm test                # vitest
pnpm run test:coverage   # 100% thresholds on statements/branches/functions/lines
pnpm run typecheck       # tsc --noEmit
pnpm run build           # tsup -> dist (ESM + CJS + .d.ts)
pnpm size                # build + fail if a bundle exceeds 230 B gzipped
pnpm bench               # tinybench comparison
```

## Notes on this implementation

- The TypeScript declarations are generated into `dist/` by tsup; there is no
  hand-written `src/index.d.ts`.
- `./lite` is exposed as a package subpath so the lite build is actually
  reachable by consumers.
- `scripts/check-size.mjs` enforces the 230 B budget instead of `size-limit`,
  which keeps the dependency tree at zero extra tooling and reports the exact
  gzip payload.
- Both entries export `clsx` as a named and as the default export. In CommonJS,
  `require('@core/clsx')` returns the module object:
  `const { clsx } = require('@core/clsx')` or `require('@core/clsx').default`.

## License

MIT
