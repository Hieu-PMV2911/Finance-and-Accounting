import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveOptions } from '../dist/options.js';
import { classify, optimizeIcon } from '../dist/core/optimize.js';
import { buildSprite, shouldInline } from '../dist/core/sprite.js';
import { renderIcon } from '../dist/core/render.js';
import { generateDts } from '../dist/core/dts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const opts = (extra = {}) => resolveOptions(extra, root);

const STROKE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18"/></svg>`;
const FILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18"/></svg>`;

test('classify separates stroke icons from fill icons', () => {
  assert.equal(classify(STROKE), 'stroke');
  assert.equal(classify(FILL), 'fill');
});

test('stroke icon keeps its stroke attributes on the symbol, not the paths', () => {
  const data = optimizeIcon(STROKE, 'lucide-x', { plugins: ['preset-default'] });
  assert.equal(data.kind, 'stroke');
  assert.match(data.symbolAttrs, /stroke="currentColor"/);
  assert.match(data.symbolAttrs, /fill="none"/);
  assert.match(data.symbolAttrs, /stroke-width="2"/);
  // The path must NOT carry its own stroke, or `currentColor` on the host
  // <svg> would never win.
  assert.doesNotMatch(data.body, /stroke="currentColor"/);
});

test('fill icon does not inherit stroke attributes', () => {
  const data = optimizeIcon(FILL, 'material-x', { plugins: ['preset-default'] });
  assert.equal(data.kind, 'fill');
  assert.match(data.symbolAttrs, /fill="currentColor"/);
  assert.doesNotMatch(data.symbolAttrs, /stroke=/);
});

