#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { IconData, SmartAssetOptions } from './types.js';
import { resolveOptions } from './options.js';
import { IconResolver, suggest } from './core/resolver.js';
import { optimizeIcon } from './core/optimize.js';
import { buildSprite } from './core/sprite.js';
import { generateDts, writeDtsIfChanged } from './core/dts.js';
import { pickScanner } from './scan/index.js';

const SRC_EXT = /\.(tsx|jsx|vue|svelte|html|htm)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.nuxt', '.svelte-kit']);

interface Collected {
  keys: Map<string, Set<string>>;
  unknown: Array<{ key: string; file: string }>;
  images: Array<{ specifier: string; file: string }>;
}

function loadConfig(root: string): SmartAssetOptions {
  const file = join(root, 'smart-asset.config.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SmartAssetOptions;
  } catch (error) {
    console.error(`[smart-asset] invalid smart-asset.config.json: ${(error as Error).message}`);
    process.exit(1);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (SRC_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collect(root: string, srcDir: string): Collected {
  const raw = loadConfig(root);
  const opts = resolveOptions(raw, root);
  const resolver = new IconResolver(opts);
  const collected: Collected = { keys: new Map(), unknown: [], images: [] };

  for (const file of walk(join(root, srcDir))) {
    const code = readFileSync(file, 'utf8');
    const pick = pickScanner(file, opts);
    if (!pick) continue;
    let result;
    try {
      result = pick.scan(code, file, opts);
    } catch (error) {
      console.error(`[smart-asset] ${relative(root, file)}: ${(error as Error).message}`);
      process.exitCode = 1;
      continue;
    }
    for (const icon of result.icons) {
      if (!resolver.resolve(icon.key)) {
        collected.unknown.push({ key: icon.key, file: relative(root, file) });
        continue;
      }
      let set = collected.keys.get(icon.key);
      if (!set) {
        set = new Set();
        collected.keys.set(icon.key, set);
      }
      set.add(relative(root, file));
    }
    for (const image of result.images) {
      collected.images.push({ specifier: image.specifier, file: relative(root, file) });
    }
  }
  return collected;
}

function commandPrepare(root: string, srcDir: string): void {
  const raw = loadConfig(root);
  const opts = resolveOptions(raw, root);
  const resolver = new IconResolver(opts);
  const collected = collect(root, srcDir);

  if (collected.unknown.length) {
    console.error('[smart-asset] unknown icons:');
    for (const item of collected.unknown) {
      const parts = resolver.split(item.key);
      const hints = parts ? suggest(parts.name, resolver.list(parts.collection)) : [];
      console.error(`  ${item.key}  (${item.file})${hints.length && parts ? `  → did you mean ${parts.collection}-${hints[0]}?` : ''}`);
    }
    process.exitCode = 1;
    return;
  }

  const entries: Array<[string, IconData]> = [...collected.keys.keys()].sort().map((key) => {
    const resolved = resolver.resolve(key)!;
    return [key, optimizeIcon(resolved.svg, key, opts.svgo)];
  });

  const sprite = buildSprite(entries, opts);
  const spritePath = join(root, 'sprite.svg');
  writeFileSync(spritePath, sprite.html);

  const dtsFile = opts.dts === false ? null : join(root, opts.dts);
  if (dtsFile) writeDtsIfChanged(dtsFile, generateDts(entries.map(([k]) => k), opts.frameworks, opts));

  const manifest = {
    generatedAt: new Date().toISOString(),
    sprite: relative(root, spritePath),
    bytes: sprite.bytes,
    icons: entries.map(([key, data]) => ({
      key,
      uses: collected.keys.get(key)!.size,
      bytes: Buffer.byteLength(data.body, 'utf8'),
      viewBox: data.viewBox,
      kind: data.kind,
    })),
  };
  const manifestPath = join(root, 'smart-asset.manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[smart-asset] ${entries.length} icons → ${relative(root, spritePath)} (${sprite.bytes} B)`);
  if (dtsFile) console.log(`[smart-asset] types → ${relative(root, dtsFile)}`);
  if (collected.images.length) {
    console.log(`[smart-asset] ${collected.images.length} smart: images found (resolved at build time)`);
  }
}

function commandCheck(root: string, srcDir: string): void {
  const collected = collect(root, srcDir);
  if (!collected.unknown.length) {
    console.log(`[smart-asset] ok — ${collected.keys.size} icons, no unknown references`);
    return;
  }
  console.error(`[smart-asset] ${collected.unknown.length} unknown icon(s):`);
  for (const item of collected.unknown) console.error(`  ${item.key}  (${item.file})`);
  process.exitCode = 1;
}

function commandReport(root: string, srcDir: string): void {
  const collected = collect(root, srcDir);
  const rows = [...collected.keys.entries()]
    .map(([key, files]) => ({ key, uses: files.size }))
    .sort((a, b) => b.uses - a.uses || a.key.localeCompare(b.key));

  const width = Math.max(10, ...rows.map((r) => r.key.length));
  console.log(`${'icon'.padEnd(width)}  uses`);
  for (const row of rows) console.log(`${row.key.padEnd(width)}  ${String(row.uses).padStart(4)}`);
  console.log('──');
  console.log(`total: ${rows.length} icons across ${collected.keys.size} keys`);
  if (collected.unknown.length) console.log(`unknown: ${collected.unknown.length}`);
}

function main(): void {
  const root = process.cwd();
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'help';
  const srcFlag = argv.indexOf('--src');
  const srcDir = srcFlag >= 0 ? argv[srcFlag + 1] : 'src';

  switch (command) {
    case 'prepare':
      commandPrepare(root, srcDir);
      break;
    case 'check':
      commandCheck(root, srcDir);
      break;
    case 'report':
      commandReport(root, srcDir);
      break;
    default:
      console.log(`unplugin-smart-asset

Usage:
  smart-asset prepare   generate sprite.svg + .d.ts + manifest
  smart-asset check     fail on unknown icons
  smart-asset report    print icon usage

Options:
  --src <dir>           source directory (default: src)

Configuration is read from smart-asset.config.json in the project root.`);
  }
}

main();
