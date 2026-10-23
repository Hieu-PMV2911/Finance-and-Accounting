import type { IconRef, ImageRef, ResolvedOptions, ScanResult } from '../types.js';
import { requireFrom } from '../options.js';

interface VueNode {
  type: number;
  tag?: string;
  props?: VueProp[];
  children?: VueNode[];
  loc?: { start: { offset: number }; end: { offset: number } };
}

interface VueProp {
  type: number;
  name?: string;
  value?: { content?: string; loc?: { start: { offset: number }; end: { offset: number } } };
  loc?: { start: { offset: number }; end: { offset: number } };
}

const ELEMENT = 1;
const ATTRIBUTE = 6;

/**
 * Vue SFC scanner.
 *
 * `descriptor.template.ast` reports offsets that are ABSOLUTE into the .vue file,
 * not into the template block — so magic-string can operate on the whole file.
 */
export function scanVue(code: string, id: string, opts: ResolvedOptions): ScanResult {
  const sfc = requireFrom(opts.root, '@vue/compiler-sfc') as {
    parse: (source: string, options: { filename: string }) => {
      descriptor: { template?: { ast?: VueNode } | null };
    };
  };

  const { descriptor } = sfc.parse(code, { filename: id });
  const template = descriptor.template;
  if (!template?.ast) return { icons: [], images: [] };

  const icons: IconRef[] = [];
  const images: ImageRef[] = [];
  const tagPrefix = `${opts.iconPrefix}-`;
  const colonPrefix = `${opts.iconPrefix}:`;

  const visit = (node: VueNode): void => {
    if (node.type === ELEMENT && typeof node.tag === 'string') {
      const tag = node.tag;
      let key: string | null = null;
      if (tag.startsWith(tagPrefix)) key = tag.slice(tagPrefix.length);
      else if (opts.colonAlias && tag.startsWith(colonPrefix)) key = tag.slice(colonPrefix.length);

      if (key) {
        const children = (node.children ?? []).filter(
          (c) => !(c.type === 2 && !(c as unknown as { content: string }).content?.trim()),
        );
        if (children.length) {
          throw new Error(
            `[smart-asset] <${tag}> cannot have children (${id}:${lineOf(code, node.loc!.start.offset)}). ` +
            `Remove the children or use the "title" attribute.`,
          );
        }
        icons.push({
          key,
          attrs: readAttrs(node.props ?? []),
          start: node.loc!.start.offset,
          end: node.loc!.end.offset,
        });
        return;
      }
    }

    for (const child of node.children ?? []) visit(child);
  };

  visit(template.ast);

  // Images: plain attributes whose value starts with the image prefix.
  const collectImages = (node: VueNode): void => {
    for (const prop of node.props ?? []) {
      if (prop.type !== ATTRIBUTE || !prop.name || !opts.imageAttrs.includes(prop.name)) continue;
      const content = prop.value?.content;
      if (!content || !content.startsWith(opts.imagePrefix)) continue;
      const loc = prop.value?.loc ?? prop.loc;
      if (!loc) continue;
      images.push({
        specifier: content.slice(opts.imagePrefix.length),
        attr: prop.name,
        start: loc.start.offset,
        end: loc.end.offset,
        quote: '"',
      });
    }
    for (const child of node.children ?? []) collectImages(child);
  };
  collectImages(template.ast);

  return { icons, images };
}

function readAttrs(props: VueProp[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const prop of props) {
    if (prop.type !== ATTRIBUTE || !prop.name) continue;
    out[prop.name] = prop.value?.content ?? true;
  }
  return out;
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) if (code[i] === '\n') line++;
  return line;
}
