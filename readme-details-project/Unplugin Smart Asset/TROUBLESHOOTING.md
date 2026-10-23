# TROUBLESHOOTING.md

Diagnosis for `unplugin-smart-asset`. Usage lives in [`README.md`](./README.md).

> **The governing fact: most failures here throw nothing.** The build is green, the page
> is blank. So start from the symptom, not from the config.

---

## Table of contents

- [1. Does the build fail?](#1-does-the-build-fail)
- [2. Build is green but icons are blank](#2-build-is-green-but-icons-are-blank)
- [3. One icon is the right color, another isn't](#3-one-icon-is-the-right-color-another-isnt)
- [4. An icon renders as a solid black blob](#4-an-icon-renders-as-a-solid-black-blob)
- [5. `tsc` says the `icon-*` tag doesn't exist](#5-tsc-says-the-icon--tag-doesnt-exist)
- [6. Editing an image doesn't refresh in dev](#6-editing-an-image-doesnt-refresh-in-dev)
- [7. The sprite is too large](#7-the-sprite-is-too-large)
- [Migrating from lucide-react](#migrating-from-lucide-react)

---

## 1. Does the build fail?

| Message | Cause | Fix |
|---|---|---|
| `Namespace tags are not supported` | Using `<icon:name />` in React while the plugin runs after Babel | Use `<icon-name />`, or make sure the plugin keeps `enforce:'pre'` |
| `Expected corresponding JSX closing tag` | A paired tag whose closing element was not rewritten | Upgrade; file a bug |
| `Cannot read properties of undefined` | A tag like `icon-foo.bar` | Rename to `icon-foo-bar` |
| `smart-asset: unprocessed icon tag found` | The transform never ran | See item 2 |

## 2. Build is green but icons are blank

This is the most common case. Work down the list:

```
Build failing? ──yes──► see the table above
     │no
     ▼
Output JS still contains jsx('icon-home')? ──yes──► MISSING enforce:'pre'
     │no
     ▼
<use href> present but no <symbol>? ──yes──► SSR/lib build, needs <SmartAssetSprite />
     │no
     ▼
Both present and still blank? ──► duplicate ids / display:none / Shadow DOM
```

**Quick checks:**

```bash
grep -c '__SMART_ASSET_SPRITE__' dist/index.html  # 0 → sprite never injected
grep -c 'use href' dist/assets/*.js              # 0 → transform never ran
```

**Cause #1: missing `enforce:'pre'`.** The plugin must run before `vite:esbuild`; otherwise JSX is already gone and the plugin sees plain JS. The factory sets `enforce` itself — don't strip it if you wrap the plugin.

**Cause #2: every icon in a declared collection is "unknown".** The collection is
declared but failed to load. The error names the reason:

```
[smart-asset] unknown icon "lucide-home" (src/App.tsx:5).
  Collection "lucide" failed to load: Cannot find module '@iconify-json/lucide'
```

Install the package in the **app**, not the plugin. `@iconify-json/*` ships two shapes —
an ESM document and a CJS `{ icons, info, metadata, chars }` wrapper — and the plugin
normalises both; if you see this, the module is genuinely absent or does not export an
IconifyJSON document.

**Cause #3: `sprite.mode: 'file'` renders nothing.** The sprite file is requested with
HTTP 200 and the `<use href="/assets/sprite-…svg#id">` is correct, yet the page is blank.
The emitted file is missing `xmlns="http://www.w3.org/2000/svg"` — a standalone `.svg`
without it parses in no namespace, so the symbols cannot be referenced. This is fixed in
the current source; if you patch the sprite yourself, keep the attribute.

Note that `mode: 'file'` always inlines on the dev server (there is no emitted asset to
serve), so a blank page in production only is this cause, not a HMR problem.

**Cause #4: cold dev server, first page load.** The sprite is injected into `index.html`
before any module is transformed, so the very first request has an empty sprite. It
appears after the automatic reload. Production is unaffected. See
[`LIMITATIONS.md`](./LIMITATIONS.md#behaviour-that-surprises-people).

## 3. One icon is the right color, another isn't

Duplicate `id` values inside the sprite (`<linearGradient id="a">` in two icons). The plugin uses SVGO's `prefixIds` to prevent this — if you customize `svgo.plugins`, **do not remove `prefixIds`**.

## 4. An icon renders as a solid black blob

The plugin misclassified a stroke icon as a fill icon. File a bug with the icon name. Do not add `removeAttrs: '(fill|stroke)'` yourself — it breaks both kinds.

## 5. `tsc` says the `icon-*` tag doesn't exist

The `.d.ts` is missing or targeted the wrong framework:

```bash
npx smart-asset prepare
```

On React 19 the augmentation must live in `declare module 'react'` — the global `JSX` namespace was removed.

## 6. Editing an image doesn't refresh in dev

Check that `imageAttrs` contains the attribute you used. If the image lives outside the project root, add the path to `server.fs.allow`.

## 7. The sprite is too large

```bash
npx smart-asset report   # which icons cost the most bytes
```

Or switch to a file:

```ts
sprite: { mode: 'file' }
```

---

## Migrating from lucide-react

**Before:**

```tsx
import { Home, User } from 'lucide-react';

<Home className="w-6 h-6" />
<User className="w-6 h-6" />
```

**After:**

```tsx
<icon-lucide-home className="w-6 h-6" />
<icon-lucide-user className="w-6 h-6" />
```

Delete the imports and drop `lucide-react` from dependencies.

Note: a few Lucide icons share names across sets (`Home` vs `House`). `report` lists any sprite icons that became unused after migration.

---

For the failure modes behind each of these, with the command output that established
them, see [`FAILURE_MODES.md`](./FAILURE_MODES.md).
