import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveOptions } from '../dist/options.js';
import { pickScanner } from '../dist/scan/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const opts = (extra = {}) => resolveOptions({ collections: { lucide: 'x' }, ...extra }, root);

const scanVue = (code, extra) => {
  const o = opts({ frameworks: ['vue'], ...extra });
  return pickScanner('/a/App.vue', o).scan(code, '/a/App.vue', o);
};
const scanSvelte = (code, extra) => {
  const o = opts({ frameworks: ['svelte'], ...extra });
  return pickScanner('/a/App.svelte', o).scan(code, '/a/App.svelte', o);
};

// ── Vue SFC ────────────────────────────────────────────────────────────────
// The critical property is that offsets are ABSOLUTE into the whole .vue file,
// not relative to the <template> block. A relative offset silently corrupts the
// file instead of failing.

const VUE = `<script setup lang="ts">
const n = 1;
</script>

<template>
  <div class="row">
    <icon-lucide-home class="big" />
  </div>
</template>
`;

test('vue: finds a tag inside <template>', () => {
  const { icons } = scanVue(VUE);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].key, 'lucide-home');
  assert.equal(icons[0].attrs.class, 'big');
});

test('vue: offsets are absolute into the .vue file', () => {
  const { icons } = scanVue(VUE);
  const raw = VUE.slice(icons[0].start, icons[0].end);
  assert.equal(raw, '<icon-lucide-home class="big" />');
  assert.ok(icons[0].start > VUE.indexOf('<template>'), 'offset must be past the template tag');
});

test('vue: colon alias works', () => {
  const { icons } = scanVue('<template><icon:lucide-star /></template>');
  assert.equal(icons[0].key, 'lucide-star');
});

test('vue: a tag inside <script> is not rewritten', () => {
  const code = `<script>const s = '<icon-lucide-home />';</script>\n<template><div /></template>`;
  assert.equal(scanVue(code).icons.length, 0);
});

test('vue: smart: image src is found', () => {
  const code = '<template><img src="smart:./a.png" /></template>';
  const { images } = scanVue(code);
  assert.equal(images.length, 1);
  assert.equal(images[0].specifier, './a.png');
  assert.equal(code.slice(images[0].start, images[0].end), '"smart:./a.png"');
});

// ── Svelte ─────────────────────────────────────────────────────────────────
// Svelte 5 puts elements in `ast.fragment.nodes` and names them
// `RegularElement`. Missing either makes the scanner return zero hits while the
// build stays green — the worst possible failure.

const SVELTE = `<script lang="ts">
  let n = $state(0);
</script>

<div class="row">
  <icon-lucide-home class="big red" title="Home"></icon-lucide-home>
  <icon-lucide-star class="big" />
</div>
`;

test('svelte: finds both paired and self-closing tags', () => {
  const { icons } = scanSvelte(SVELTE);
  assert.equal(icons.length, 2, 'Svelte 5 AST not walked — check RegularElement/fragment.nodes');
  assert.deepEqual(icons.map((i) => i.key), ['lucide-home', 'lucide-star']);
});

test('svelte: the range covers the whole element, closing tag included', () => {
  const { icons } = scanSvelte(SVELTE);
  const raw = SVELTE.slice(icons[0].start, icons[0].end);
  assert.equal(raw, '<icon-lucide-home class="big red" title="Home"></icon-lucide-home>');
});

test('svelte: attributes are read', () => {
  const { icons } = scanSvelte(SVELTE);
  assert.equal(icons[0].attrs.class, 'big red');
  assert.equal(icons[0].attrs.title, 'Home');
});

/**
 * Regression: Svelte's attribute Text node spans only the value BETWEEN the
 * quotes, unlike JSX/HTML where the range includes them. Emitting quotes on the
 * replacement produced src=""data:…"" and a hard compile error
 * ("Expected token >"), which only shows up in a real Svelte build.
 */
test('svelte: image value range excludes the quotes, so quote must be empty', () => {
  const code = '<div><img src="smart:./a.png" alt="" /></div>';
  const { images } = scanSvelte(code);
  assert.equal(images.length, 1);
  assert.equal(images[0].quote, '', 'Svelte range already sits inside the quotes');
  // Reconstructing the replacement must not double the quotes.
  const replaced = code.slice(0, images[0].start) + 'URL' + code.slice(images[0].end);
  assert.equal(replaced, '<div><img src="URL" alt="" /></div>');
});

test('svelte: a tag inside <script> is not rewritten', () => {
  const code = `<script>const s = '<icon-lucide-home />';</script>\n<div />`;
  assert.equal(scanSvelte(code).icons.length, 0);
});