test('internal ids are prefixed so two icons cannot collide', () => {
  const withGradient = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="a"><stop offset="0"/></linearGradient></defs><path fill="url(#a)" d="M0 0h1v1H0z"/></svg>`;
  const one = optimizeIcon(withGradient, 'lucide-one', { plugins: ['preset-default'] });
  const two = optimizeIcon(withGradient, 'lucide-two', { plugins: ['preset-default'] });
  assert.match(one.body, /id="lucide-one/);
  assert.match(two.body, /id="lucide-two/);
  // The reference must be rewritten to match, or the gradient silently breaks.
  const idOne = one.body.match(/id="([^"]+)"/)[1];
  assert.ok(one.body.includes(`url(#${idOne})`), 'gradient reference not rewritten');
});

test('scripts, event handlers and outbound hrefs are stripped', () => {
  const hostile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path onclick="steal()" d="M0 0h1v1H0z"/><image href="https://evil.example/x.png"/></svg>`;
  const data = optimizeIcon(hostile, 'local-x', { plugins: ['preset-default'] });
  assert.doesNotMatch(data.body, /<script/);
  assert.doesNotMatch(data.body, /onclick/);
  assert.doesNotMatch(data.body, /evil\.example/);
});

test('optimize can be disabled entirely', () => {
  const data = optimizeIcon(STROKE, 'lucide-x', false);
  assert.equal(data.viewBox, '0 0 24 24');
  assert.match(data.body, /<path/);
});

test('sprite declares xmlns so it also works as a standalone file', () => {
  // Without xmlns an external .svg parses in no namespace and every
  // <use href="sprite.svg#id"> silently renders nothing.
  const { html } = buildSprite([['a', optimizeIcon(STROKE, 'a', { plugins: ['preset-default'] })]], opts());
  assert.match(html, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('sprite is hidden with 0x0 + overflow, never display:none', () => {
  const { html } = buildSprite([['a', optimizeIcon(STROKE, 'a', { plugins: ['preset-default'] })]], opts());
  assert.match(html, /overflow:hidden/);
  assert.doesNotMatch(html, /display:none/);
});

test('sprite output is byte-identical regardless of insertion order', () => {
  const a = optimizeIcon(STROKE, 'a', { plugins: ['preset-default'] });
  const b = optimizeIcon(FILL, 'b', { plugins: ['preset-default'] });
  const one = buildSprite([['a', a], ['b', b]], opts()).html;
  const two = buildSprite([['b', b], ['a', a]], opts()).html;
  assert.equal(one, two);
});

test('dedupe collapses identical bodies into one symbol', () => {
  const a = optimizeIcon(STROKE, 'a', { plugins: ['preset-default'] });
  const b = optimizeIcon(STROKE, 'b', { plugins: ['preset-default'] });
  const res = buildSprite([['a', a], ['b', b]], opts());
  assert.equal(res.deduped, 1);
  assert.equal(res.symbols, 2, 'the duplicate id must still exist and point at the original');
  assert.match(res.html, /<symbol id="smart-icon-b"><use href="#smart-icon-a" \/><\/symbol>/);
});

test('dedupe can be turned off', () => {
  const a = optimizeIcon(STROKE, 'a', { plugins: ['preset-default'] });
  const b = optimizeIcon(STROKE, 'b', { plugins: ['preset-default'] });
  const res = buildSprite([['a', a], ['b', b]], opts({ sprite: { dedupe: false } }));
  assert.equal(res.deduped, 0);
});

test('shouldInline respects mode and threshold', () => {
  assert.equal(shouldInline(100, opts({ sprite: { mode: 'inline', inlineMaxBytes: 0 } })), true);
  assert.equal(shouldInline(100, opts({ sprite: { mode: 'file', inlineMaxBytes: 1e9 } })), false);
  assert.equal(shouldInline(100, opts({ sprite: { mode: 'auto', inlineMaxBytes: 200 } })), true);
  assert.equal(shouldInline(300, opts({ sprite: { mode: 'auto', inlineMaxBytes: 200 } })), false);
});

test('react and preact get className, every other framework gets class', () => {
  const attrs = { class: 'w-6' };
  // Getting this backwards is silent: the class simply never applies.
  for (const fw of ['react', 'preact']) {
    assert.match(renderIcon('lucide-x', '0 0 24 24', attrs, fw), /className="w-6"/, fw);
  }
  for (const fw of ['solid', 'vue', 'svelte', 'html']) {
    assert.match(renderIcon('lucide-x', '0 0 24 24', attrs, fw), / class="w-6"/, fw);
    assert.doesNotMatch(renderIcon('lucide-x', '0 0 24 24', attrs, fw), /className/, fw);
  }
});

test('a className written in a non-React source is still emitted as class', () => {
  // Solid/Vue users who copy a React snippet write className; the renderer must
  // normalise it to the attribute their framework understands.
  const out = renderIcon('lucide-x', '0 0 24 24', { className: 'w-6' }, 'solid');
  assert.match(out, / class="w-6"/);
  assert.doesNotMatch(out, /className/);
});

test('unlabelled icons are hidden from screen readers, labelled ones are not', () => {
  const hidden = renderIcon('lucide-x', '0 0 24 24', {}, 'react');
  assert.match(hidden, /aria-hidden="true"/);
  assert.doesNotMatch(hidden, /role="img"/);

  const labelled = renderIcon('lucide-x', '0 0 24 24', { 'aria-label': 'Close' }, 'react');
  assert.match(labelled, /aria-label="Close"/);
  assert.match(labelled, /role="img"/);
  assert.doesNotMatch(labelled, /aria-hidden/);
});

test('title goes inside the host svg, never the symbol', () => {
  const svg = renderIcon('lucide-x', '0 0 24 24', { title: 'Close' }, 'react');
  assert.match(svg, /<title>Close<\/title><use href="#smart-icon-lucide-x" \/>/);
});

test('dts augments the right interface per framework', () => {
  const o = opts();
  const react = generateDts(['lucide-home'], ['react'], o);
  assert.match(react, /declare module 'react'/);
  assert.match(react, /namespace JSX/);
  assert.match(react, /'icon-lucide-home': SVGProps<SVGSVGElement>/);

  const vue = generateDts(['lucide-home'], ['vue'], o);
  assert.match(vue, /declare module 'vue'/);
  assert.match(vue, /GlobalComponents/);

  const svelte = generateDts(['lucide-home'], ['svelte'], o);
  assert.match(svelte, /SvelteHTMLElements/);
});

test('dts stays a literal union unless unknown icons are allowed', () => {
  const strict = generateDts(['lucide-home'], ['react'], opts());
  assert.doesNotMatch(strict, /\[key: `icon-\$\{string\}`\]/);

  const loose = generateDts(['lucide-home'], ['react'], opts({ allowUnknownIcons: true }));
  assert.match(loose, /\[key: `icon-\$\{string\}`\]/);
});

test('dts honours a custom icon prefix', () => {
  const dts = generateDts(['lucide-home'], ['react'], opts({ iconPrefix: 'i' }));
  assert.match(dts, /'i-lucide-home'/);
  assert.doesNotMatch(dts, /'icon-lucide-home'/);
});
