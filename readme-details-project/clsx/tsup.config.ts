import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/lite.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
  target: 'es2018',
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
