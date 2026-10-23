# FAILURE_MODES.md

Failure modes of `unplugin-smart-asset`, each with the evidence that established it.

> **Note on provenance.** An earlier, longer draft of this file (F1–F32) was lost from
> this directory before it was committed to git. This version is rebuilt from evidence
> gathered while implementing and testing the plugin. Every entry below was reproduced
> by running a command; entries marked *(earlier draft, not re-verified here)* are
> carried over as claims and should be re-tested before being relied on.

The organising idea: **this plugin's dominant failure mode is silence.** Four of six
supported frameworks compile an unknown tag without a word. A broken sprite produces a
green build, a 200 response, and a blank area on screen. So most of the engineering
below is about converting silence into a loud error.

---

## A. Scanner / source rewriting

### F1. `<icon:home />` throws in React before the plugin ever runs

**Symptom**

```
Namespace tags are not supported by default. React's JSX doesn't support namespace tags.
```

**Evidence** — reproduced in a real Vite 8 build with the plugin removed from the config:

```
[builtin:vite-transform] Namespace tags are not supported by default.
  9 │       <icon:lucide-star className="big" />
```

**Cause** — `<icon:home/>` parses to a `JSXNamespacedName`. Babel's JSX transform rejects
it unless `throwIfNamespace: false`.

**Fix** — use the dash form `<icon-home />`, which is a plain `JSXIdentifier` and always
works. `:` remains available as an opt-in alias (`colonAlias: true`) but is strictly
weaker. **Never make `:` the documented primary syntax.**

---

### F2. Paired tag leaves an orphan closing tag

**Symptom** — `Expected corresponding JSX closing tag for <div>`.

**Cause** — rewriting only the opening element leaves `</icon-home>` behind.

**Fix** — the scanner returns the closing element's range too, and `transform` overwrites
both. Children on an icon tag are rejected outright, because the replacement `<svg>` is
self-contained and silently dropping children would lose content:

```
[smart-asset] <icon-home> cannot have children (src/App.tsx:5).
```

**Covered by** — `test/scan.test.js` › "paired tag reports the closing range",
"children on an icon tag throw a readable error".

---

### F3. `icon-foo.bar` crashes the scanner

**Symptom** — `TypeError: Cannot read properties of undefined (reading 'name')`.

**Cause** — `<icon-foo.bar />` is a `JSXMemberExpression`, not an identifier, and has no
`.name` property.

**Fix** — dispatch on `nameNode.type` and return `null` for member expressions.

**Covered by** — `test/scan.test.js` › "member expression does not crash the scanner".

---

### F4. Svelte 5 walker silently finds nothing

**Symptom** — build is green, no icons, no warning.

**Cause** — the root of a Svelte AST is a `Fragment` exposing `.nodes`, while an `Element`
exposes `.fragment.nodes`. A walker that only checks `.fragment.nodes` skips the entire
top level.

**Fix** — visit all three shapes (`node.nodes`, `node.fragment.nodes`, `node.children`)
and treat `hit === 0` as an error, not as "no icons here".

**Design consequence** — returning `null` from `transform` cannot distinguish "file has no
icons" from "scanner is broken". The plugin therefore keeps a prefilter (`includes()`) and
throws when the prefilter matched but the scanner found nothing:

```
[smart-asset] src/App.svelte: an icon tag is present but the scanner matched nothing.
This is a plugin bug — please report it with this file.
```

---

## B. Sprite and rendering

### F5. `transformIndexHtml` with `order: 'pre'` injects an empty sprite

**Symptom** — `dist/index.html` contains `<script>` and no `<svg id="__SMART_ASSET_SPRITE__">`.
Every `<use href="#smart-icon-…">` points at a symbol that was never shipped. Nothing is
visible. The build is green.

**Evidence** — real Vite 8 build, `order: 'pre'`:

```
dist/index.html   0.41 kB
=== sprite symbol ids ===
none
=== use href count ===
   1 smart-icon-lucide-home
```

Switching the same handler to `order: 'post'`:

```
dist/index.html   1.96 kB
=== symbols ===
symbol id="smart-icon-lucide-home"
symbol id="smart-icon-lucide-settings"
symbol id="smart-icon-lucide-star"
```

