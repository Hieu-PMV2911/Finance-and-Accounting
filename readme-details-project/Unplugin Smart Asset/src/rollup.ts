import type { SmartAssetOptions } from './types.js';
import { createSmartAssetPlugin } from './plugin.js';

/**
 * Rollup entry: `import SmartAsset from 'unplugin-smart-asset/rollup'`.
 *
 * Rollup has no `transformIndexHtml`, so there is nowhere to inject a sprite.
 * The plugin detects that `configResolved` never ran and switches `inject` to
 * `'component'`, writing `sprite.svg` at build end for `<SmartAssetSprite />`.
 * Without that, the build would be green and every icon blank.
 */
export default function SmartAsset(options: SmartAssetOptions = {}) {
  return createSmartAssetPlugin(options);
}
export type { SmartAssetOptions };
