import type { FrameworkName, ResolvedOptions, ScanResult } from '../types.js';
import { scanJsx } from './jsx.js';
import { scanVue } from './vue.js';
import { scanSvelte } from './svelte.js';
import { scanHtml } from './html.js';

export interface ScannerPick {
  framework: FrameworkName;
  scan: (code: string, id: string, opts: ResolvedOptions) => ScanResult;
}

export function pickScanner(id: string, opts: ResolvedOptions): ScannerPick | null {
  const clean = id.split('?')[0];
  const jsxFramework = (['react', 'preact', 'solid'] as FrameworkName[])
    .find((f) => opts.frameworks.includes(f));

  if (/\.(tsx|jsx|mdx)$/.test(clean)) {
    if (!jsxFramework) return null;
    return { framework: jsxFramework, scan: scanJsx };
  }
  if (clean.endsWith('.vue')) {
    if (!opts.frameworks.includes('vue')) return null;
    return { framework: 'vue', scan: scanVue };
  }
  if (clean.endsWith('.svelte')) {
    if (!opts.frameworks.includes('svelte')) return null;
    return { framework: 'svelte', scan: scanSvelte };
  }
  if (/\.(html|htm)$/.test(clean)) {
    return { framework: 'html', scan: scanHtml };
  }
  return null;
}