**Cause** — Vite processes `index.html` **before** it transforms any module. A `pre`
handler therefore sees an empty registry.

**Fix** — `order: 'post'`. Verified that the registry is complete at that point, and that
`this.emitFile` / `this.getFileName` are available there.

---

### F6. An external sprite file needs `xmlns`, or `<use>` resolves to nothing

**Symptom** — sprite file is emitted, served with HTTP 200, `<use href="/assets/sprite-abc.svg#id">`
is correct in the DOM — and the page is blank.

**Evidence** — `sprite.mode: 'file'`, headless Chrome screenshot of the built page:

```
home  red=    0 black=    0
star  red=    0 black=    0
gear  red=    0 black=    0
```

The sprite's first bytes:

```
<svg id="__SMART_ASSET_SPRITE__" aria-hidden="true" ...
```

After adding `xmlns="http://www.w3.org/2000/svg"`:

```
home  red= 2638 black=    0
star  red=    0 black= 2055
gear  red=    0 black= 2055
```

**Cause** — inline SVG in HTML is namespaced by the HTML parser. A standalone `.svg` file
is parsed as XML: with no `xmlns`, the `<symbol>` elements live in no namespace and the
`<use>` reference matches nothing. There is no console error and no failed request.

**Fix** — always emit `xmlns` on the sprite root. Harmless when inlined, mandatory as a file.

**Covered by** — `test/core.test.js` › "sprite declares xmlns so it also works as a standalone file".

---

### F7. Minified chunks use backticks, so `href="` never matches

**Symptom** — the file-mode rewrite of `<use>` hrefs does nothing in production builds
while working in dev.

**Evidence** — actual chunk content after Rolldown minification:

```
(0,f.jsx)(`use`,{href:`#smart-icon-lucide-home`})
```

**Cause** — the minifier rewrites double-quoted string literals to template literals, so
a search for the literal `href="` finds zero occurrences.

**Fix** — match the opening quote rather than the attribute: `/(["'`])#smart-icon-/g` and
replace with `$1<url>#smart-icon-`.

