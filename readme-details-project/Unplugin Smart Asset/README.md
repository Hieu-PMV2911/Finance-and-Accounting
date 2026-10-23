# unplugin-smart-asset

**Zero-import icon & asset manager.** Write `<icon-lucide-home />` without a single `import`. Icons are aggregated into one native SVG sprite; small images are inlined, large ones emitted as files.

> Not published to npm yet (registry returns 404). What is verified vs. only designed:
> [`ROADMAP.md`](./ROADMAP.md).

| | |
|---|---|
| [`ROADMAP.md`](./ROADMAP.md) | Support matrix with evidence · planned frameworks · bundler roadmap |
| [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) | Blank icons, build errors, `tsc` failures, migration |
| [`LIMITATIONS.md`](./LIMITATIONS.md) | What it does not do · when not to use it |
| [`INTERNALS.md`](./INTERNALS.md) | Pipeline · performance · design decisions |
| [`FAILURE_MODES.md`](./FAILURE_MODES.md) | Every known failure with the evidence behind it |

---

## Contents

[Install](#install) · [Quick start](#quick-start) · [Icon syntax](#icon-syntax) · [Configuration](#configuration) · [Images](#images) · [Component API](#frameworks-without-tag-support) · [CLI](#cli) · [TypeScript](#typescript) · [Accessibility](#accessibility)

---

## Requirements

| | |
|---|---|
| Node | ≥ 20.19 |
| Bundler | Vite 8 (tested) · Vite ≥ 6 (⚠️ untested) · Rollup ≥ 4 (⚠️ untested) |
| Icons | `@iconify-json/*` (offline) or local SVG files |

React, Preact, Solid, Vue 3, Svelte 4/5 and plain HTML all work — no framework is
mandatory. Next.js uses the [component API](#frameworks-without-tag-support). Full matrix
with verification evidence: [`ROADMAP.md`](./ROADMAP.md).

### Rollup

`unplugin-smart-asset/rollup` works, but Rollup has no HTML pipeline, so the plugin
switches `inject` to `'component'` with a warning. Two consequences: render
`<SmartAssetSprite />` once in your layout, and keep a downstream JSX transform. Why it
works this way: [`INTERNALS.md`](./INTERNALS.md#bundler-fallbacks).

---

## Install

```bash
pnpm add -D unplugin-smart-asset
# plus the icon set you need
pnpm add -D @iconify-json/lucide
```

`@iconify-json/*` is a **devDependency**: icons are read at build time and never shipped in the bundle.

---

## Quick start

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import SmartAsset from 'unplugin-smart-asset/vite';

export default defineConfig({
  plugins: [
    SmartAsset({
      collections: { lucide: '@iconify-json/lucide' },
    }),
    // ...your framework plugin
  ],
});
```

### React

```tsx
// src/App.tsx
export function App() {
  return (
    <nav>
      <icon-lucide-home className="w-6 h-6 text-blue-500" />
      <icon-lucide-user className="w-6 h-6" aria-label="Account" />
    </nav>
  );
}
```

No imports. `tsc` knows both tags thanks to the auto-generated `.d.ts`.

### Vue · Svelte · Solid · HTML

The tag is identical everywhere; only the class attribute differs. In a Vue SFC it goes
inside `<template>`, in Svelte at the top level, in HTML anywhere in `<body>`.

| Framework | Write |
|---|---|
| Vue · Svelte · Solid | `<icon-lucide-home class="w-6 h-6" />` |
| React · Preact | `<icon-lucide-home className="w-6 h-6" />` |
| HTML | `<icon-lucide-home></icon-lucide-home>` |

`className` in Vue is **silently ignored** — the most common copy-paste mistake. Full
table: [attribute mapping](#attribute-mapping).

### Local icons

Drop files into `src/assets/icons/`; the filename becomes the icon name:

```
src/assets/icons/
├── logo.svg
└── brand-mark.svg
```

```tsx
<icon-local-logo className="w-10 h-10" />
<icon-local-brand-mark className="w-4 h-4" />
```

The collection name for the local folder defaults to `local`; change it with `localCollection`.

---

## Icon syntax

```
<icon-{collection}-{name} />
 └─┬─┘ └────┬────┘ └─┬─┘
 prefix   collection  name
```

| Example | Collection | Icon |
|---|---|---|
| `<icon-lucide-home />` | `lucide` | `home` |
| `<icon-lucide-arrow-left />` | `lucide` | `arrow-left` |
| `<icon-local-logo />` | `local` | `logo` |
| `<icon-heroicons-solid-check />` | `heroicons-solid` | `check` |

**Resolution rule:** both collection and icon names may contain `-`, so the plugin uses **longest-prefix matching** against the collections you declared. `heroicons-solid-check` → collection `heroicons-solid` + icon `check`, because `heroicons-solid` is the longest matching prefix.

If it is still ambiguous (two collections share a prefix), the build **throws** with the candidate list — it never guesses.

### `:` form (optional)

`<icon:lucide-home />` also works in React, Solid, Vue and Svelte.

Use `-` as the standard. `:` exists only for backward compatibility:

```ts
SmartAsset({ colonAlias: false })  // disable the : form entirely
```

---

## Configuration

```ts
SmartAsset({
  // ── Framework ──────────────────────────────────────────────
  frameworks: 'auto',            // 'auto' | ('react'|'vue'|'svelte'|'solid'|'preact'|'html')[]

  // ── Syntax ─────────────────────────────────────────────────
  iconPrefix: 'icon',            // tag prefix
  colonAlias: true,              // allow <icon:name />

  // ── Icon sources ───────────────────────────────────────────
  collections: {
    lucide: '@iconify-json/lucide',
    heroicons: '@iconify-json/heroicons',
  },
  localIconDirs: ['src/assets/icons'],
  localCollection: 'local',

  // ── Unknown icons ──────────────────────────────────────────
  onUnknownIcon: 'throw',        // 'throw' | 'warn' | 'passthrough'

  // ── Images ─────────────────────────────────────────────────
  maxInlineSize: 4096,           // bytes; smaller → data URI
  imagePrefix: 'smart:',
  imageAttrs: ['src'],

  // ── Sprite ─────────────────────────────────────────────────
  sprite: {
    id: '__SMART_ASSET_SPRITE__',
    mode: 'auto',                // 'inline' | 'file' | 'auto'
    inlineMaxBytes: 49152,       // auto: inline when ≤ 48 KB
    dedupe: true,                // identical icons → one symbol
    preload: true,               // mode 'file': add <link rel=preload>
  },

  // ── Sprite delivery ────────────────────────────────────────
  inject: 'auto',                // 'auto' | 'html' | 'component' | 'none'

  // ── TypeScript ─────────────────────────────────────────────
  dts: 'src/smart-asset.d.ts',   // false to disable
  allowUnknownIcons: false,      // true → wildcard index, loses typo detection

  // ── Misc ───────────────────────────────────────────────────
  svgo: { plugins: ['preset-default'] },  // false to disable optimization
  assertNoLeftover: true,        // fail the build if tags remain unprocessed
  verbose: false,
})
```

### Attribute mapping

The plugin forwards your attributes onto the `<svg>`. Attribute names **differ per framework** — this is the most common copy-paste mistake.

| Framework | Class | Events | Notes |
|---|---|---|---|
| React / Preact / Solid | `className` | `onClick` | `className` is the standard |
| Vue | `class` | `@click` | `className` is silently ignored |
| Svelte | `class` | `onclick` | |
| HTML | `class` | `onclick` | |

Attributes preserved on `<svg>`: `class`/`className`, `style`, `id`, `role`, `aria-*`, `data-*`, `title`, `width`, `height`.

### Output

```tsx
// You write
<icon-lucide-home className="w-6 text-blue-500" aria-label="Home" />

// Build produces
<svg className="w-6 text-blue-500" aria-label="Home" role="img"
     width="1em" height="1em" viewBox="0 0 24 24">
  <use href="#smart-icon-lucide-home" />
</svg>
```

`width`/`height` default to `1em` so Tailwind's `w-6 h-6` stays in control.

---

## Images

Prefix `src` (or any attribute configured in `imageAttrs`) with `smart:`:

```tsx
<img src="smart:@assets/avatar.png" alt="Avatar" />
<img src="smart:@assets/banner.png" alt="Banner" />
```

| Size | Result |
|---|---|
| `< maxInlineSize` (4 KB default) | Base64 data URI, no extra request |
| `≥ maxInlineSize` | Emitted file with content hash in `dist/assets/` |

`smart:` honours bundler aliases (`@assets`, `~`, tsconfig paths) because paths are resolved through the bundler's `this.resolve()` rather than guessed.

```ts
// vite.config.ts
resolve: { alias: { '@assets': '/src/assets' } }
```

Editing an image in dev triggers a rebuild — the plugin registers `addWatchFile`.

---

## Frameworks without tag support

When a framework does not let you hook HTML or its compiler, use the **component API**. Still zero-import; the icon is a prop instead of a tag.

### Prepare

```bash
npx smart-asset prepare
```

Generates `sprite.svg` + `.d.ts` + manifest. Run it before `tsc` and before `next build`.

```json
{
  "scripts": {
    "prepare": "smart-asset prepare",
    "dev": "next dev",
    "build": "smart-asset prepare && next build"
  }
}
```

### Next.js (App Router)

```tsx
// app/layout.tsx
import { SmartAssetSprite } from 'unplugin-smart-asset/runtime/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SmartAssetSprite />
        {children}
      </body>
    </html>
  );
}
```

`<SmartAssetSprite />` reads the `sprite.svg` produced by `smart-asset prepare` and renders it once on the server — no `?raw` import, no bundler plugin.

```tsx
import { SmartIcon } from 'unplugin-smart-asset/runtime/react';

<SmartIcon name="lucide-home" className="w-6 h-6" />
```

> **Turbopack has no plugin API.** With Next.js the tag syntax is **not available** — the component path is the only option.

The same `<SmartAssetSprite />` + `<SmartIcon />` pair is the fallback for Rollup, SSR
builds and library builds. Nuxt, Astro and Angular modules are **not implemented** —
design sketches are in [`ROADMAP.md`](./ROADMAP.md).

---

## CLI

```bash
npx smart-asset prepare   # generate sprite + .d.ts + manifest
npx smart-asset check     # CI gate: unknown icons, missing images, leftover tags, oversized sprite
npx smart-asset report    # icon → usage count, bytes, dead icons
```

`check` exits with code 1 on failure, so it drops straight into CI:

```yaml
- run: npx smart-asset check
```

Sample `report` output:

```
collection  icon           uses   bytes
lucide      home              7     162
lucide      user              4     158
lucide      arrow-left        1     151
local       logo              1     402
──
sprite total: 4 symbols · 873 B · 0 dead icons
```

---

## TypeScript

The `.d.ts` is generated automatically, **for the framework actually detected**:

| Framework | Augmentation target |
|---|---|
| React | `declare module 'react' { namespace JSX { interface IntrinsicElements } }` |
| Preact | `declare module 'preact' { namespace JSX { … } }` |
| Solid | `declare module 'solid-js' { namespace JSX { … } }` |
| Vue | `declare module 'vue' { interface GlobalComponents { … } }` |
| Svelte 4 & 5 | `declare module 'svelte/elements' { interface SvelteHTMLElements { … } }` |

By default it emits **literal unions**, so a typo is a **compile error**:

```tsx
<icon-lucide-hom />   // ❌ Property 'icon-lucide-hom' does not exist
```

If you need dynamic icon names (from an API), enable the wildcard — at the cost of typo detection:

```ts
SmartAsset({ allowUnknownIcons: true })
```

The generated `.d.ts` should be **gitignored** — it is a build artifact, and committing it makes every icon change a noisy diff.

---

## Accessibility

Icons are **decorative** by default — without a label the plugin adds `aria-hidden="true"`:

```tsx
<icon-lucide-home className="w-4 h-4" />              // aria-hidden="true"
<icon-lucide-home aria-label="Home" />                // role="img" + label
<icon-lucide-home title="Home" />                     // <title> inside <svg>
```

`title` renders **inside the `<svg>` host**, never inside the `<symbol>` — a `<title>` in a symbol would share one `id` across every instance and confuse screen readers.

---

## License

MIT
