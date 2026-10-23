import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFrameworks, resolveOptions } from '../dist/options.js';

/** `detectFrameworks` only reads `<root>/package.json`. */
function withPkg(deps, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'sa-detect-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: deps }));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detects each framework from dependencies', () => {
  assert.deepEqual(withPkg({ react: '19' }, detectFrameworks), ['react']);
  assert.deepEqual(withPkg({ 'react-dom': '19' }, detectFrameworks), ['react']);
  assert.deepEqual(withPkg({ preact: '10' }, detectFrameworks), ['preact']);
  assert.deepEqual(withPkg({ 'solid-js': '1' }, detectFrameworks), ['solid']);
  assert.deepEqual(withPkg({ vue: '3' }, detectFrameworks), ['vue']);
  assert.deepEqual(withPkg({ svelte: '5' }, detectFrameworks), ['svelte']);
});

test('a project with no framework falls back to html', () => {
  assert.deepEqual(withPkg({ lodash: '4' }, detectFrameworks), ['html']);
});

test('a Preact project must not be detected as React', () => {
  // Detection order decides which `class`/`className` variant is emitted, so a
  // wrong answer here silently drops every icon class.
  const found = withPkg({ preact: '10', 'preact-render-to-string': '6' }, detectFrameworks);
  assert.deepEqual(found, ['preact']);
  assert.ok(!found.includes('react'));
});

test('a missing package.json falls back to html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-empty-'));
  try {
    assert.deepEqual(detectFrameworks(dir), ['html']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a corrupt package.json falls back to html instead of throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-bad-'));
  writeFileSync(join(dir, 'package.json'), '{ not json');
  try {
    assert.deepEqual(detectFrameworks(dir), ['html']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveOptions fills documented defaults', () => {
  const o = resolveOptions({}, process.cwd());
  assert.equal(o.iconPrefix, 'icon');
  assert.equal(o.colonAlias, true);
  assert.equal(o.localCollection, 'local');
  assert.equal(o.onUnknownIcon, 'throw');
  assert.equal(o.maxInlineSize, 4096);
  assert.equal(o.imagePrefix, 'smart:');
  assert.deepEqual(o.imageAttrs, ['src']);
  assert.equal(o.inject, 'auto');
  assert.equal(o.assertNoLeftover, true);
  assert.equal(o.sprite.mode, 'auto');
  assert.equal(o.sprite.dedupe, true);
  assert.equal(o.sprite.preload, true);
  assert.equal(o.sprite.inlineMaxBytes, 48 * 1024);
});

test('an explicit frameworks array overrides detection', () => {
  const o = resolveOptions({ frameworks: ['html'] }, process.cwd());
  assert.deepEqual(o.frameworks, ['html']);
});

test('relative localIconDirs are resolved against root', () => {
  const o = resolveOptions({ localIconDirs: ['src/icons'] }, '/proj');
  assert.deepEqual(o.localIconDirs, ['/proj/src/icons']);
});

test('dts defaults to a path and can be disabled', () => {
  assert.equal(resolveOptions({}, '/p').dts, 'src/smart-asset.d.ts');
  assert.equal(resolveOptions({ dts: false }, '/p').dts, false);
});
