import MagicString from 'magic-string';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import type { ResolvedOptions, SmartAssetOptions } from './types.js';
import { buildLeftoverProbe, buildProbe, resolveOptions } from './options.js';
import { IconResolver, suggest } from './core/resolver.js';
import { optimizeIcon } from './core/optimize.js';
import { Registry } from './core/registry.js';
import { renderIcon } from './core/render.js';
import { buildSprite, injectIntoSpriteHost, injectPreload, shouldInline } from './core/sprite.js';
import { generateDts, writeDtsIfChanged } from './core/dts.js';
import { pickScanner } from './scan/index.js';

/**
 * The subset of the Rollup/Vite plugin context we rely on.
 *
 * Exported because it appears in the inferred return type of
 * `createSmartAssetPlugin`; a non-exported name makes `declaration: true`
 * fail with TS4058 ("cannot be named"). We deliberately do not import
 * `rollup`/`vite` types so the package stays bundler-agnostic.
 */
export interface Ctx {
  resolve: (source: string, importer?: string) => Promise<{ id: string } | null>;
  addWatchFile: (id: string) => void;
  /** Rollup requires exactly one of `name` (hashed) or `fileName` (explicit). */
  emitFile: (
    file: { type: 'asset'; source: string | Uint8Array } & ({ name: string } | { fileName: string }),
  ) => string;
  getFileName: (refId: string) => string;
  warn: (msg: string) => void;
  error: (msg: string) => never;
}

/** Same reason as {@link Ctx}: it leaks into the public return type. */
export interface ViteServer {
  ws: { send: (payload: { type: string }) => void };
}

