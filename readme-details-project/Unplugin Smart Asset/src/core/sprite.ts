import { createHash } from 'node:crypto';
import type { IconData, ResolvedOptions } from '../types.js';
import { renderSymbol } from './render.js';

export interface SpriteResult {
  html: string;
  bytes: number;
  symbols: number;
  deduped: number;
}

const SPRITE_STYLE = 'position:absolute;width:0;height:0;overflow:hidden';

/**
 * Build the global sprite.
 *
 * Ordering is by key so the output is byte-identical between builds.
 * `display:none` is deliberately avoided: it breaks gradients/masks in older
 * Safari and Firefox. The 0x0 + overflow:hidden pattern is the safe one.
 */
export function buildSprite(
  entries: Array<[string, IconData]>,
  opts: ResolvedOptions,
): SpriteResult {
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const byHash = new Map<string, string>();
  const parts: string[] = [];
  let deduped = 0;

  for (const [key, data] of sorted) {
    const hash = createHash('sha1')
      .update(`${data.viewBox}|${data.symbolAttrs}|${data.body}`)
      .digest('hex');

    if (opts.sprite.dedupe) {
      const existing = byHash.get(hash);
      if (existing) {
        // Keep the id valid without duplicating path data.
        parts.push(`<symbol id="smart-icon-${key}"><use href="#smart-icon-${existing}" /></symbol>`);
        deduped++;
        continue;
      }
      byHash.set(hash, key);
    }

    parts.push(renderSymbol(key, data.viewBox, data.symbolAttrs, data.body));
  }

  // `xmlns` is redundant when inlined into HTML (the parser namespaces it for
  // us) but MANDATORY when the sprite ships as a standalone .svg file: without
  // it the document parses in no namespace, the <symbol> ids live in the wrong
  // namespace, and every external <use href="sprite.svg#id"> silently renders
  // nothing while the network tab shows 200.
  const html = `<svg xmlns="http://www.w3.org/2000/svg" id="${opts.sprite.id}" aria-hidden="true" focusable="false" style="${SPRITE_STYLE}">${parts.join('')}</svg>`;
  return {
    html,
    bytes: Buffer.byteLength(html, 'utf8'),
    symbols: parts.length,
    deduped,
  };
}

/** 'auto' inlines until the sprite exceeds inlineMaxBytes, then emits a file. */
export function shouldInline(bytes: number, opts: ResolvedOptions): boolean {
  if (opts.sprite.mode === 'inline') return true;
  if (opts.sprite.mode === 'file') return false;
  return bytes <= opts.sprite.inlineMaxBytes;
}

export function injectIntoSpriteHost(html: string, sprite: string): string {
  if (!html.includes('</body>')) return `${sprite}${html}`;
  // Insert before the app root so icons never flash empty on first paint.
  return html.replace(/<body([^>]*)>/i, `<body$1>${sprite}`);
}

export function injectPreload(html: string, href: string): string {
  if (!html.includes('</head>')) return html;
  return html.replace(/<\/head>/i, `<link rel="preload" as="image" href="${href}" /></head>`);
}
