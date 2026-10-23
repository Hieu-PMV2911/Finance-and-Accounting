import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import type { FrameworkName, ResolvedOptions, SmartAssetOptions } from './types.js';

const DEFAULT_ICON_DIRS = ['src/assets/icons'];

export function resolveOptions(raw: SmartAssetOptions, root: string): ResolvedOptions {
  const sprite = raw.sprite ?? {};
  return {
    root,
    frameworks: raw.frameworks === 'auto' || raw.frameworks === undefined
      ? detectFrameworks(root)
      : raw.frameworks,
    iconPrefix: raw.iconPrefix ?? 'icon',
    colonAlias: raw.colonAlias ?? true,
    collections: raw.collections ?? {},
    localIconDirs: (raw.localIconDirs ?? DEFAULT_ICON_DIRS).map((d) => (isAbsolute(d) ? d : join(root, d))),
    localCollection: raw.localCollection ?? 'local',
    onUnknownIcon: raw.onUnknownIcon ?? 'throw',
    maxInlineSize: raw.maxInlineSize ?? 4096,
    imagePrefix: raw.imagePrefix ?? 'smart:',
    imageAttrs: raw.imageAttrs ?? ['src'],
    sprite: {
      id: sprite.id ?? '__SMART_ASSET_SPRITE__',
      mode: sprite.mode ?? 'auto',
      inlineMaxBytes: sprite.inlineMaxBytes ?? 48 * 1024,
      dedupe: sprite.dedupe ?? true,
      preload: sprite.preload ?? true,
    },
    inject: raw.inject ?? 'auto',
    dts: raw.dts === undefined ? 'src/smart-asset.d.ts' : raw.dts,
    allowUnknownIcons: raw.allowUnknownIcons ?? false,
    svgo: raw.svgo === undefined ? { plugins: ['preset-default'] } : raw.svgo,
    assertNoLeftover: raw.assertNoLeftover ?? true,
    verbose: raw.verbose ?? false,
  };
}

/** Best-effort framework detection from the consuming project's package.json. */
export function detectFrameworks(root: string): FrameworkName[] {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) return ['html'];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return ['html'];
  }
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  const found: FrameworkName[] = [];
  if (deps['react'] || deps['react-dom']) found.push('react');
  if (deps['preact']) found.push('preact');
  if (deps['solid-js']) found.push('solid');
  if (deps['vue']) found.push('vue');
  if (deps['svelte']) found.push('svelte');
  if (!found.length) found.push('html');
  return found;
}

/** Regex used to reject files before parsing them. Derived from options, never hard-coded. */
export function buildProbe(opts: ResolvedOptions): RegExp {
  const prefix = escapeRegExp(opts.iconPrefix);
  const image = escapeRegExp(opts.imagePrefix);
  const colon = opts.colonAlias ? `|${prefix}:` : '';
  return new RegExp(`(?:${prefix}-${colon}|${image})`);
}

/** Matches a raw, unprocessed icon tag in build output. Does NOT match `#smart-icon-home`. */
export function buildLeftoverProbe(opts: ResolvedOptions): RegExp {
  const prefix = escapeRegExp(opts.iconPrefix);
  return new RegExp(`(["'\`])${prefix}[-:][a-z0-9-]+\\1`, 'g');
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a package from the consuming project first, then from this package.
 * Keeps `@iconify-json/*` a devDependency of the app, not of the plugin.
 */
export function requireFrom(root: string, id: string): unknown {
  const projectRequire = createRequire(join(root, 'package.json'));
  try {
    return projectRequire(id);
  } catch {
    const selfRequire = createRequire(import.meta.url);
    return selfRequire(id);
  }
}

export function packageRoot(from: string): string {
  let dir = dirname(from);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = resolvePath(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return from;
}
