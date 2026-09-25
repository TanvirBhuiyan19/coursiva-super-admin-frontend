// Bundle budgets — fails CI when the build grows past agreed limits.
// "Initial" = everything index.html loads before the app can render (entry + modulepreloads + CSS),
// measured Brotli-compressed, which is what users actually download.
// Run after a build: `npm run build && npm run size`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';
const KB = 1024;

/** Budgets in KB (brotli). Raise only with a justification in the PR. */
const BUDGETS = {
  initialJs: 125,
  initialCss: 12,
  anyPageChunk: 20,
  anyChunk: 70,
};

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!);
const size = (file: string) => brotliCompressSync(readFileSync(join(DIST, file))).length;

const initialJs = refs.filter((f) => f.endsWith('.js'));
const initialCss = refs.filter((f) => f.endsWith('.css'));
const assets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));

const rows: [string, number, number][] = [];
const total = (files: string[]) => files.reduce((s, f) => s + size(f), 0) / KB;
rows.push(['Initial JS (entry + preloads)', total(initialJs), BUDGETS.initialJs]);
rows.push(['Initial CSS', total(initialCss), BUDGETS.initialCss]);

const pageChunks = assets.filter((f) => f.includes('.page-'));
const biggestPage = pageChunks.map((f) => [f, size(`assets/${f}`) / KB] as const).sort((a, b) => b[1] - a[1])[0];
if (biggestPage) rows.push([`Largest page chunk (${biggestPage[0]})`, biggestPage[1], BUDGETS.anyPageChunk]);

// The mock API chunk only exists in demo builds and never loads in production, so it is exempt.
const shipped = assets.filter((f) => !/^(browser|handlers)-/.test(f));
const biggest = shipped.map((f) => [f, size(`assets/${f}`) / KB] as const).sort((a, b) => b[1] - a[1])[0];
if (biggest) rows.push([`Largest chunk (${biggest[0]})`, biggest[1], BUDGETS.anyChunk]);

let failed = false;
for (const [label, kb, budget] of rows) {
  const ok = kb <= budget;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(60)} ${kb.toFixed(1).padStart(7)} KB  (budget ${budget} KB)`);
}
console.log(`\nInitial files: ${initialJs.length} JS, ${initialCss.length} CSS`);
if (failed) {
  console.error('\nBundle budget exceeded.');
  process.exit(1);
}
