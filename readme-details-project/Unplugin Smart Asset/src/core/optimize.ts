import { optimize } from 'svgo';
import type { IconData } from '../types.js';

type IconKind = 'fill' | 'stroke';

/**
 * Decide whether an icon is filled or stroked.
 * Lucide/Feather are stroke icons (`fill="none" stroke="currentColor"`),
 * Heroicons solid / Material are fill icons (`fill="currentColor"`).
 * Stripping fill/stroke blindly turns stroke icons into solid black blobs.
 */
export function classify(svg: string): IconKind {
  const rootFill = svg.match(/<svg[^>]*\sfill="([^"]*)"/)?.[1];
  if (rootFill && rootFill !== 'none') return 'fill';
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return /fill="(?!none)[^"]*"/.test(body) ? 'fill' : 'stroke';
}

function attr(svg: string, name: string): string | undefined {
  return svg.match(new RegExp(`<svg[^>]*\\s${name}="([^"]*)"`))?.[1]
    ?? svg.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

/**
 * SVGO plugin: drop scripts, inline event handlers and outbound references.
 *
 * Two things about SVGO 4's visitor API are easy to get wrong here:
 *
 *  1. Returning `null` from a visitor does NOT delete the node — the <script>
 *     passes straight through. Removal means splicing it out of the parent.
 *  2. Splicing DURING `enter` corrupts the traversal: the walker's index
 *     shifts, later siblings are skipped, and the next node is never visited.
 *     Verified: removing <script> this way left `onclick` on the <path> that
 *     followed it.
 *
 * So removals are collected during the walk and applied once, at `root.exit`.
 */
const stripUnsafe = {
  name: 'smartAssetStripUnsafe',
  fn: () => {
    const doomed: Array<[parent: unknown, node: unknown]> = [];
    return {
      element: {
        enter: (
          node: { name: string; attributes: Record<string, string> },
          parentNode?: unknown,
        ) => {
          if (node.name === 'foreignObject' || node.name === 'script') {
            doomed.push([parentNode, node]);
            return;
          }
          for (const key of Object.keys(node.attributes)) {
            if (/^on/i.test(key)) delete node.attributes[key];
            if ((key === 'href' || key === 'xlink:href') && /^(https?:)?\/\//.test(node.attributes[key])) {
              delete node.attributes[key];
            }
          }
        },
      },
      root: {
        exit: () => {
          for (const [parent, node] of doomed) {
            const siblings = (parent as { children?: unknown[] } | undefined)?.children;
            if (!Array.isArray(siblings)) continue;
            const i = siblings.indexOf(node);
            if (i >= 0) siblings.splice(i, 1);
          }
        },
      },
    };
  },
};

export interface OptimizeConfig {
  plugins?: unknown[];
}

/**
 * Optimize one icon and produce everything needed to build a <symbol>.
 * `key` is used as the id prefix so two icons can never collide on `id`.
 */
export function optimizeIcon(svg: string, key: string, config: OptimizeConfig | false = {}): IconData {
  const kind = classify(svg);
  const strokeWidth = attr(svg, 'stroke-width') ?? '2';
  const strokeLinecap = attr(svg, 'stroke-linecap') ?? 'round';
  const strokeLinejoin = attr(svg, 'stroke-linejoin') ?? 'round';

  let body: string;
  let viewBox: string;

  if (config === false) {
    const m = svg.match(/<svg[^>]*viewBox="([^"]*)"[^>]*>([\s\S]*)<\/svg>/);
    viewBox = m?.[1] ?? '0 0 24 24';
    body = m?.[2] ?? svg;
  } else {
    const userPlugins = (config.plugins as unknown[]) ?? ['preset-default'];
    const plugins: unknown[] = [
      ...userPlugins,
      // cleanupIds shortens ids first, prefixIds then makes them globally unique.
      'cleanupIds',
      { name: 'prefixIds', params: { prefix: key } },
      {
        name: 'removeAttrs',
        params: {
          attrs: kind === 'stroke'
            ? '(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)'
            : '(stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)',
        },
      },
      stripUnsafe,
    ];

    const result = optimize(svg, { plugins: plugins as never });
    const m = result.data.match(/<svg[^>]*viewBox="([^"]*)"[^>]*>([\s\S]*)<\/svg>/);
    viewBox = m?.[1] ?? '0 0 24 24';
    body = (m?.[2] ?? result.data).trim();
  }

  const symbolAttrs = kind === 'fill'
    ? ' fill="currentColor"'
    : ` fill="none" stroke="currentColor" stroke-width="${strokeWidth}"`
      + ` stroke-linecap="${strokeLinecap}" stroke-linejoin="${strokeLinejoin}"`;

  return { viewBox, body, kind, symbolAttrs };
}
