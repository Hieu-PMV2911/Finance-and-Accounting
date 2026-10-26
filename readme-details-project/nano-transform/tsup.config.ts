import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/string/index.ts', 'src/object/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
  target: 'es2020',
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
