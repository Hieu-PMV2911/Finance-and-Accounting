import { parse } from '@babel/parser';
import type { IconRef, ImageRef, ResolvedOptions, ScanResult } from '../types.js';

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

/**
 * JSX scanner for React / Preact / Solid.
 *
 * Uses a real AST rather than a regex: a regex would also rewrite tags inside
 * strings, template literals and comments.
 */
export function scanJsx(code: string, id: string, opts: ResolvedOptions): ScanResult {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: false,
  }) as unknown as Node;

  const icons: IconRef[] = [];
  const images: ImageRef[] = [];
  const tagPrefix = `${opts.iconPrefix}-`;
  const colonPrefix = `${opts.iconPrefix}:`;

  walk(ast, (node) => {
    if (node.type === 'JSXElement') {
      const opening = node.openingElement as Node;
      const nameNode = opening.name as Node;
      const name = tagName(nameNode, opts);
      if (!name) return;

      let key: string | null = null;
      if (name.startsWith(tagPrefix)) key = name.slice(tagPrefix.length);
      else if (opts.colonAlias && name.startsWith(colonPrefix)) key = name.slice(colonPrefix.length);
      if (!key) return;

      const children = node.children as Node[];
      const closing = node.closingElement as Node | null;
      if (!opening.selfClosing && children.length > 0) {
        throw new Error(
          `[smart-asset] <${name}> cannot have children (${id}:${lineOf(code, node.start)}). ` +
          `Remove the children or use the "title" attribute.`,
        );
      }

      icons.push({
        key,
        attrs: readAttrs(opening.attributes as Node[]),
        start: opening.start,
        end: opening.end,
        close: closing ? [closing.start, closing.end] : undefined,
      });
      return;
    }

    if (node.type === 'JSXAttribute') {
      const attrName = (node.name as Node | undefined)?.name;
      if (typeof attrName !== 'string' || !opts.imageAttrs.includes(attrName)) return;
      const value = node.value as Node | null;
      if (!value || value.type !== 'StringLiteral') return;
      const raw = value.value as string;
      if (!raw.startsWith(opts.imagePrefix)) return;
      images.push({
        specifier: raw.slice(opts.imagePrefix.length),
        attr: attrName,
        start: value.start,
        end: value.end,
        quote: code[value.start] === "'" ? "'" : '"',
      });
    }
  });

  return { icons, images };
}

function tagName(node: Node, opts: ResolvedOptions): string | null {
  switch (node.type) {
    case 'JSXIdentifier':
      return node.name as string;
    case 'JSXNamespacedName': {
      // <icon:lucide-home /> parses as a namespaced name.
      if (!opts.colonAlias) return null;
      const ns = (node.namespace as Node).name as string;
      const nm = (node.name as Node).name as string;
      return `${ns}:${nm}`;
    }
    default:
      // JSXMemberExpression (e.g. <icon-foo.bar />) has no string name.
      return null;
  }
}

function readAttrs(attributes: Node[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const nameNode = attr.name as Node;
    const name = nameNode.name as string | undefined;
    if (!name) continue;
    const value = attr.value as Node | null;
    if (!value) {
      out[name] = true;
    } else if (value.type === 'StringLiteral') {
      out[name] = value.value as string;
    }
    // JSXExpressionContainer ({...}) is not evaluated at build time — skipped.
  }
  return out;
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) if (code[i] === '\n') line++;
  return line;
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof (child as Node).type === 'string') {
          walk(child as Node, visit);
        }
      }
    } else if (value && typeof value === 'object' && typeof (value as Node).type === 'string') {
      walk(value as Node, visit);
    }
  }
}
