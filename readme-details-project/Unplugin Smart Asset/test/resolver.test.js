import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveOptions } from '../dist/options.js';
import { IconResolver, suggest } from '../dist/core/resolver.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const opts = (extra = {}) =>
  resolveOptions({ collections: { lucide: '@iconify-json/lucide' }, ...extra }, root);

test('longest-prefix wins when two collections share a prefix', () => {
  const r = new IconResolver(
    resolveOptions(
      { collections: { heroicons: 'x', 'heroicons-solid': 'y' }, localCollection: 'local' },
      root,
    ),
  );
  assert.deepEqual(r.split('heroicons-solid-check'), {
    collection: 'heroicons-solid',
    name: 'check',
  });
  assert.deepEqual(r.split('heroicons-check'), { collection: 'heroicons', name: 'check' });
});

test('a bare collection name is not an icon', () => {
  const r = new IconResolver(opts());
  assert.equal(r.split('lucide'), null);
});

test('unknown collection returns null instead of throwing', () => {
  const r = new IconResolver(opts());
  assert.equal(r.split('nope-home'), null);
  assert.equal(r.resolve('nope-home'), null);
});

/**
 * Regression: `@iconify-json/*` ships a CJS wrapper
 * `{ icons: <IconifyJSON>, info, metadata, chars }` whose `icons` property is
 * the document, not the name→icon map. Treating the wrapper as the set made
 * every icon look missing while the build stayed green.
 */
test('resolves through the CJS wrapper that @iconify-json actually exports', () => {
  const r = new IconResolver(opts());
  const icon = r.resolve('lucide-home');
  assert.ok(icon, 'lucide-home must resolve');
  assert.match(icon.svg, /<svg[^>]*viewBox="0 0 24 24"/);
  assert.match(icon.svg, /<path/);
  assert.ok(r.list('lucide').length > 1000, 'the whole set must be visible');
});

test('a declared collection that cannot load reports why', () => {
  const r = new IconResolver(
    resolveOptions({ collections: { ghost: '@iconify-json/definitely-not-installed' } }, root),
  );
  assert.equal(r.resolve('ghost-home'), null);
  assert.match(r.failure('ghost'), /definitely-not-installed/);
});

test('did-you-mean prefers prefix matches over raw edit distance', () => {
  const r = new IconResolver(opts());
  const hints = suggest('hom', r.list('lucide'));
  assert.ok(hints.includes('home'), `expected "home" in ${JSON.stringify(hints)}`);
});

test('local icons are read from disk', () => {
  const r = new IconResolver(opts({ localIconDirs: ['./test/fixtures/icons'] }));
  const icon = r.resolve('local-dot');
  assert.ok(icon, 'local-dot must resolve from test/fixtures/icons/dot.svg');
  assert.match(icon.svg, /<circle/);
});

test('local icon that does not exist returns null', () => {
  const r = new IconResolver(opts({ localIconDirs: ['./test/fixtures/icons'] }));
  assert.equal(r.resolve('local-missing'), null);
});
