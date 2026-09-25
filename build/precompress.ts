// Emits Brotli (.br) and gzip (.gz) siblings for every compressible build asset, so the web server can
// serve pre-compressed files (nginx `brotli_static` / `gzip_static`) with zero CPU per request.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|txt)$/;
const MIN_BYTES = 1024;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function precompress(): Plugin {
  let outDir = 'dist';
  return {
    name: 'coursiva:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const file of walk(outDir)) {
        if (!COMPRESSIBLE.test(file)) continue;
        const source = readFileSync(file);
        if (source.length < MIN_BYTES) continue;
        writeFileSync(`${file}.br`, brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(source, { level: 9 }));
      }
    },
  };
}
