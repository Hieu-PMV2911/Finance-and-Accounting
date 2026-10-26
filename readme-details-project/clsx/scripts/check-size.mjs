import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/** Hard budget from the specification, in gzipped bytes. */
const LIMIT = 230;
const FILES = ['dist/index.mjs', 'dist/lite.mjs'];

let failed = false;

for (const file of FILES) {
  const bytes = gzipSync(readFileSync(file), { level: 9 }).length;
  const ok = bytes <= LIMIT;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file.padEnd(15)} ${String(bytes).padStart(3)} B gzip (limit ${LIMIT} B)`);
}

if (failed) {
  console.error('\nBundle size budget exceeded.');
  process.exit(1);
}
