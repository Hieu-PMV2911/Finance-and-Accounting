import type { IconData } from '../types.js';

interface Entry {
  data: IconData;
  /** modules that currently reference this icon */
  modules: Set<string>;
}

/**
 * Tracks which icons are used, and by which module.
 * The per-module set is what makes HMR correct: when a file stops using an icon,
 * that icon must leave the sprite instead of lingering forever.
 */
export class Registry {
  private entries = new Map<string, Entry>();
  private byModule = new Map<string, Set<string>>();

  add(key: string, data: IconData, moduleId: string): void {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { data, modules: new Set() };
      this.entries.set(key, entry);
    }
    entry.modules.add(moduleId);
    let set = this.byModule.get(moduleId);
    if (!set) {
      set = new Set();
      this.byModule.set(moduleId, set);
    }
    set.add(key);
  }

  /** Called before re-scanning a module, so removed icons actually disappear. */
  clearModule(moduleId: string): void {
    const keys = this.byModule.get(moduleId);
    if (!keys) return;
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.modules.delete(moduleId);
      if (entry.modules.size === 0) this.entries.delete(key);
    }
    this.byModule.delete(moduleId);
  }

  reset(): void {
    this.entries.clear();
    this.byModule.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return [...this.entries.keys()].sort();
  }

  /** Sorted so the sprite is byte-identical between builds. */
  sorted(): Array<[string, IconData]> {
    return this.keys().map((k) => [k, this.entries.get(k)!.data]);
  }

  data(key: string): IconData | undefined {
    return this.entries.get(key)?.data;
  }

  usage(): Array<{ key: string; uses: number; bytes: number }> {
    return this.sorted().map(([key, data]) => ({
      key,
      uses: this.entries.get(key)!.modules.size,
      bytes: Buffer.byteLength(data.body, 'utf8'),
    }));
  }
}
