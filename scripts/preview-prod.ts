// Production-like local preview: serves the real production build (no mock code in the browser)
// exactly as deploy/nginx.conf does — pre-compressed Brotli/gzip, immutable asset caching, SPA fallback —
// and answers the API with the mock handlers running server-side (same contract, same latency).
//
//   npm run build && npm run preview:prod        → http://localhost:4174   (PORT to override)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getResponse, type RequestHandler } from 'msw';

const DIST = process.env.DIST ?? 'dist';
const PORT = Number(process.env.PORT ?? 4174);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

// Load the mock handlers through Vite's SSR loader (resolves `@/` aliases and import.meta.glob).
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { handlers } = (await vite.ssrLoadModule('/src/mocks/handlers.ts')) as { handlers: RequestHandler[] };

async function handleApi(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
  });
  const response = await getResponse(handlers, request);
  if (!response) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"message":"Not found."}');
    return;
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(DIST)) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (file.endsWith('.map')) return res.writeHead(404).end();

  const isAsset = url.pathname.startsWith('/assets/');
  const headers: Record<string, string> = {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept-Encoding',
  };
  const accept = req.headers['accept-encoding'] ?? '';
  for (const [enc, ext] of [
    ['br', '.br'],
    ['gzip', '.gz'],
  ] as const) {
    if (accept.includes(enc) && existsSync(file + ext)) {
      headers['Content-Encoding'] = enc;
      res.writeHead(200, headers);
      createReadStream(file + ext).pipe(res);
      return;
    }
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

createHttpServer((req, res) => {
  const path = req.url ?? '/';
  if (path.startsWith('/api/') || path.startsWith('/sanctum/')) {
    handleApi(req, res).catch((err: unknown) => {
      console.error(err);
      res.writeHead(500).end();
    });
  } else serveStatic(req, res);
}).listen(PORT, () => console.log(`Production preview (mock API server-side): http://localhost:${PORT}`));
