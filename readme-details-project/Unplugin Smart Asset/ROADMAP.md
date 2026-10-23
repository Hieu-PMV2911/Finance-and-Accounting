# ROADMAP.md

Implementation status, the evidence behind each claim, and the frameworks that are
designed but not built. Usage lives in [`README.md`](./README.md).

> **The package is not published to npm yet** (the registry returns 404). The README
> describes the **target API contract for v1.0**; this file records how much of that
> contract actually exists and how it was verified.

---

## How to read the symbols

| Symbol | Meaning |
|---|---|
| ✅ | Verified here with a real build **and** a headless-browser pixel check |
| ⚠️ | Implemented and unit-tested, but not exercised end-to-end |
| ❌ | Not supported |

"Verified" is a narrow claim. It means: the app was built, served, screenshotted in
headless Chrome, and the icon's rendered pixels were counted against the expected count.
A green build alone proves nothing here — four of six frameworks compile an unknown tag
without a warning, and a corrupt sprite returns HTTP 200 and renders nothing.

---

## Support matrix

| Framework | Tag syntax | Auto sprite injection | Status |
|---|---|---|---|
| React 19 | ✅ | ✅ | ✅ Vite 8 — build + pixel |
| Vue 3.5 (SFC) | ✅ | ✅ | ✅ Vite 8 — build + pixel |
| Svelte 5 | ✅ | ✅ | ✅ Vite 8, `vite-plugin-svelte` 7 — build + pixel |
| Solid 1.9 | ✅ | ✅ | ✅ Vite 8, `vite-plugin-solid` — build + pixel |
| HTML | ✅ | ✅ | ⚠️ scanner unit-tested only |
| Preact | ✅ | ✅ | ⚠️ not run end-to-end (package install blocked in the build environment); `className` branch unit-tested |
| Rollup + React | ✅ | ❌ (component) | ⚠️ auto-switch unit-tested; no HTML pipeline to inject into |
| Next.js (App Router) | ❌ | ❌ (component) | ⚠️ Turbopack path unverified |
| Nuxt · Astro | — | — | ⬜ module not implemented |
| Angular · Qwik · Lit | ❌ | ❌ (component) | ⬜ runtime entry not implemented |
| Webpack · Rspack · esbuild | — | — | ⬜ not implemented |

Test suite: 72 unit tests (`npm test`), covering resolver, scanners, SVGO pipeline,
plugin hooks, options, and the Rollup fallback.

---

## Roadmap

| | |
|---|---|
| ✅ v1.0 (in progress) | Vite + Rollup · React, Preact, Solid, Vue, Svelte, HTML · `smart:` images · CLI |
| ⬜ v1.1 | Next / Nuxt / Astro · SSR auto-switch |
| ⬜ v1.2 | Webpack / Rspack / Esbuild |
| ⬜ v2.0 | Angular · Lit · Qwik |
| ⬜ later | WebP/AVIF conversion · `migrate` CLI · per-route sprites |

---

## Planned: frameworks without tag support

These modules are **designed but absent from the package**. Each import below fails
today. They are recorded here so the API shape is settled before implementation, and so
nobody mistakes a design sketch for a shipped feature.

Until they ship, the working substitute is `unplugin-smart-asset/vite` with
`inject: 'component'` plus `<SmartAssetSprite />` in the layout — see
[README › Frameworks without tag support](./README.md#frameworks-without-tag-support).

### Nuxt

Nuxt exposes a `render:html` hook, which is where the sprite would be injected:

```ts
// nuxt.config.ts — planned API, not yet available
export default defineNuxtConfig({
  modules: ['unplugin-smart-asset/nuxt'],
});
```

> ⚠️ `unplugin-smart-asset/nuxt` does not exist in this package.

### Astro

An Astro integration can inject into `astro:config:setup` / `astro:build:done`:

```ts
// astro.config.mjs — planned API, not yet available
import smartAsset from 'unplugin-smart-asset/astro';

export default defineConfig({
  integrations: [smartAsset({ collections: { lucide: '@iconify-json/lucide' } })],
});
```

> ⚠️ `unplugin-smart-asset/astro` does not exist in this package.

### Angular

Tags cannot be rewritten — the Angular compiler mangles unknown elements — so the design
is a standalone component:

```ts
// planned API, not yet available
import { SmartIconComponent } from 'unplugin-smart-asset/runtime/angular';

@Component({
  standalone: true,
  imports: [SmartIconComponent],
  template: `<smart-icon name="lucide-home" size="24" />`,
})
export class NavComponent {}
```

> ⚠️ `unplugin-smart-asset/runtime/angular` does not exist in this package.

---

## Planned: other bundlers

Webpack, Rspack and esbuild are **not implemented** (v1.2). There is no
`unplugin-smart-asset/webpack` entry to import. Rollup works through the component
fallback described in
[README › Requirements › Rollup](./README.md#rollup).

---

## Why a status file exists at all

The risk this project carries is not "the feature is missing" — missing features are
loud. The risk is **a feature that looks present**. A README promising a Nuxt module
that 404s costs a user an afternoon; a sprite that builds cleanly and renders nothing
costs a user a day. So every row above is marked with what was actually run, and
[`FAILURE_MODES.md`](./FAILURE_MODES.md) records the command output that established it.
