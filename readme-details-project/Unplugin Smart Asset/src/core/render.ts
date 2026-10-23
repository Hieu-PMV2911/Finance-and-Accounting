import type { FrameworkName } from '../types.js';

const CLASS_ATTR: Record<string, string> = {
  react: 'className',
  preact: 'className',
  solid: 'class',
  vue: 'class',
  svelte: 'class',
  html: 'class',
};

/** Attributes we forward from the source tag onto the generated <svg>. */
const FORWARDED = new Set(['style', 'id', 'role', 'fill', 'stroke']);

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Build the replacement for one icon tag.
 * Rendering is framework-agnostic except for the class attribute name:
 * React/Preact need `className`, everything else uses `class`.
 */
export function renderIcon(
  key: string,
  viewBox: string,
  attrs: Record<string, string | true>,
  framework: FrameworkName,
): string {
  const classAttr = CLASS_ATTR[framework] ?? 'class';
  const parts: string[] = [];

  const title = typeof attrs.title === 'string' ? attrs.title : undefined;
  const label = typeof attrs['aria-label'] === 'string' ? attrs['aria-label'] : undefined;

  if (attrs.class !== undefined || attrs.className !== undefined) {
    const value = (attrs.className ?? attrs.class) as string;
    parts.push(`${classAttr}="${esc(value)}"`);
  }

  parts.push('width="1em"', 'height="1em"', `viewBox="${viewBox}"`);

  if (label) {
    parts.push(`aria-label="${esc(label)}"`, 'role="img"');
  } else {
    parts.push('aria-hidden="true"', 'focusable="false"');
  }

  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'title' || name === 'class' || name === 'className') continue;
    if (name === 'width' || name === 'height' || name === 'aria-label') continue;
    if (value === true) {
      if (/^(aria|data)-/.test(name)) parts.push(name);
      continue;
    }
    if (FORWARDED.has(name) || /^(aria|data)-/.test(name)) {
      parts.push(`${name}="${esc(value)}"`);
    }
  }

  const inner = title
    ? `<title>${esc(title)}</title><use href="#smart-icon-${key}" />`
    : `<use href="#smart-icon-${key}" />`;

  return `<svg ${parts.join(' ')}>${inner}</svg>`;
}

export function renderSymbol(key: string, viewBox: string, symbolAttrs: string, body: string): string {
  return `<symbol id="smart-icon-${key}" viewBox="${viewBox}"${symbolAttrs}>${body}</symbol>`;
}