/** Second argument of `transformIndexHtml`. Only `server`/`bundle` are used. */
export interface HtmlCtx {
  server?: unknown;
  bundle?: Record<string, { type: string; code?: string }>;
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createSmartAssetPlugin(raw: SmartAssetOptions = {}) {
  let opts: ResolvedOptions | undefined;
  let resolver: IconResolver | undefined;
  const registry = new Registry();
  let root = process.cwd();
  let isBuild = false;
  let server: ViteServer | null = null;
  let dtsTimer: NodeJS.Timeout | null = null;
  /** placeholder → emitted asset refId, resolved in generateBundle */
  const emitted = new Map<string, string>();
  const emittedByPath = new Map<string, string>();
  /**
   * Set by `generateBundle` once the sprite size is known. `transformIndexHtml`
   * runs after it, so the two hooks can agree on one decision without
   * re-deriving it: `null` = not decided yet, '' = inline.
   */
  let spriteUrl: string | null = null;
  let ssrWarned = false;
  /**
   * `configResolved` is a Vite hook. If it never fires, we are running under
   * plain Rollup, where `transformIndexHtml` does not exist — so an HTML-injected
   * sprite would never be emitted and every <use> would point at nothing.
   */
  let isVite = false;
  /** `build.assetsDir`, needed to give the emitted sprite a stable path. */
  let assetsDir = 'assets';

  const init = (): void => {
    if (opts) return;
    opts = resolveOptions(raw, root);
    resolver = new IconResolver(opts);
  };

  const dtsPath = (): string | null => {
    if (!opts || opts.dts === false) return null;
    return isAbsolute(opts.dts) ? opts.dts : `${opts.root}/${opts.dts}`;
  };

  const writeDts = (): void => {
    const file = dtsPath();
    if (!file || !opts) return;
    writeDtsIfChanged(file, generateDts(registry.keys(), opts.frameworks, opts));
  };

  const scheduleDts = (): void => {
    if (dtsTimer) clearTimeout(dtsTimer);
    dtsTimer = setTimeout(writeDts, 200);
    if (typeof dtsTimer.unref === 'function') dtsTimer.unref();
  };

  const handleUnknown = (ctx: Ctx, key: string, id: string, code: string, offset: number): void => {
    // 'passthrough' means the user wants the tag left untouched and takes
    // responsibility for it — not even a warning. Anything else reports.
    if (opts!.onUnknownIcon === 'passthrough') return;

    const parts = resolver!.split(key);
    const candidates = parts ? resolver!.list(parts.collection) : [];
    const hints = parts ? suggest(parts.name, candidates) : [];
    const loadError = parts ? resolver!.failure(parts.collection) : undefined;
    const message =
      `[smart-asset] unknown icon "${key}" (${id}:${lineOf(code, offset)}).` +
      (loadError
        ? `\n  Collection "${parts!.collection}" failed to load: ${loadError}`
        : '') +
      (hints.length && parts
        ? `\n  Did you mean: ${hints.map((h) => `${parts.collection}-${h}`).join(', ')}?`
        : '') +
      `\n  Declared collections: ${resolver!.collections.join(', ')}.` +
      `\n  Local icons are read from: ${opts!.localIconDirs.join(', ')}.`;

    if (opts!.onUnknownIcon === 'throw') throw new Error(message);
    ctx.warn(message);
  };

  /** `smart:./a.png` → URL in dev, emitted asset placeholder in build. */
  const resolveImage = async (
    ctx: Ctx,
    specifier: string,
    importer: string,
    attr: string,
  ): Promise<string | null> => {
    const resolved = await ctx.resolve(specifier, importer);
    if (!resolved) {
      throw new Error(
        `[smart-asset] cannot resolve image "${specifier}" (${attr} in ${importer}).\n` +
        `  Check your bundler alias for "${specifier.split('/')[0]}".`,
      );
    }
    const absPath = resolved.id.split('?')[0];
    ctx.addWatchFile(absPath);

    let size: number;
    try {
      size = statSync(absPath).size;
    } catch {
      throw new Error(
        `[smart-asset] image not found: "${specifier}" → ${absPath} (referenced from ${importer}).`,
      );
    }

    if (size < opts!.maxInlineSize) {
      const buf = readFileSync(absPath);
      const ext = absPath.slice(absPath.lastIndexOf('.')).toLowerCase();
      const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }

    if (!isBuild) {
      const rel = relative(opts!.root, absPath).replace(/\\/g, '/');
      return rel.startsWith('..') ? `/@fs/${absPath.replace(/\\/g, '/')}` : `/${rel}`;
    }

    const cached = emittedByPath.get(absPath);
    if (cached) return cached;

    const name = absPath.slice(absPath.lastIndexOf('/') + 1);
    const refId = ctx.emitFile({ type: 'asset', name, source: readFileSync(absPath) });
    const placeholder = `__SMART_ASSET_${refId}__`;
    emitted.set(placeholder, refId);
    emittedByPath.set(absPath, placeholder);
    return placeholder;
  };

  return {
    name: 'unplugin-smart-asset',
    // MANDATORY. Without enforce:'pre', vite:esbuild strips JSX before this
    // plugin runs: the build stays green and every icon silently disappears.
    enforce: 'pre' as const,

    configResolved(config: {
      root: string;
      command: string;
      build?: { ssr?: boolean; lib?: boolean | object; assetsDir?: string };
    }) {
      isVite = true;
      root = config.root;
      isBuild = config.command === 'build';
      if (config.build?.assetsDir) assetsDir = config.build.assetsDir;
      init();

      // SSR / library builds never run `transformIndexHtml`, so an HTML-injected
      // sprite would simply not exist and every <use> would point at nothing.
      const isSsr = Boolean(config.build?.ssr || config.build?.lib);
      if (isSsr && opts!.inject === 'auto') {
        opts!.inject = 'component';
        if (!ssrWarned) {
          ssrWarned = true;
          console.warn(
            '[smart-asset] SSR/lib build detected: sprite injection switched from "html" to "component".\n' +
            '  Render <SmartAssetSprite /> once in your root layout. sprite.svg is written at build end.',
          );
        }
      }
    },

    configureServer(devServer: ViteServer) {
      server = devServer;
    },

    buildStart() {
      init();

      // Rollup has no HTML pipeline: without this the build stays green while
      // every icon renders blank. Switch to component injection, which writes
      // sprite.svg at build end for <SmartAssetSprite /> to read.
      if (!isVite && opts!.inject === 'auto') {
        opts!.inject = 'component';
        if (!ssrWarned) {
          ssrWarned = true;
          console.warn(
            '[smart-asset] Rollup detected (no transformIndexHtml): sprite injection switched ' +
            'from "html" to "component".\n' +
            '  Render <SmartAssetSprite /> once in your layout. sprite.svg is written at build end.',
          );
        }
      }

      registry.reset();
      emitted.clear();
      emittedByPath.clear();
    },

    async transform(this: Ctx, code: string, id: string) {
      init();
      if (id.includes('node_modules')) return null;

      const pick = pickScanner(id, opts!);
      if (!pick) return null;
      if (!buildProbe(opts!).test(code)) return null;

      registry.clearModule(id);
      const { icons, images } = pick.scan(code, id, opts!);

      if (!icons.length && !images.length) {
        // Prefilter matched but the scanner found nothing → scanner bug, not a
        // clean file. Returning null here would hide it forever.
        if (buildLeftoverProbe(opts!).test(code)) {
          throw new Error(
            `[smart-asset] ${id}: an icon tag is present but the scanner matched nothing. ` +
            `This is a plugin bug — please report it with this file.`,
          );
        }
        return null;
      }

      const s = new MagicString(code);
      let changed = false;

      for (const ref of icons) {
        const resolved = resolver!.resolve(ref.key);
        if (!resolved) {
          handleUnknown(this, ref.key, id, code, ref.start);
          continue;
        }
        const data = optimizeIcon(resolved.svg, ref.key, opts!.svgo);
        registry.add(ref.key, data, id);
        changed = true;

        s.overwrite(ref.start, ref.end, renderIcon(ref.key, data.viewBox, ref.attrs, pick.framework));
        if (ref.close) s.overwrite(ref.close[0], ref.close[1], '');
      }

      for (const image of images) {
        const url = await resolveImage(this, image.specifier, id, image.attr);
        if (url === null) continue;
        s.overwrite(image.start, image.end, `${image.quote}${url}${image.quote}`);
        changed = true;
      }

      if (changed) {
        scheduleDts();
        if (!isBuild && server) {
          const ws = server.ws;
          // A new icon means the injected sprite is stale.
          setTimeout(() => ws.send({ type: 'full-reload' }), 30);
        }
      } else {
        // Nothing was rewritten (e.g. every tag was an unknown icon in 'warn'
        // mode). Returning a result anyway would invalidate downstream caches
        // and trigger pointless HMR work for an unchanged module.
        return null;
      }

      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },

    transformIndexHtml: {
      // 'post', NOT 'pre'. Vite processes index.html *before* it transforms
      // any module, so a 'pre' handler sees an empty registry and injects
      // nothing — every <use href> then points at a symbol that never shipped.
      order: 'post' as const,
      handler(this: Ctx, html: string, ctx: HtmlCtx) {
        init();
        if (!registry.size) return html;
        if (opts!.inject === 'component' || opts!.inject === 'none') return html;

        const sprite = buildSprite(registry.sorted(), opts!);

        // Dev server has no bundle and no emitted files: always inline there,
        // so an external sprite never 404s on HMR.
        const canEmit = typeof this.emitFile === 'function' && !ctx?.server;

        if (!canEmit || shouldInline(sprite.bytes, opts!)) {
          return injectIntoSpriteHost(html, sprite.html);
        }

        const hash = createHash('sha1').update(sprite.html).digest('hex').slice(0, 8);
        const refId = this.emitFile({
          type: 'asset',
          fileName: `${assetsDir}/smart-sprite-${hash}.svg`,
          source: sprite.html,
        });
        const url = `/${this.getFileName(refId)}`;
        spriteUrl = url;
        if (opts!.verbose) {
          console.log(`[smart-asset] sprite is ${sprite.bytes} B > inlineMaxBytes, emitted ${url}`);
        }

        // The symbols now live in an external document, so same-document
        // `href="#id"` would resolve to nothing. Rewrite the emitted chunks.
        //
        // Match the opening quote rather than a literal `href="`: minifiers
        // rewrite double-quoted literals to backticks, so `href="#smart-icon-`
        // matches nothing in a production chunk.
        if (ctx?.bundle) {
          const ref = /(["'`])#smart-icon-/g;
          for (const item of Object.values(ctx.bundle)) {
            const chunk = item as { type: string; code?: string };
            if (chunk.type !== 'chunk' || !chunk.code) continue;
            chunk.code = chunk.code.replace(ref, `$1${url}#smart-icon-`);
          }
        }

        return opts!.sprite.preload ? injectPreload(html, url) : html;
      },
    },

    generateBundle(
      this: Ctx,
      _output: unknown,
      bundle: Record<string, { type: string; code?: string; source?: string | Uint8Array; fileName?: string }>,
    ) {
      init();

      // Resolve emitted image placeholders now that file names are known.
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk' || !item.code) continue;
        let code = item.code;
        for (const [placeholder, refId] of emitted) {
          if (!code.includes(placeholder)) continue;
          code = code.split(placeholder).join(`/${this.getFileName(refId)}`);
        }
        item.code = code;
      }

      // Last safety net: several frameworks compile unknown tags without a
      // word, so a leftover tag means the UI is broken even though the build is green.
      //
      // Skipped when the user asked for 'passthrough' (they intend to keep the
      // tag) or disabled the assertion explicitly. Failing here regardless would
      // make `onUnknownIcon: 'passthrough'` impossible to use.
      if (!opts!.assertNoLeftover || opts!.onUnknownIcon === 'passthrough') return;

      const leftover = buildLeftoverProbe(opts!);
      for (const [file, item] of Object.entries(bundle)) {
        const text = item.type === 'chunk'
          ? item.code
          : typeof item.source === 'string' ? item.source : '';
        if (!text) continue;
        leftover.lastIndex = 0;
        const match = leftover.exec(text);
        if (match) {
          this.error(
            `[smart-asset] ${file}: unprocessed icon tag ${match[0]} reached the output.\n` +
            `  Most likely enforce:'pre' was removed, or this is an SSR/lib build ` +
            `that needs <SmartAssetSprite />.`,
          );
        }
      }
    },

    buildEnd() {
      writeDts();

      // `<SmartAssetSprite />` reads this file, so SSR/component mode must have
      // it on disk by the time the server bundle runs.
      if (opts && opts.inject === 'component' && registry.size) {
        const file = `${opts.root}/sprite.svg`;
        const sprite = buildSprite(registry.sorted(), opts).html;
        try {
          writeFileSync(file, sprite);
        } catch (err) {
          console.warn(`[smart-asset] could not write ${file}: ${(err as Error).message}`);
        }
      }
    },
  };
}

function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) if (code[i] === '\n') line++;
  return line;
}
