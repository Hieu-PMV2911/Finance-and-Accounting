import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSmartAssetPlugin } from '../dist/plugin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/a/App.tsx';

/** Minimal Rollup/Vite plugin context. */
function fakeCtx({ onError } = {}) {
  return {
    resolve: async (source) => ({ id: join(root, source) }),
    addWatchFile() {},
    emitFile: () => 'ref1',
    getFileName: () => 'assets/smart-sprite.svg',
    warn(msg) {
      this.warnings = this.warnings ?? [];
      this.warnings.push(msg);
    },
    error(msg) {
      if (onError) return onError(msg);
      throw new Error(msg);
    },
    warnings: [],
  };
}

/** Drive the plugin through a realistic build: resolve → start → transform. */
async function runTransform(options, code, id = APP) {
  const plugin = createSmartAssetPlugin({ collections: { lucide: '@iconify-json/lucide' }, dts: false, ...options });
  plugin.configResolved({ root, command: 'build' });
  plugin.buildStart();
  const ctx = fakeCtx();
  const out = await plugin.transform.call(ctx, code, id);
  return { out, ctx, plugin };
}

test('transform rewrites a tag into an svg + use reference', async () => {
  const { out } = await runTransform({}, 'const a = <icon-lucide-home className="x" />;');
  assert.ok(out, 'transform must return a result');
  assert.match(out.code, /<svg /);
  assert.match(out.code, /className="x"/, 'React must get className');
  assert.match(out.code, /<use href="#smart-icon-lucide-home" \/>/);
  assert.doesNotMatch(out.code, /<icon-lucide-home/, 'the original tag must be gone');
});

test('transform returns null for a file without icon tags', async () => {
  const { out } = await runTransform({}, 'const a = 1;');
  assert.equal(out, null);
});

test('transform produces a sourcemap', async () => {
  const { out } = await runTransform({}, 'const a = <icon-lucide-home />;');
  assert.ok(out.map, 'a sourcemap must be returned');
  assert.ok(out.map.mappings.length > 0);
});

test('unknown icon throws by default', async () => {
  await assert.rejects(
    () => runTransform({}, 'const a = <icon-lucide-nope />;'),
    /unknown icon "lucide-nope"/,
  );
});

test('unknown icon warns when configured to warn', async () => {
  const { out, ctx } = await runTransform({ onUnknownIcon: 'warn' }, 'const a = <icon-lucide-nope />;');
  assert.equal(out, null, 'nothing was rewritten');
  assert.equal(ctx.warnings.length, 1);
  assert.match(ctx.warnings[0], /unknown icon "lucide-nope"/);
});

test('unknown icon is left untouched when configured to passthrough', async () => {
  const { out, ctx } = await runTransform({ onUnknownIcon: 'passthrough' }, 'const a = <icon-lucide-nope />;');
  assert.equal(out, null);
  assert.equal(ctx.warnings.length, 0, 'passthrough must be silent');
});

/** `generateBundle` leftover assertion — the last safety net. */
function runGenerateBundle(options, chunkCode) {
  const plugin = createSmartAssetPlugin({ collections: { lucide: '@iconify-json/lucide' }, dts: false, ...options });
  plugin.configResolved({ root, command: 'build' });
  plugin.buildStart();
  const ctx = fakeCtx();
  const bundle = { 'assets/index.js': { type: 'chunk', code: chunkCode } };
  plugin.generateBundle.call(ctx, {}, bundle);
  return { ctx, bundle };
}

test('generateBundle throws when a raw tag reached the output', () => {
  assert.throws(
    () => runGenerateBundle({}, 'var a = jsx("icon-lucide-home", {});'),
    /unprocessed icon tag/,
  );
});

test('generateBundle tolerates a processed sprite reference', () => {
  // Must not match `#smart-icon-home` — that is the correct output.
  assert.doesNotThrow(() => runGenerateBundle({}, 'var a = jsx("use", { href: "#smart-icon-home" });'));
});

test('generateBundle tolerates a backtick-quoted sprite reference', () => {
  assert.doesNotThrow(() => runGenerateBundle({}, 'var a = jsx(`use`, { href: `#smart-icon-home` });'));
});

test('assertNoLeftover:false disables the assertion', () => {
  assert.doesNotThrow(() => runGenerateBundle({ assertNoLeftover: false }, 'var a = jsx("icon-lucide-home", {});'));
});

test('passthrough disables the leftover assertion', () => {
  // Otherwise `onUnknownIcon: "passthrough"` could never build: it keeps the tag
  // on purpose, and the assertion would then reject it.
  assert.doesNotThrow(() =>
    runGenerateBundle({ onUnknownIcon: 'passthrough' }, 'var a = jsx("icon-lucide-nope", {});'),
  );
});

test('a tag inside a string literal is not rewritten and yields no result', async () => {
  // The prefilter matches (`icon-` is present) but the AST finds no JSX element.
  // The leftover probe requires a quoted tag, which a string literal is not, so
  // this is correctly treated as "no icons here" rather than a scanner bug.
  const { out } = await runTransform({}, 'const a = "<icon-lucide-home />";');
  assert.equal(out, null);
});
