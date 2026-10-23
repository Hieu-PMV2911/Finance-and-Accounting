# LIMITATIONS.md

What `unplugin-smart-asset` does not do. Read this before adopting it — several entries
are architectural, not "not yet implemented".

Usage lives in [`README.md`](./README.md); failure diagnosis in
[`FAILURE_MODES.md`](./FAILURE_MODES.md).

---

## Hard limits

| Limitation | Detail |
|---|---|
| **Shadow DOM** | `<use href="#id">` cannot reference a sprite outside the shadow root. Use `sprite.mode: 'file'` and inject the sprite into each root. |
| **`node_modules`** | Dependency code is not transformed. Applies to your source only. A component library shipping its own icons cannot be converted this way. |
| **CSS `url()`** | `smart:` is not supported inside CSS. Use the bundler's `assetsInlineLimit` for that. |
| **`srcset` / `<picture>`** | Not supported yet. |
| **WebP / AVIF** | No automatic conversion. |
| **Multi-page apps** | Every page receives the full sprite (no per-entry split). |
| **Next.js Turbopack** | No tag syntax — the component API is the only option. |
| **Icon code-splitting** | The sprite is global. If you need per-route icon payloads, this plugin is the wrong tool. |

## Behaviour that surprises people

| Behaviour | Why |
|---|---|
| **SSR needs `<SmartAssetSprite />`** | `inject: 'html'` auto-switches to `'component'` for SSR/lib builds, with a warning. There is no HTML document to inject into at the right moment. |
| **Dev: first paint is empty** | On a cold dev server the sprite is injected into `index.html` **before** any module is transformed, so the very first page load has an empty sprite; icons appear after the automatic reload. Production builds are unaffected. Measured: first `/` request → 0 sprite roots, second → 1. See `FAILURE_MODES.md` F17. |
| **Hard-coded icon colors** | SVGs containing `style="fill:red"` keep that color and ignore `currentColor`. `smart-asset report` flags these icons. |
| **Icons must be self-contained** | Icons referencing external files or fonts (rare in Iconify sets, common in hand-drawn SVGs) will render incomplete. |

## When NOT to use it

- **Fewer than ~10 icons** → the benefit is near zero; a build plugin is not worth the
  added build-time surface.
- **You need per-route icon code-splitting** → the sprite is global.
- **You use Shadow DOM heavily** → `<use href="#id">` cannot cross a shadow boundary.
- **Your bundler is Webpack, Rspack or esbuild** → not implemented (v1.2). See
  [`ROADMAP.md`](./ROADMAP.md).
- **You need to ship icons from a published component library** → `node_modules` is not
  transformed.

## Trade-off: no disk cache

Icons are re-optimised on every build. At 0.25 ms/icon that is 50 ms for 200 icons — less
than the I/O and invalidation risk a cache would add, and a stale icon is worse than a
slow build. The measurements behind that decision are in
[`INTERNALS.md`](./INTERNALS.md#performance).
