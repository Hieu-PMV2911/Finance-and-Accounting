import type { IconRef, ImageRef, ResolvedOptions, ScanResult } from '../types.js';
import { requireFrom } from '../options.js';

interface SvelteNode {
  type: string;
  name?: string;
  start: number;
  end: number;
  nodes?: SvelteNode[];
  children?: SvelteNode[];
  fragment?: { nodes?: SvelteNode[] };
  attributes?: SvelteAttribute[];
  data?: string;
}

interface SvelteAttribute {
  type: string;
  name?: string;
  value?: SvelteNode[] | string | true;
  start?: number;
  end?: number;
}

/** Element node names differ between majors: Svelte 4 uses `Element`, Svelte 5 `RegularElement`. */
const ELEMENT_TYPES = new Set(['Element', 'RegularElement']);
const COMPONENT_TYPES = new Set(['InlineComponent', 'Component']);

/**
 * Svelte scanner.
 *
 * Two traps:
 *  1. Svelte 4 → `ast.html.children` + `type: 'Element'`
 *     Svelte 5 → `ast.fragment.nodes` + `type: 'RegularElement'`
 *  2. A Fragment exposes `.nodes`, while an element exposes `.fragment.nodes`.
 *     Missing the `.nodes` branch silently skips the whole top level.
 */
export function scanSvelte(code: string, id: string, opts: ResolvedOptions): ScanResult {
  const compiler = requireFrom(opts.root, 'svelte/compiler') as {
    parse: (source: string, options?: Record<string, unknown>) => {
      fragment?: { nodes?: SvelteNode[] };
      html?: { children?: SvelteNode[] };
    };
  };

  let ast: ReturnType<typeof compiler.parse>;
  try {
    ast = compiler.parse(code, { filename: id, modern: true });
  } catch {
    ast = compiler.parse(code, { filename: id });
  }

  const rootNodes = ast.fragment?.nodes ?? ast.html?.children ?? [];
  const icons: IconRef[] = [];
  const images: ImageRef[] = [];
  const tagPrefix = `${opts.iconPrefix}-`;
  const colonPrefix = `${opts.iconPrefix}:`;

  const visit = (node: SvelteNode): void => {
    if (
      typeof node.name === 'string' &&
      (ELEMENT_TYPES.has(node.type) || COMPONENT_TYPES.has(node.type))
    ) {
      const tag = node.name;
      let key: string | null = null;
      if (tag.startsWith(tagPrefix)) key = tag.slice(tagPrefix.length);
      else if (opts.colonAlias && tag.startsWith(colonPrefix)) key = tag.slice(colonPrefix.length);

      if (key) {
        const children = (node.fragment?.nodes ?? node.children ?? []).filter(
          (c) => !(c.type === 'Text' && !c.data?.trim()),
        );
        if (children.length) {
          throw new Error(
            `[smart-asset] <${tag}> cannot have children (${id}:${lineOf(code, node.start)}). ` +
            `Remove the children or use the "title" attribute.`,
          );
        }
        icons.push({ key, attrs: readAttrs(node.attributes ?? []), start: node.start, end: node.end });
        return;
      }
    }

    if (Array.isArray(node.nodes)) for (const c of node.nodes) visit(c);
    if (node.fragment?.nodes) for (const c of node.fragment.nodes) visit(c);
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
  };

  for (const node of rootNodes) visit(node);

  const collectImages = (node: SvelteNode): void => {
    for (const attr of node.attributes ?? []) {
      if (attr.type !== 'Attribute' || !attr.name || !opts.imageAttrs.includes(attr.name)) continue;
      const text = textOf(attr);
      if (!text || !text.startsWith(opts.imagePrefix)) continue;
      const first = Array.isArray(attr.value) ? attr.value[0] : undefined;
      const last = Array.isArray(attr.value) ? attr.value[attr.value.length - 1] : undefined;
      if (!first || !last) continue;
      images.push({
        specifier: text.slice(opts.imagePrefix.length),
        attr: attr.name,
        start: first.start,
        end: last.end,
        // Svelte's attribute Text node spans only the value BETWEEN the quotes,
        // unlike JSX/HTML where the range includes them. Emitting quotes here
        // produced src=""data:…"" and a "Expected token >" compile error.
        quote: '',
      });
    }
    if (Array.isArray(node.nodes)) for (const c of node.nodes) collectImages(c);
    if (node.fragment?.nodes) for (const c of node.fragment.nodes) collectImages(c);
    if (Array.isArray(node.children)) for (const c of node.children) collectImages(c);
  };
  for (const node of rootNodes) collectImages(node);

  return { icons, images };
}

function textOf(attr: SvelteAttribute): string | null {
  if (typeof attr.value === 'string') return attr.value;
  if (Array.isArray(attr.value)) return attr.value.map((v) => v.data ?? '').join('');
  return null;
}

function readAttrs(attributes: SvelteAttribute[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const attr of attributes) {
    if (attr.type !== 'Attribute' || !attr.name) continue;
    const text = textOf(attr);
    out[attr.name] = text === null ? true : text;
  }
  return out;
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) if (code[i] === '\n') line++;
  return line;
}
