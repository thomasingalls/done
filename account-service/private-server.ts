import { createDiagnostics, causeCode } from '../account-protocol/diagnostics.ts';
import {
  decodeSubmit,
  SUBMIT_BODY_LIMIT,
  READ_REQUEST_LIMIT,
} from '../account-protocol/deliveryTransport.ts';
import { ADMISSION_LIMIT } from '../account-protocol/admission.ts';
import type { PrivateAuthority } from './authority.ts';
import type { Policy } from './webauthn.ts';
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
  /** Explicitly provisioned owner; omitted means the bootstrap route is unavailable. */
  authority?: (policy: Policy) => PrivateAuthority;
}) {
  const token = bytes(options.token, 32, 32);
  const diagnostics = createDiagnostics();
  let core: AccountCore;
  let authority: PrivateAuthority | undefined;
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
    const deliveryRoute =
      request.url === '/account/delivery/submit' ||
      request.url === '/account/delivery/read' ||
      request.url === '/account/delivery/read-v2';
    try {
      const supplied = request.headers.authorization?.replace(/^Bearer /, '');
      if (
        request.headers.origin !== origin ||
        request.headers['content-type'] !==
          (deliveryRoute ? 'application/octet-stream' : 'application/json') ||
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
        if (
          size >
          (deliveryRoute
            ? request.url === '/account/delivery/submit'
              ? SUBMIT_BODY_LIMIT
              : READ_REQUEST_LIMIT
            : [
                  '/account/promotion/begin',
                  '/account/promotion/finish',
                  '/account/promotion/challenge',
                ].includes(request.url ?? '')
              ? ADMISSION_LIMIT
              : 131072)
        ) {
          send(413, refuse('malformed'));
          return;
        }
        parts.push(part);
      }
      const body = new Uint8Array(Buffer.concat(parts));
      if (deliveryRoute) {
        const result =
          request.url === '/account/delivery/submit'
            ? await authority?.decideSubmission(core, decodeSubmit(body))
            : request.url === '/account/delivery/read-v2'
              ? await authority?.readInbound(core, body)
              : await authority?.readAccepted(core, body);
        if (result?.kind === 'decision') {
          response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          response.end(result.bytes);
        } else {
          const reason = result?.reason ?? 'unavailable';
          diagnostics.record({
            operation:
              request.url === '/account/delivery/submit'
                ? 'submit'
                : request.url === '/account/delivery/read-v2'
                  ? 'read-v2'
                  : 'read',
            phase: 'response',
            code: reason,
          });
          send(409, { v: 1, kind: 'unknown', reason });
        }
        return;
      }
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (!object(input)) {
        send(400, refuse('malformed'));
        return;
      }
      const route = request.url;
      const result =
        route === '/account/promotion/binding'
          ? ((await authority?.promotionBinding(core, input)) ?? null)
          : route === '/account/promotion/begin'
            ? ((await authority?.beginPromotion(core, input)) ?? null)
            : route === '/account/promotion/challenge'
              ? ((await authority?.challengePromotion(core, input)) ?? null)
              : route === '/account/promotion/finish'
                ? ((await authority?.finishPromotion(core, input)) ?? null)
                : route === '/account/preparation/inspect'
                  ? (authority?.pending(core, input) ?? null)
                  : route === '/account/preparation/abandon'
                    ? (authority?.pending(core, input, true) ?? null)
                    : route === '/account/authority/prove'
                      ? (authority?.prove(input) ?? null)
                      : route === '/account/recovery/begin'
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
      send('ok' in result && !result.ok ? 409 : 200, result);
    } catch (cause) {
      diagnostics.record({ operation: 'http', phase: 'request', code: causeCode(cause) });
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
    const policy = { rpId: 'localhost', origin };
    core = new AccountCore(options.path, policy, options.instrumentation);
    try {
      authority = options.authority?.(policy);
      if (authority && (authority.pin.origin !== origin || authority.pin.rpId !== policy.rpId))
        throw Error('Authority policy differs from account service');
    } catch (error) {
      authority?.close();
      core.close();
      throw error;
    }
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    origin,
    core,
    diagnostics: () => ({ http: diagnostics.read(), core: core.diagnostics }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          authority?.close();
          core.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
