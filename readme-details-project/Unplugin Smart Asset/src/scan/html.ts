import type { IconRef, ImageRef, ResolvedOptions, ScanResult } from '../types.js';

interface SkipRange {
  start: number;
  end: number;
}

/**
 * Plain HTML scanner.
 *
 * A regex is acceptable here because HTML has no JSX semantics: there are no
 * template literals or comments-inside-expressions to confuse. We still skip
 * `<!-- -->`, `<script>` and `<style>` bodies so sample markup is left alone.
 */
export function scanHtml(code: string, _id: string, opts: ResolvedOptions): ScanResult {
  const icons: IconRef[] = [];
  const images: ImageRef[] = [];
  const skip = skipRanges(code);
  const tagPrefix = `${opts.iconPrefix}-`;
  const colonPrefix = `${opts.iconPrefix}:`;

  const tagRe = /<([a-zA-Z][a-zA-Z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(code)) !== null) {
    const [full, rawTag, rawAttrs, selfClose] = match;
    const tagStart = match.index;
    if (inSkip(skip, tagStart)) continue;

    const attrs = parseAttrs(rawAttrs, tagStart + 1 + rawTag.length);

    let key: string | null = null;
    if (rawTag.startsWith(tagPrefix)) key = rawTag.slice(tagPrefix.length);
    else if (opts.colonAlias && rawTag.startsWith(colonPrefix)) key = rawTag.slice(colonPrefix.length);

    if (key) {
      let close: [number, number] | undefined;
      let end = tagStart + full.length;
      if (!selfClose) {
        const closeRe = new RegExp(`</${escapeRegExp(rawTag)}\\s*>`, 'g');
        closeRe.lastIndex = end;
        const closing = closeRe.exec(code);
        if (!closing) continue;
        const inner = code.slice(end, closing.index);
        if (inner.trim()) {
          throw new Error(
            `[smart-asset] <${rawTag}> cannot have children (${_id}:${lineOf(code, tagStart)}). ` +
            `Remove the children or use the "title" attribute.`,
          );
        }
        close = [closing.index, closing.index + closing[0].length];
        end = close[1];
      }
      icons.push({
        key,
        attrs: attrs.values,
        start: tagStart,
        end: selfClose ? tagStart + full.length : tagStart + full.length,
        close: selfClose ? undefined : close,
      });
      continue;
    }

    for (const img of attrs.images) {
      if (!opts.imageAttrs.includes(img.name)) continue;
      if (!img.value.startsWith(opts.imagePrefix)) continue;
      images.push({
        specifier: img.value.slice(opts.imagePrefix.length),
        attr: img.name,
        start: img.valueStart,
        end: img.valueEnd,
        quote: img.quote,
      });
    }
  }

  return { icons, images };
}

interface ParsedAttr {
  name: string;
  value: string;
  valueStart: number;
  valueEnd: number;
  quote: string;
}

function parseAttrs(raw: string, base: number): {
  values: Record<string, string | true>;
  images: ParsedAttr[];
} {
  const values: Record<string, string | true> = {};
  const images: ParsedAttr[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1];
    if (m[2] === undefined) {
      values[name] = true;
      continue;
    }
    const quote = m[2][0];
    const value = m[3] ?? m[4] ?? '';
    values[name] = value;
    const valueStart = base + m.index + m[0].length - value.length - 1;
    images.push({ name, value, valueStart, valueEnd: valueStart + value.length + 2, quote });
  }
  return { values, images };
}

function skipRanges(code: string): SkipRange[] {
  const ranges: SkipRange[] = [];
  const patterns = [/<!--[\s\S]*?-->/g, /<script\b[\s\S]*?<\/script>/gi, /<style\b[\s\S]*?<\/style>/gi];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

function inSkip(ranges: SkipRange[], offset: number): boolean {
  return ranges.some((r) => offset >= r.start && offset < r.end);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) if (code[i] === '\n') line++;
  return line;
}
