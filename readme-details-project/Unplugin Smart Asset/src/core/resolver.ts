import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedOptions } from '../types.js';
import { requireFrom } from '../options.js';

interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

interface IconifySet {
  prefix: string;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, { parent: string } & Partial<IconifyIcon>>;
  width?: number;
  height?: number;
}

export interface ResolvedIcon {
  collection: string;
  name: string;
  svg: string;
}

/**
 * Normalise whatever `require()` handed us into an IconifyJSON document.
 *
 * `@iconify-json/*` ships two different shapes depending on the condition
 * Node picks:
 *
 *   ESM  (`index.mjs`) → `{ prefix, icons, aliases, width, height }`
 *   CJS  (`index.js`)  → `{ icons: <the document above>, info, metadata, chars }`
 *
 * A naive `mod.default ?? mod` therefore yields the CJS *wrapper*, whose
 * `icons` is the document rather than the name→icon map. Lookups then fail
 * for every icon with no error anywhere — the whole collection looks empty.
 */
function toIconifySet(mod: unknown): IconifySet | null {
  let cur = mod as Record<string, unknown> | null | undefined;
  for (let depth = 0; depth < 4 && cur && typeof cur === 'object'; depth++) {
    if (typeof cur.prefix === 'string' && cur.icons && typeof cur.icons === 'object') {
      return cur as unknown as IconifySet;
    }
    const next = (cur.default ?? cur.icons) as Record<string, unknown> | undefined;
    if (!next || typeof next !== 'object') return null;
    cur = next;
  }
  return null;
}

export class IconResolver {
  private sets = new Map<string, IconifySet | null>();
  private errors = new Map<string, string>();
  private collectionNames: string[];

  constructor(private opts: ResolvedOptions) {
    // Longest first so `heroicons-solid` wins over `heroicons`.
    this.collectionNames = [...Object.keys(opts.collections), opts.localCollection]
      .sort((a, b) => b.length - a.length);
  }

  get collections(): string[] {
    return this.collectionNames;
  }

  /** Split `lucide-arrow-left` into collection + name using longest-prefix matching. */
  split(key: string): { collection: string; name: string } | null {
    const matches = this.collectionNames.filter((c) => key === c || key.startsWith(`${c}-`));
    if (!matches.length) return null;
    if (matches.length > 1 && matches[0].length === matches[1].length) {
      throw new Error(
        `[smart-asset] ambiguous icon "${key}": matches collections ` +
        `${matches.map((m) => `"${m}"`).join(', ')}. Rename a collection or use a different separator.`,
      );
    }
    const collection = matches[0];
    const name = key.slice(collection.length + 1);
    return name ? { collection, name } : null;
  }

  resolve(key: string): ResolvedIcon | null {
    const parts = this.split(key);
    if (!parts) return null;
    const { collection, name } = parts;

    if (collection === this.opts.localCollection) {
      const svg = this.readLocal(name);
      return svg ? { collection, name, svg } : null;
    }

    const pkg = this.opts.collections[collection];
    if (!pkg) return null;
    const set = this.loadSet(collection, pkg);
    if (!set) return null;

    let icon: IconifyIcon | undefined = set.icons[name];
    if (!icon && set.aliases?.[name]) {
      const alias = set.aliases[name];
      icon = alias.body ? (alias as IconifyIcon) : set.icons[alias.parent];
    }
    if (!icon) return null;

    const w = icon.width ?? set.width ?? 24;
    const h = icon.height ?? set.height ?? 24;
    const left = icon.left ?? 0;
    const top = icon.top ?? 0;
    const viewBox = left || top ? `${left} ${top} ${w} ${h}` : `0 0 ${w} ${h}`;
    return { collection, name, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${icon.body}</svg>` };
  }

  /**
   * All icon names available for a collection — used for "did you mean" hints.
   * Aliases are included: Lucide renamed `home` to `house` but kept `home` as an
   * alias, and `resolve()` accepts it. Listing only `icons` would make the
   * suggestion engine unable to ever propose a name that actually works.
   */
  list(collection: string): string[] {
    if (collection === this.opts.localCollection) return [];
    const pkg = this.opts.collections[collection];
    if (!pkg) return [];
    const set = this.loadSet(collection, pkg);
    if (!set) return [];
    return [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})];
  }

  private readLocal(name: string): string | null {
    for (const dir of this.opts.localIconDirs) {
      const file = join(dir, `${name}.svg`);
      if (existsSync(file)) return readFileSync(file, 'utf8');
    }
    return null;
  }

  private loadSet(collection: string, pkg: string): IconifySet | null {
    if (this.sets.has(collection)) return this.sets.get(collection) ?? null;
    let set: IconifySet | null = null;
    try {
      set = toIconifySet(requireFrom(this.opts.root, pkg));
      if (!set) this.errors.set(collection, `"${pkg}" did not export an IconifyJSON document`);
    } catch (err) {
      this.errors.set(collection, (err as Error).message.split('\n')[0]);
      set = null;
    }
    this.sets.set(collection, set);
    return set;
  }

  /**
   * Why a collection failed to load, if it did. A declared collection that
   * silently resolves to zero icons is the most confusing failure this plugin
   * can produce, so the message is surfaced instead of swallowed.
   */
  failure(collection: string): string | undefined {
    return this.errors.get(collection);
  }
}

/**
 * Cheap Levenshtein for "did you mean" suggestions.
 *
 * Distance alone is not enough: a 1,978-icon set has dozens of names at
 * distance 1 from a typo, so `hom` ranked `ham`/`hop` above `home` purely by
 * array order. Prefix matches and similar length are the signals a human
 * actually uses, so they break the tie.
 */
export function suggest(input: string, candidates: string[], max = 3): string[] {
  const limit = Math.max(2, Math.floor(input.length / 3));
  const scored = candidates
    .map((c) => ({
      c,
      d: distance(input, c),
      prefix: c.startsWith(input) || input.startsWith(c) ? 0 : 1,
      lengthGap: Math.abs(c.length - input.length),
    }))
    .filter((s) => s.d <= limit)
    .sort((a, b) => a.d - b.d || a.prefix - b.prefix || a.lengthGap - b.lengthGap || (a.c < b.c ? -1 : 1));
  return scored.slice(0, max).map((s) => s.c);
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
