import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { MOCK_API_PREFIX, MOCK_TOKEN } from './mock-api-shared.ts';

const SIGNING_SECRET = 'mock-signing-secret';
const PRESIGN_TTL_MS = 60_000;

function hue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return value;
}

function renderSvg(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" rx="16" fill="hsl(${hue(name)} 60% 50%)"/><text x="120" y="88" font-family="system-ui, sans-serif" font-size="24" fill="#fff" text-anchor="middle">${name}</text></svg>`;
}

function sign(name: string, expires: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(`${name}:${expires}`).digest('hex');
}

function hasValidSignature(name: string, url: URL): boolean {
  const expires = url.searchParams.get('expires') ?? '';
  const signature = url.searchParams.get('sig') ?? '';
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  if (!/^[0-9a-f]+$/.test(signature)) return false;
  const expected = Buffer.from(sign(name, expires), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function send(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles a request under {@link MOCK_API_PREFIX} and returns `false` for any other path.
 *
 * - `GET /mock-api/images/:name` requires `Authorization: Bearer <MOCK_TOKEN>` and returns an SVG.
 *   `?status=<code>` forces a status code and `?body=broken` returns bytes that are not an image.
 * - `GET /mock-api/presign/:name` requires the token and returns `{ url }`, a signed URL that is
 *   valid for 60 seconds.
 * - `GET /mock-api/signed/:name?expires=&sig=` returns the SVG when the signature is valid.
 * - `?delay=<ms>` delays any response.
 */
export async function handleMockApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(`${MOCK_API_PREFIX}/`)) return false;

  const delay = Number(url.searchParams.get('delay') ?? '0');
  if (delay > 0) await sleep(delay);

  const [kind, name, ...rest] = url.pathname.slice(MOCK_API_PREFIX.length + 1).split('/');
  if (!kind || !name || rest.length > 0 || !/^[\w-]+$/.test(name)) {
    send(res, 404, 'text/plain', 'Not Found');
    return true;
  }

  const authorized = req.headers.authorization === `Bearer ${MOCK_TOKEN}`;

  if (kind === 'images') {
    if (!authorized) send(res, 401, 'text/plain', 'Unauthorized');
    else if (url.searchParams.has('status')) {
      send(res, Number(url.searchParams.get('status')), 'text/plain', 'Forced status');
    } else if (url.searchParams.get('body') === 'broken') {
      send(res, 200, 'image/png', 'this is not an image');
    } else send(res, 200, 'image/svg+xml', renderSvg(name));
    return true;
  }

  if (kind === 'presign') {
    if (!authorized) {
      send(res, 401, 'text/plain', 'Unauthorized');
      return true;
    }
    const expires = String(Date.now() + PRESIGN_TTL_MS);
    const signedUrl = `${MOCK_API_PREFIX}/signed/${name}?expires=${expires}&sig=${sign(name, expires)}`;
    send(res, 200, 'application/json', JSON.stringify({ url: signedUrl }));
    return true;
  }

  if (kind === 'signed') {
    if (hasValidSignature(name, url)) send(res, 200, 'image/svg+xml', renderSvg(name));
    else send(res, 403, 'text/plain', 'Forbidden');
    return true;
  }

  send(res, 404, 'text/plain', 'Not Found');
  return true;
}

/** Vite plugin that serves the mock image API on the dev server and in browser tests. */
export function mockApi(): Plugin {
  return {
    name: 'authenticated-image:mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleMockApi(req, res).then((handled) => {
          if (!handled) next();
        }, next);
      });
    },
  };
}
