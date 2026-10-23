export type FrameworkName = 'react' | 'preact' | 'solid' | 'vue' | 'svelte' | 'html';

export type UnknownIconBehavior = 'throw' | 'warn' | 'passthrough';

export interface SpriteOptions {
  /** id of the injected sprite root element */
  id?: string;
  /** 'auto' = inline when the sprite is <= inlineMaxBytes */
  mode?: 'inline' | 'file' | 'auto';
  inlineMaxBytes?: number;
  /** reuse one <symbol> when two icons have identical bodies */
  dedupe?: boolean;
  /** emit <link rel="preload"> when the sprite is a file */
  preload?: boolean;
}

export interface SmartAssetOptions {
  frameworks?: 'auto' | FrameworkName[];
  iconPrefix?: string;
  colonAlias?: boolean;
  collections?: Record<string, string>;
  localIconDirs?: string[];
  localCollection?: string;
  onUnknownIcon?: UnknownIconBehavior;
  maxInlineSize?: number;
  imagePrefix?: string;
  imageAttrs?: string[];
  sprite?: SpriteOptions;
  inject?: 'auto' | 'html' | 'component' | 'none';
  dts?: string | false;
  allowUnknownIcons?: boolean;
  svgo?: { plugins?: unknown[] } | false;
  assertNoLeftover?: boolean;
  verbose?: boolean;
}

export interface ResolvedOptions {
  root: string;
  frameworks: FrameworkName[];
  iconPrefix: string;
  colonAlias: boolean;
  collections: Record<string, string>;
  localIconDirs: string[];
  localCollection: string;
  onUnknownIcon: UnknownIconBehavior;
  maxInlineSize: number;
  imagePrefix: string;
  imageAttrs: string[];
  sprite: Required<SpriteOptions>;
  inject: 'auto' | 'html' | 'component' | 'none';
  dts: string | false;
  allowUnknownIcons: boolean;
  svgo: { plugins?: unknown[] } | false;
  assertNoLeftover: boolean;
  verbose: boolean;
}

/** A single `<icon-collection-name />` occurrence in a source file. */
export interface IconRef {
  /** collection + name, e.g. `lucide-home` */
  key: string;
  /** attributes to forward onto the generated <svg> */
  attrs: Record<string, string | true>;
  /** absolute range of the opening element */
  start: number;
  end: number;
  /** absolute range of the closing element, when the tag is paired */
  close?: [number, number];
}

/** A `src="smart:..."` occurrence. */
export interface ImageRef {
  specifier: string;
  attr: string;
  /** absolute range of the attribute value including quotes */
  start: number;
  end: number;
  quote: string;
}

export interface ScanResult {
  icons: IconRef[];
  images: ImageRef[];
}

export interface IconData {
  viewBox: string;
  body: string;
  kind: 'fill' | 'stroke';
  /** attributes that must live on <symbol> so currentColor works */
  symbolAttrs: string;
}
