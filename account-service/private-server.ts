import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AccountCore } from './core.ts';
import { bytes, object, refuse } from './protocol.ts';

/** Disposable/private adapter. It is not mounted by the personal app or legacy relay. */
export async function createPrivateAccountServer(options: {
  path: string;
  port?: number;
  token: string;
  instrumentation?: ConstructorParameters<typeof AccountCore>[2];
}) {
  const token = bytes(options.token, 32, 32);
  let core: AccountCore;
  let origin: string;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; connect-src 'self'",
    );
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.headers.host !== new URL(origin).host) {
      send(403, refuse('malformed'));
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Disposable account harness</title>');
      return;
    }
    if (request.method !== 'POST') {
      send(405, refuse('malformed'));
      return;
    }
    try {
      const supplied = request.headers.authorization?.replace(/^Bearer /, '');
      if (
        request.headers.origin !== origin ||
        request.headers['content-type'] !== 'application/json' ||
        !timingSafeEqual(bytes(supplied, 32, 32), token)
      ) {
        send(403, refuse('malformed'));
        return;
      }
    } catch {
      send(403, refuse('malformed'));
      return;
    }
    try {
      const parts: Buffer[] = [];
      let size = 0;
      for await (const part of request) {
        size += part.length;
        if (size > 131072) {
          send(413, refuse('malformed'));
          return;
        }
        parts.push(part);
      }
      const input: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)),
      );
      if (!object(input)) {
        send(400, refuse('malformed'));
        return;
      }
      const route = request.url;
      const result =
        route === '/account/recovery/begin'
          ? await core.beginRecovery(input)
          : route === '/account/recovery/resume'
            ? core.resumeRecovery(input)
            : route === '/account/recovery/cancel'
              ? core.cancelRecovery(input)
              : route === '/account/recovery/finish'
                ? await core.finishRecovery(input)
                : route === '/account/begin'
                  ? core.begin(input)
                  : route === '/account/resume'
                    ? core.resume(input)
                    : route === '/account/cancel'
                      ? core.cancel(input)
                      : route === '/account/finish'
                        ? await core.finish(input)
                        : null;
      if (!result) {
        send(404, refuse('malformed'));
        return;
      }
      send(result.ok ? 200 : 409, result);
    } catch {
      send(400, refuse('malformed'));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing private listener');
  origin = `http://localhost:${address.port}`;
  try {
    core = new AccountCore(options.path, { rpId: 'localhost', origin }, options.instrumentation);
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    origin,
    core,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          core.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
