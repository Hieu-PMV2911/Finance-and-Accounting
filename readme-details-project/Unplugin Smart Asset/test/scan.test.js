import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveOptions } from '../dist/options.js';
import { pickScanner } from '../dist/scan/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const opts = (extra = {}) => resolveOptions({ collections: { lucide: 'x' }, ...extra }, root);

const jsx = (code, extra) => pickScanner('/a/App.tsx', opts(extra)).scan(code, '/a/App.tsx', opts(extra));
const html = (code, extra) => pickScanner('/a/index.html', opts(extra)).scan(code, '/a/index.html', opts(extra));

test('jsx: dash syntax is picked up', () => {
  const { icons } = jsx('const a = <icon-lucide-home className="x" />;');
  assert.equal(icons.length, 1);
  assert.equal(icons[0].key, 'lucide-home');
  assert.equal(icons[0].attrs.className, 'x');
});

test('jsx: colon alias is picked up', () => {
  const { icons } = jsx('const a = <icon:lucide-star />;');
  assert.equal(icons[0].key, 'lucide-star');
});

test('jsx: colon alias can be disabled', () => {
  const { icons } = jsx('const a = <icon:lucide-star />;', { colonAlias: false });
  assert.equal(icons.length, 0);
});

test('jsx: member expression does not crash the scanner', () => {
  const { icons } = jsx('const a = <icon-lucide.foo />;');
  assert.equal(icons.length, 0);
});

test('jsx: plain tags are ignored', () => {
  const { icons } = jsx('const a = <div className="icon-lucide-home" />;');
  assert.equal(icons.length, 0);
});

test('jsx: a tag inside a string literal is not rewritten', () => {
  const { icons } = jsx('const s = "<icon-lucide-home />";');
  assert.equal(icons.length, 0);
});

test('jsx: paired tag reports the closing range', () => {
  const { icons } = jsx('const a = <icon-lucide-home></icon-lucide-home>;');
  assert.equal(icons.length, 1);
  assert.ok(Array.isArray(icons[0].close));
  const code = 'const a = <icon-lucide-home></icon-lucide-home>;';
  assert.equal(code.slice(...icons[0].close), '</icon-lucide-home>');
});

test('jsx: children on an icon tag throw a readable error', () => {
  assert.throws(
    () => jsx('const a = <icon-lucide-home><b /></icon-lucide-home>;'),
    /cannot have children/,
  );
});

test('jsx: smart: image src is found with absolute value offsets', () => {
  const code = 'const a = <img src="smart:./logo.png" />;';
  const { images } = jsx(code);
  assert.equal(images.length, 1);
  assert.equal(images[0].specifier, './logo.png');
  assert.equal(images[0].attr, 'src');
  assert.equal(code.slice(images[0].start, images[0].end), '"smart:./logo.png"');
});

test('html: tags are found and script bodies are skipped', () => {
  const code = [
    '<body>',
    '  <icon-lucide-home></icon-lucide-home>',
    '  <script>const s = "<icon-lucide-star />";</script>',
    '  <!-- <icon-lucide-cog /> -->',
    '</body>',
  ].join('\n');
  const { icons } = html(code);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].key, 'lucide-home');
});

test('html: attributes keep their order and absolute offsets', () => {
  const code = '<icon-lucide-home class="a" aria-label="Home"></icon-lucide-home>';
  const { icons } = html(code);
  assert.equal(icons[0].attrs.class, 'a');
  assert.equal(icons[0].attrs['aria-label'], 'Home');
  assert.equal(code.slice(icons[0].start, icons[0].end), '<icon-lucide-home class="a" aria-label="Home">');
});

test('scanner is chosen by extension and gated on declared frameworks', () => {
  assert.equal(pickScanner('/a/App.tsx', opts())?.framework, 'react');
  assert.equal(pickScanner('/a/App.jsx', opts())?.framework, 'react');
  assert.equal(pickScanner('/a/index.html', opts())?.framework, 'html');
  assert.equal(pickScanner('/a/App.css', opts()), null);
  assert.equal(pickScanner('/a/App.tsx', opts({ frameworks: ['html'] })), null);
});
