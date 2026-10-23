import type { SmartAssetOptions } from './types.js';
import { createSmartAssetPlugin } from './plugin.js';

/**
 * Vite entry: `import SmartAsset from 'unplugin-smart-asset/vite'`.
 * The plugin injects the sprite through `transformIndexHtml`.
 */
export default function SmartAsset(options: SmartAssetOptions = {}) {
  return createSmartAssetPlugin(options);
}
export type { SmartAssetOptions };
