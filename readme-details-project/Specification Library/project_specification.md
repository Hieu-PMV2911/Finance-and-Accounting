# Project Specification: `@nano/transform`

## 1. Overview & Core Philosophy
`@nano/transform` is a zero-dependency, ultra-lightweight (< 1KB gzipped target), high-performance TypeScript utility library for string casing conversion and deep object transformations.

### Core Goals:
1. **Zero-Dependency**: No runtime dependencies.
2. **Tree-Shakable & Side-Effect Free**: Every function is pure and independently exportable (`sideEffects: false`).
3. **TypeScript-First with Exact Type Inference**: Preserve strict types, object structures, and autocompletion through complex template literal types.
4. **Security & Edge-Case Resilience**: Guard against Prototype Pollution (`__proto__`, `constructor`, `prototype`) and handle bad runtime inputs (`null`, `undefined`, special objects like `Date`, `RegExp`, `Set`, `Map`).
5. **Dual Export**: Support ESM (`.mjs`) and CommonJS (`.cjs`) output formats.

---

## 2. Tech Stack & Tooling
- **Language**: TypeScript 5.x+
- **Build Tool**: `tsup` (powered by `esbuild`)
- **Test Runner**: `vitest` (100% code coverage requirement)
- **Benchmarking**: `mitata` or `tinybench`
- **Package Manager**: `pnpm`

---

## 3. Directory Structure

```text
nano-transform/
├── src/
│   ├── string/
│   │   ├── camel-case.ts
│   │   ├── snake-case.ts
│   │   ├── kebab-case.ts
│   │   ├── pascal-case.ts
│   │   ├── slugify.ts
│   │   └── index.ts
│   ├── object/
│   │   ├── camel-case-keys.ts
│   │   ├── snake-case-keys.ts
│   │   ├── deep-merge.ts
│   │   ├── deep-clone.ts
│   │   ├── pick.ts
│   │   ├── omit.ts
│   │   └── index.ts
│   ├── types/
│   │   ├── string-types.ts
│   │   └── object-types.ts
│   ├── utils/
│   │   ├── is-object.ts
│   │   └── sanitize-key.ts
│   └── index.ts
├── tests/
│   ├── string.test.ts
│   ├── object.test.ts
│   └── security.test.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 4. Detailed Function Specifications & API Signatures

### 4.1. String Module (`src/string/`)

#### `camelCase(str: string): string`
- **Input**: `"hello-world"`, `"hello_world"`, `"Hello World"`, `"FOO_BAR"`
- **Output**: `"helloWorld"`, `"fooBar"`
- **Rules**: Convert characters following delimiters (`-`, `_`, space, uppercase transitions) to uppercase, set first character to lowercase. Handle non-alphanumeric correctly.

#### `snakeCase(str: string): string`
- **Input**: `"helloWorld"`, `"hello-world"`, `"Hello World"`
- **Output**: `"hello_world"`

#### `kebabCase(str: string): string`
- **Input**: `"helloWorld"`, `"hello_world"`, `"Hello World"`
- **Output**: `"hello-world"`

#### `pascalCase(str: string): string`
- **Input**: `"hello_world"`, `"helloWorld"`
- **Output**: `"HelloWorld"`

#### `slugify(str: string): string`
- **Input**: `"Thư viện npm siêu nhẹ!"`
- **Output**: `"thu-vien-npm-sieu-nhe"`
- **Rules**: Remove diacritical marks/accents (Vietnamese and international Unicode), strip special characters, replace spaces with hyphens.

---

### 4.2. Object Module (`src/object/`)

#### `camelCaseKeys<T>(obj: T): CamelCaseKeys<T>`
- Recurse through objects and arrays to convert all object keys to `camelCase`.
- **Preserve Non-Plain Objects**: Do NOT mutate or convert keys of `Date`, `RegExp`, `Map`, `Set`, `Buffer`, `Blob`, `File`.
- **Security**: Skip keys equal to `__proto__`, `constructor`, `prototype`.

#### `snakeCaseKeys<T>(obj: T): SnakeCaseKeys<T>`
- Recurse through objects and arrays to convert all object keys to `snake_case`.
- Same preservation and security rules as `camelCaseKeys`.

#### `deepMerge<T, U>(target: T, source: U): T & U`
- Merges nested properties of `source` into `target`.
- Returns a new object without mutating inputs.
- Arrays are replaced or concatenated based on optional flag (default: replace).
- **Security Critical**: Must ignore keys matching `__proto__`, `constructor`, or `prototype` to prevent Prototype Pollution attacks.

#### `deepClone<T>(obj: T): T`
- Creates a deep copy of plain objects and arrays.
- Preserves primitives, `Date`, `RegExp`.

#### `pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>`
- Returns a new object with only specified keys.

#### `omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>`
- Returns a new object without specified keys.

---

## 5. Type System Requirements (`src/types/`)

### Compile-time Type Transformations
All functions must export matching TypeScript type utilities so IntelliSense correctly infers transformed types:

```typescript
// Example target types to implement:

export type CamelCase<S extends string> = S extends `${infer T}_${infer U}`
  ? `${Lowercase<T>}${Capitalize<CamelCase<U>>}`
  : S extends `${infer T}-${infer U}`
  ? `${Lowercase<T>}${Capitalize<CamelCase<U>>}`
  : Lowercase<S>;

export type CamelCaseKeys<T> = T extends Array<infer U>
  ? Array<CamelCaseKeys<U>>
  : T extends Date | RegExp | Map<any, any> | Set<any>
  ? T
  : T extends object
  ? {
      [K in keyof T as CamelCase<Extract<K, string>>]: CamelCaseKeys<T[K]>;
    }
  : T;
```

---

## 6. Security & Guard Clauses

1. **Prototype Pollution Protection**:
   ```typescript
   export function isUnsafeKey(key: string): boolean {
     return key === '__proto__' || key === 'constructor' || key === 'prototype';
   }
   ```
2. **Null / Undefined Handling**:
   - If input is `null` or `undefined`, return the input as-is without throwing errors.
3. **Circular Reference Handling**:
   - In `deepClone` and `deepMerge`, handle circular references using a `WeakMap` tracker if depth exceeds threshold or by default.

---

## 7. Package & Build Configuration Specs

### `package.json`
```json
{
  "name": "@nano/transform",
  "version": "1.0.0",
  "description": "Ultra-lightweight, zero-dependency string and object casing transformer",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./string": {
      "types": "./dist/string/index.d.ts",
      "import": "./dist/string/index.mjs",
      "require": "./dist/string/index.cjs"
    },
    "./object": {
      "types": "./dist/object/index.d.ts",
      "import": "./dist/object/index.mjs",
      "require": "./dist/object/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### `tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/string/index.ts', 'src/object/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
});
```

---

## 8. AI Code Generation Instructions

When generating code for this specification:
1. Write **fully implemented code** (no `// TODO` or placeholder comments).
2. Ensure **all RegExp instances** used for string splitting are defined outside functions to avoid recompilation overhead.
3. Ensure **100% strict type safety** with no usage of explicit `any` unless strictly required for unsafe object boundary assertions (and properly casted immediately).
4. Include **Vitest unit tests** covering normal usage, Vietnamese Unicode characters in `slugify`, deep nested objects, and prototype pollution attack vectors.