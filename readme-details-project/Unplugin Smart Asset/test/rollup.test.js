import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSmartAssetPlugin } from '../dist/plugin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = '/a/App.tsx';

function fakeCtx() {
  return {
    resolve: async (source) => ({ id: join(root, source) }),
    addWatchFile() {},
    emitFile: () => 'ref1',
    getFileName: () => 'assets/smart-sprite.svg',
    warn() {},
    error(msg) {
      throw new Error(msg);
    },
  };
}

/**
 * Rollup does not call `configResolved` and has no `transformIndexHtml`.
 *
 * If the plugin stayed in 'html' injection mode there, the build would stay
 * green while every icon rendered blank — exactly the silent failure this
 * project exists to prevent. It must fall back to 'component' and write
 * sprite.svg for <SmartAssetSprite />.
 */
test('rollup: falls back to component injection and writes sprite.svg', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-rollup-'));
  const prevCwd = process.cwd();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));

  try {
    process.chdir(dir); // opts.root defaults to cwd when configResolved never runs

    const plugin = createSmartAssetPlugin({
      collections: { lucide: '@iconify-json/lucide' },
      // Explicit: the temp dir has no package.json, so detection yields ['html']
      // and the .tsx scanner would be gated off.
      frameworks: ['react'],
      dts: false,
    });

    // Deliberately NO configResolved — that is what a Rollup build looks like.
    plugin.buildStart();
    await plugin.transform.call(fakeCtx(), 'const a = <icon-lucide-home />;', APP);
    plugin.buildEnd();

    const sprite = join(dir, 'sprite.svg');
    assert.ok(existsSync(sprite), 'sprite.svg must be written for <SmartAssetSprite />');

    const html = readFileSync(sprite, 'utf8');
    assert.match(html, /<symbol id="smart-icon-lucide-home"/);
    assert.match(html, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    assert.equal(warnings.filter((w) => /Rollup detected/.test(w)).length, 1);
  } finally {
    console.warn = origWarn;
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('vite: keeps html injection when configResolved ran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-vite-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(dir);
    const plugin = createSmartAssetPlugin({
      collections: { lucide: '@iconify-json/lucide' },
      dts: false,
    });
    plugin.configResolved({ root: dir, command: 'build' });
    plugin.buildStart();
    plugin.buildEnd();

    // Vite injects through transformIndexHtml, so no sprite.svg is written.
    assert.equal(existsSync(join(dir, 'sprite.svg')), false);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
