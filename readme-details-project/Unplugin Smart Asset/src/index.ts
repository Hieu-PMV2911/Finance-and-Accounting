export { createSmartAssetPlugin } from './plugin.js';
export { resolveOptions, detectFrameworks } from './options.js';
export { optimizeIcon, classify } from './core/optimize.js';
export { IconResolver } from './core/resolver.js';
export { buildSprite } from './core/sprite.js';
export { generateDts } from './core/dts.js';
export type {
  SmartAssetOptions,
  ResolvedOptions,
  FrameworkName,
  IconData,
  IconRef,
  ImageRef,
  ScanResult,
  SpriteOptions,
} from './types.js';