**Note** — the leftover assertion deliberately does **not** match `#smart-icon-…`; it
matches `(["'`])icon[-:][a-z0-9-]+["'`]`, which a fragment reference cannot satisfy.

---

### F8. Blind `removeAttrs: '(fill|stroke)'` breaks both icon kinds

**Symptom** — every icon renders as a solid black blob, or every outline icon is filled in.

**Cause** — stroke icons (`fill="none" stroke="currentColor"`) and fill icons
(`fill="currentColor"`) need opposite treatment. Stripping both attributes leaves paths
that default to `fill: black`.

**Fix** — `classify()` first, then apply a per-kind strategy, and move the surviving paint
attributes onto the `<symbol>` so `currentColor` from the host `<svg>` still wins.

**Verified visually** — a 96 px red stroke icon renders `(255, 0, 0)` with **0** black
pixels, which is only possible if `currentColor` crossed the `<use>` shadow boundary and
the path carried no colour of its own.

**Covered by** — `test/core.test.js` › "stroke icon keeps its stroke attributes on the
symbol, not the paths", "fill icon does not inherit stroke attributes".

---

### F9. Duplicate `id` inside two icons makes one borrow the other's gradient

**Symptom** — an icon declared blue renders red. No warning.

**Cause** — two icons both define `<linearGradient id="a">`; ids are document-global, so
the second icon's `url(#a)` resolves to the first icon's gradient.

**Fix** — `cleanupIds` (shorten) **then** `prefixIds({ prefix: key })` (make unique). The
order matters: prefixing first produces long, unshortened ids.

**Covered by** — `test/core.test.js` › "internal ids are prefixed so two icons cannot collide",
which also asserts the `url(#…)` reference was rewritten to match.

---

### F10. SVGO 4 does not delete a node when a visitor returns `null`

**Symptom** — `<script>`, `<foreignObject>` and event handlers survive sanitisation and end
up in the sprite.

**Evidence** — direct SVGO call:

```
return null  -> <svg …><script>alert(1)</script><path onclick="x()" …/></svg>
splice       -> <svg …><path onclick="x()" …/></svg>
```

**Cause** — the `return null` convention from earlier SVGO versions no longer removes the
node in v4.

**Fix** — splice the node out of its parent.

---

### F11. Splicing during `enter` corrupts the traversal

**Symptom** — after fixing F10, `<script>` is gone but `onclick` on the *next sibling*
survives.

**Evidence** — with removal performed inside `element.enter`:

```
body = "<path d=\"M0 0h1v1H0z\" onclick=\"steal()\"/><image/>"
```

**Cause** — removing an element mid-walk shifts the walker's index, so the following
sibling is skipped and never visited.

**Fix** — collect nodes during the walk and remove them once, in `root.exit`. After the
fix:

```
body = "<path d=\"M0 0h1v1H0z\"/><image/>"
```

**Covered by** — `test/core.test.js` › "scripts, event handlers and outbound hrefs are stripped".

---

## C. Icon collections

### F12. A declared collection resolves to zero icons because of the CJS wrapper shape

**Symptom** — `collections: { lucide: '@iconify-json/lucide' }` is declared, but every icon
is reported unknown:

```
[smart-asset] unknown icon "lucide-home" (src/App.tsx:5).
  Declared collections: lucide, local.
```

**Evidence** — `@iconify-json/*` ships two shapes:

| entry | shape |
| --- | --- |
| `index.mjs` | `{ prefix, icons: { name: Icon }, aliases, width, height }` |
| `index.js`  | `{ icons: <the document above>, info, metadata, chars }` |

`require()` picks the CJS entry, so `mod.default ?? mod` yields the **wrapper**. Its
`icons` property is the document, not the name→icon map — `Object.keys(set.icons).length`
was `6`, and the real map is one level deeper (1,978 icons).

**Fix** — normalise by walking down until an object has a string `prefix` and an `icons`
map. Also record *why* a load failed and surface it in the unknown-icon message, because
"collection declared but empty" is otherwise indistinguishable from "icon name misspelled".

**Covered by** — `test/resolver.test.js` › "resolves through the CJS wrapper that
`@iconify-json` actually exports", "a declared collection that cannot load reports why".

---

### F13. "Did you mean" can never suggest an alias

**Symptom** — `lucide-hom` suggests `ham`, `hop`, `atom` — never `home`.

**Cause** — Lucide renamed `home` to `house` and kept `home` as an **alias**. `resolve()`
accepts aliases, but the suggestion list was built from `Object.keys(set.icons)` only, so
the one name that would have worked was excluded.

**Fix** — include `set.aliases` in the candidate list, and break distance ties by prefix
match before length, so `home` outranks `ham` for the input `hom`.

**Covered by** — `test/resolver.test.js` › "did-you-mean prefers prefix matches over raw
edit distance".

---

## D. Build system

### F14. `enforce: 'pre'` is mandatory; array position is irrelevant

**Symptom** — build is green, zero icons, no warning.

**Cause** — without `enforce: 'pre'`, `vite:esbuild` transforms JSX before this plugin
runs, so there are no tags left to find.

**Evidence** *(earlier draft, not re-verified here)* — four configurations were built;
only the two that set `enforce: 'pre'` produced icons, and their output was identical
regardless of position in the `plugins` array.

---

### F15. Rolldown forbids adding entries to the bundle in `generateBundle`

**Symptom**

```
This plugin assigns to bundle variable. This is discouraged by Rollup and is not
supported by Rolldown. This will be ignored.
```

**Cause** — the first implementation of `sprite.mode: 'file'` tried to add the sprite asset
by writing `bundle[fileName] = { type: 'asset', … }`.

**Fix** — emit the asset with `this.emitFile({ type: 'asset', fileName, source })` from
`transformIndexHtml` (post), where the plugin context is available and `getFileName()`
returns the final path. Mutating `item.code` of an existing chunk **is** allowed and is
what the `<use>` rewrite relies on.

---

### F16. SSR builds never run `transformIndexHtml`

**Symptom** — server-rendered HTML references `#smart-icon-…` symbols that were never
emitted.

**Cause** — there is no HTML document in an SSR or library build.

**Fix** — `inject: 'auto'` switches to `'component'` when `build.ssr` or `build.lib` is
set, warns once, and writes `sprite.svg` at build end for `<SmartAssetSprite />` to read.

---

### F17. Cold dev server: the first page load has an empty sprite

**Symptom** — in `vite dev`, the first load shows blank icons; they appear after a
reload that the user did not ask for. Production is fine.

**Evidence** — cold server, `node_modules/.vite` removed, first two requests to `/`:

```
=== FIRST request to / on cold server ===
0
=== SECOND request ===
1
```

**Cause** — same ordering issue as F5, but in dev there is no bundle to inspect: Vite
serves `index.html` before it transforms the entry module, so the registry is empty when
`transformIndexHtml` runs. The `full-reload` sent after the first transform repopulates it.

**Status** — **known limitation, documented in the README**, not fixed. A deterministic fix
means moving sprite injection into the module graph (a virtual module imported by every
transformed file that contains icons), so the sprite is evaluated before the app renders.
That is a design change, not a patch, and is left for a later milestone.

---

### F18. `assertNoLeftover` and `onUnknownIcon: 'passthrough'` were dead options

**Symptom** — two documented options had no effect. `assertNoLeftover: false` still failed
the build, and `onUnknownIcon: 'passthrough'` **always** failed it:

```
[smart-asset] assets/index.js: unprocessed icon tag `icon-lucide-nope` reached the output.
```

That is a direct contradiction: `passthrough` means "leave the tag alone on purpose", and
the leftover assertion then rejects exactly that.

**Cause** — `assertNoLeftover` was resolved in `options.ts` but never read by the plugin,
and `handleUnknown` had no `passthrough` branch (it warned for both `warn` and
`passthrough`).

**Fix** — `passthrough` returns before building any message; the leftover assertion is
skipped when `assertNoLeftover === false` **or** `onUnknownIcon === 'passthrough'`.

**Covered by** — `test/plugin.test.js` › "assertNoLeftover:false disables the assertion",
"passthrough disables the leftover assertion", "unknown icon is left untouched when
configured to passthrough".

---

### F19. `transform` returned a result for files it did not change

**Symptom** — none visible, but every module containing a tag the plugin could not resolve
was still reported as modified, invalidating downstream caches and triggering pointless
HMR work.

**Cause** — the handler always returned `{ code: s.toString(), map }`, even when no
overwrite had happened.

**Fix** — return `null` when nothing changed. Note the consequence: a file whose only tag
is an unknown icon in `warn` mode now correctly yields `null`.

**Covered by** — `test/plugin.test.js` › "unknown icon warns when configured to warn".

---

### F20. Svelte attribute ranges exclude the quotes, so image URLs get double-quoted

**Symptom** — the Svelte build dies in the compiler, not in this plugin:

```
[plugin vite-plugin-svelte:compile] src/App.svelte:10:33
Expected token >
 10 |  <img id="pic" src=""data:image/png;base64,iVBOR…"" alt="" />
```

**Cause** — `ImageRef.quote` exists because JSX and HTML scanners return a range that
**includes** the surrounding quotes, so the replacement has to re-emit them. Svelte's
attribute `Text` node spans only the value **between** the quotes. Re-emitting `"` produced
`src=""…""`.

**Fix** — Svelte emits `quote: ''`.

**Why it took a real build to find** — the scanner unit tests only checked `specifier` and
`attr`; the range semantics are invisible until something parses the result. The fix is now
covered by a test that reconstructs the replacement string and asserts the quotes are not
doubled.

**Covered by** — `test/frameworks.test.js` › "svelte: image value range excludes the quotes,
so quote must be empty".

---

### F21. `@sveltejs/vite-plugin-svelte` v6 does not accept Vite 8

**Symptom** — `npm install` fails before any build:

```
Could not resolve dependency:
peer vite@"^6.3.0 || ^7.0.0" from @sveltejs/vite-plugin-svelte@6.2.4
```

**Cause** — the v6 line pins Vite 6/7. Vite 8 support starts at `@sveltejs/vite-plugin-svelte@7`
(peer `vite@^8.0.0`, `svelte@^5.46.4`).

**Fix** — use v7 with Svelte ≥ 5.46.4 on Vite 8. Worth noting in support answers: a user on
Vite 8 who cannot upgrade the Svelte plugin cannot use the tag syntax at all, independent of
this plugin.

---

### F22. Under Rollup the sprite is never injected — build green, icons blank

**Symptom** — `unplugin-smart-asset/rollup` builds successfully. The JS contains
`<use href="#smart-icon-home">`, no `<symbol>` exists anywhere, and every icon renders blank.
No warning.

**Cause** — sprite injection was implemented only in `transformIndexHtml`, which is a **Vite
hook**. Rollup never calls it, and also never calls `configResolved`. So `inject: 'auto'`
stayed in `'html'` mode forever.

**Fix** — `configResolved` sets `isVite = true`. If `buildStart` runs without it, we are on
Rollup: `inject` is switched to `'component'` with a one-time warning, and `sprite.svg` is
written at `buildEnd` for `<SmartAssetSprite />`.

**Verified at hook level, not with a full Rollup build** — a real Rollup build additionally
needs a downstream JSX transform (the rewritten output is still JSX), which every Rollup +
React setup already has, so the test would mostly exercise Rollup itself. The behaviour that
was actually broken — the mode decision — is covered directly:

`test/rollup.test.js` › "rollup: falls back to component injection and writes sprite.svg",
"vite: keeps html injection when configResolved ran".

---

### F23. Framework detection gates the scanner, so a missing package.json means zero icons

**Symptom** — driving the plugin in a directory without `package.json` yields no icons and
no error; `transform` returns `null`.

**Cause** — `detectFrameworks` falls back to `['html']` when it cannot read a
`package.json`. `pickScanner` gates `.tsx/.jsx` on react/preact/solid being declared, so the
JSX scanner is disabled entirely. This is correct behaviour, but it fails silently.

**Fix / workaround** — pass `frameworks` explicitly when the project root has no
`package.json` (monorepo sub-packages, custom build scripts, tests). Encountered while
writing `test/rollup.test.js`.

---

## Symptom → cause lookup

| What you see | Go to |
| --- | --- |
| Build green, no icons, `<use>` present in DOM | F5, F14 |
| Build green, `<use>` absent entirely | F1, F4, F14 |
| Icons render but are solid black / filled in | F8 |
| Wrong colour on one icon that uses a gradient | F9 |
| External sprite 200 but nothing paints | F6 |
| File mode works in dev, not in production | F7 |
| `unknown icon` for every icon in a declared collection | F12 |
| Suggestion list never contains the right name | F13 |
| `Namespace tags are not supported` | F1 |
| `cannot be named` in `tsc` declaration emit | internal types not exported — see `Ctx`/`ViteServer` in `src/plugin.ts` |
| Icons blank on the first dev load only | F17 |
| `assertNoLeftover` / `passthrough` seem ignored | F18 |
| Svelte: `Expected token >` after an image rewrite | F20 |
| `npm install` fails on `peer vite` with Svelte | F21 |
| Rollup build green, icons blank | F22 |
| Icons silently missing in a dir without `package.json` | F23 |

## Required test layers

1. **Unit** — scanners, resolver, optimiser, sprite, renderer, d.ts, and the plugin hooks
   driven directly with a fake context (`test/plugin.test.js`). 50 tests, runs in CI.
2. **Build assertion** — sprite present in HTML, no quoted leftover tag in any chunk,
   `<use href>` rewritten when the sprite is a file.
3. **Pixel** — the only layer that catches F6, F8 and F9. Serve `dist/`, screenshot with
   headless Chrome (`--no-sandbox --disable-gpu --in-process-gpu`), assert the dominant
   colour of a probe region. Numbers from this session, 96 px icon:

   | case | red px | black px |
   | --- | --- | --- |
   | inline sprite, React | 2638 | 0 |
   | external sprite file, React | 2638 | 0 |
   | inline sprite, Vue SFC | 2638 | 0 |
   | inline sprite, Svelte 5 | 2638 | 0 |
   | sprite file without `xmlns` | 0 | 0 |

   The three frameworks producing identical counts is the useful part: it means the
   scanner differences do not leak into the rendered output.
