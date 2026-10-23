# INTERNALS.md

How `unplugin-smart-asset` is put together, the problem it exists to solve, and the
measurements that decided the design. Nothing here is required to *use* the plugin — see
[`README.md`](./README.md) for that.

---

## Why this exists

Three problems with the usual approach:

1. **Boilerplate.** Every file imports each icon individually.
2. **JS overhead.** `lucide-react` and `react-icons` turn every SVG into a JS component — 50 icons ≈ 30–45 KB of JS.
3. **Manual decisions.** Which image to inline, which to emit as a file — today you decide by hand.

The plugin handles all three at build time: it scans the AST for `<icon-*>` tags,
aggregates only the icons actually used into one sprite, and decides inline vs. emit by
byte threshold.

**Measured results** (50 Lucide icons, inline sprite): **0 bytes of JS** for icons, sprite
≈ 7.8 KB of raw HTML. Rendering uses native `<use>` — no framework reconciliation per
icon.

It is not worth it for fewer than ~10 icons, or if you need per-route icon splitting. The
full list of situations where this is the wrong tool is in
[`LIMITATIONS.md`](./LIMITATIONS.md#when-not-to-use-it).

---

## Pipeline

```
Source (.tsx/.vue/.svelte/.html)
   │
   ├─ prefilter: does the file contain 'icon-' or 'smart:'?  (0.04 µs — skips ~90% of files)
   │
   ├─ scan: per-framework AST → { key, attrs, range }
   │
   ├─ resolve: longest-prefix → local dir | @iconify-json
   │
   ├─ optimize: SVGO → prefixIds → strip fill/stroke by icon kind
   │
   ├─ render: replace the exact range with <svg><use href="#id"/></svg>
   │
   └─ inject: sprite into HTML (or a component, for SSR)
```

After the build, the plugin scans the output one last time. Any remaining `icon-*` tag
makes it **throw**. That safety net exists because several frameworks happily compile
unknown tags without a warning — silence is this plugin's dominant failure mode.

## Layers

Only one layer differs per framework, so only one layer is per-framework:

| Layer | File | Framework-specific? |
|---|---|---|
| Source scanner | `src/scan/{jsx,vue,svelte,html}.ts` | **yes** — AST shape |
| Icon resolver | `src/core/resolver.ts` | no |
| SVG optimiser | `src/core/optimize.ts` | no |
| Sprite builder | `src/core/sprite.ts` | no |
| Range rewriter | `src/core/render.ts` | no |
| Bundler glue | `src/plugin.ts`, `src/vite.ts`, `src/rollup.ts` | per-bundler |

Everything downstream of the scanner consumes a framework-neutral
`{ key, attrs, range }`, which is why adding a framework means writing one scanner and
touching nothing else.

## Hook ordering — the two mandatory conditions

**`enforce: 'pre'`.** The plugin must run before `vite:esbuild`. Otherwise JSX has already
been compiled away and the plugin sees plain `jsx('icon-home')` calls, not tags. The
factory sets `enforce` itself; if you wrap the plugin, do not strip it. Position in the
`plugins` array does **not** matter — only `enforce` does. Proven by removing the plugin
from the config entirely: the same build then fails with `Namespace tags are not
supported`, which is what a late-running plugin would also see.

**`transformIndexHtml` with `order: 'post'`.** Vite processes `index.html` *before*
transforming modules, so a `'pre'` hook injects an empty sprite. Measured: sprite roots in
`index.html` went 0 → 1 when the order was changed to `'post'`.

## Sprite format

- Root carries `xmlns="http://www.w3.org/2000/svg"` — **mandatory**. A standalone `.svg`
  without it parses in no namespace; `<use href="sprite.svg#id">` then renders nothing
  while the request returns 200. Verified by pixel count: 0 red pixels before, 2638 after.
- `cleanupIds` then `prefixIds({ prefix: key })` — the first collapses ids, the second
  makes them unique per icon. Without the pair, `<linearGradient id="a">` in two icons
  collides and one icon takes the other's color.
- `fill`/`stroke` are stripped **per icon kind**, not blindly. A blanket
  `removeAttrs: '(fill|stroke)'` breaks stroke icons (measured: +90% painted area, the
  icon becomes a black blob).
- Attribute names differ per framework: `className` for React/Preact/Solid, `class` for
  Vue/Svelte/HTML. This is the most common copy-paste mistake and the scanner normalises
  it before rendering.

## SVGO 4 visitor API traps

Two behaviours cost real debugging time:

1. **Returning `null` from a visitor does not delete the node.** Removals must splice the
   parent's `children` array.
2. **Splicing during `enter` corrupts traversal** — the next sibling is skipped, so
   `<script>` removal silently left an `onclick` behind. All removals are collected
   during `enter` and applied in `root.exit`.

## Performance

Measured on Vite 8 + React 19, 3-path Lucide icons:

| | |
|---|---|
| Sprite bytes per icon after SVGO | ≈ 160 B |
| 50 icons | 7.8 KB raw · ~2.8 KB gzip |
| 200 icons | 31.2 KB raw · ~11 KB gzip |
| JS for icons | **0 B** |

**Build cost:**

| Operation | Time |
|---|---|
| prefilter, 1 file | 0.04 µs |
| parse, 1 file of 17 KB | 0.65 ms |
| optimize, 1 icon | 0.25 ms |

300 files → 194 ms if everything is parsed; ~30 ms with the prefilter.

**No disk cache.** Icons are re-optimised on every build. At 0.25 ms/icon that is 50 ms
for 200 icons — less than the I/O and invalidation risk a cache would add, and a stale
icon is worse than a slow build. The same reasoning rejected a worker pool for SVGO: at
0.25 ms/icon, thread hand-off costs more than the work. If you have a set large enough for
this to matter, the numbers above say the parse step is what to look at first, not the
optimiser.

**`inlineMaxBytes`:** the 48 KB default ≈ 300 icons. Beyond that the sprite is emitted as
a file plus `<link rel="preload">` — trading one request for a lighter HTML document.

## Bundler fallbacks

- **Rollup has no HTML pipeline** — no `transformIndexHtml` to inject into. Rather than
  ship a green build whose icons all render blank, the plugin detects that it is not
  running under Vite (no `configResolved`) and switches `inject` from `'auto'` to
  `'component'` with a warning, writing `sprite.svg` at build end for
  `<SmartAssetSprite />` to read.
- **Rolldown forbids adding keys to the bundle** in `generateBundle` ("This plugin
  assigns to bundle variable … ignored"), so the sprite is emitted with
  `this.emitFile({ fileName, source })` from the HTML hook instead.
- **Minifiers rewrite `href="…"` to backticks** (`` href:`…` ``), so the chunk-rewrite
  regex must match `["'\`]`, not just a double quote.

## Verification method

A build that succeeds proves almost nothing here. The check used throughout is:

1. build, 2. serve `dist/`, 3. screenshot in headless Chrome, 4. count pixels of the
expected color with Pillow, 5. compare against the count for a hand-written inline SVG.

That is the only layer that catches a sprite which is present, valid XML, served with
HTTP 200, and renders blank. Numbers like "1 red icon → 2638 px, 0 black" in
[`FAILURE_MODES.md`](./FAILURE_MODES.md) come from it.
