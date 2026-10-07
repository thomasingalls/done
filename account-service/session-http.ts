/** Separate opt-in surface. The development bearer and operation routes are not mounted here. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountSessions } from './sessions.ts';
import { validatePolicy, type Policy } from './webauthn.ts';
import {
  SESSION_REQUEST_LIMIT,
  type SessionOperation,
  type SessionResult,
} from '../account-protocol/session.ts';

export function createSessionHandler(sessions: AccountSessions, policy: Policy) {
  validatePolicy(policy);
  const origin = policy.origin,
    host = new URL(origin).host;
  const operations = new Set<SessionOperation>([
    'begin',
    'finish',
    'cancel',
    'acknowledge',
    'renew',
    'revoke',
  ]);
  let active = 0,
    budget = 120,
    last = performance.now();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, result: unknown) => {
      if (!response.destroyed && !response.writableEnded) {
        if (status >= 400) response.setHeader('Connection', 'close');
        response.writeHead(status).end(JSON.stringify(result));
      }
    };
    const operation = request.url?.slice('/account/session/v1/'.length) as SessionOperation;
    if (!request.url?.startsWith('/account/session/v1/') || !operations.has(operation))
      return void send(404, { ok: false, refusal: 'not-found' });
    if (
      request.method !== 'POST' ||
      request.headers.host !== host ||
      request.headers.origin !== origin ||
      request.headers['content-type'] !== 'application/json' ||
      request.headers['content-encoding']
    )
      return void send(403, { ok: false, refusal: 'malformed' });
    const now = performance.now();
    budget = Math.min(120, budget + ((now - last) * 2) / 1000);
    last = now;
    if (active >= 16 || budget < 1) {
      response.setHeader('Retry-After', '1');
      return void send(429, { ok: false, refusal: 'capacity' });
    }
    budget--;
    active++;
    const timer = setTimeout(() => {
      response.destroy();
      request.destroy();
    }, 10000);
    timer.unref();
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > SESSION_REQUEST_LIMIT) {
          response.setHeader('Connection', 'close');
          send(413, { ok: false, refusal: 'malformed' });
          return;
        }
        chunks.push(chunk);
      }
      let value: unknown;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return void send(400, { ok: false, refusal: 'malformed' });
      }
      // Disconnect is an unknown outcome, never cancellation of an already-started transaction.
      const result: SessionResult = await sessions.run(operation, value);
      const status = result.ok
        ? 200
        : result.refusal === 'storage-unavailable'
          ? 503
          : result.refusal === 'capacity'
            ? 429
            : result.refusal === 'sign-in-required'
              ? 401
              : result.refusal === 'invalid-proof'
                ? 403
                : result.refusal === 'malformed'
                  ? 400
                  : 409;
      send(status, result);
    } catch {
      send(503, { ok: false, refusal: 'storage-unavailable' });
    } finally {
      clearTimeout(timer);
      active--;
    }
  };
}
