/** Session/grant-protected routes only. The live development host has not switched to this
 * adapter. Setup/bootstrap capabilities need explicit composition; there is no private bearer
 * fallback and no /access endpoint here. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccountCore } from './core.ts';
import type { PrivateAuthority } from './authority.ts';
import { parseAuthorityPin, type AuthorityPin } from '../account-protocol/authority.ts';
import { CONTENT_CHECKPOINT_LIMIT } from '../account-protocol/contentCheckpoint.ts';
import { CEREMONY_RELAY_LIMIT } from '../account-protocol/ceremonyRelay.ts';
import { CONTENT_DELIVERY_LIMIT } from '../account-protocol/contentDelivery.ts';
import {
  decodeSubmit,
  SUBMIT_BODY_LIMIT,
  READ_REQUEST_LIMIT,
} from '../account-protocol/deliveryTransport.ts';
import type { GrantRefusal } from '../account-protocol/scopedGrant.ts';
import type { OperationAuthorization } from './authorization.ts';
import type { GrantScope } from '../account-protocol/scopedGrant.ts';
import type { AccountNotifications } from './notifications.ts';
import { AuthorizationRefused } from './authorization.ts';
import { createSessionHandler } from './session-http.ts';

export function createScopedAccountHandler(
  core: AccountCore,
  authority: PrivateAuthority,
  inputPin: AuthorityPin,
  notifications?: AccountNotifications,
) {
  const pin = parseAuthorityPin(inputPin),
    host = new URL(pin.origin).host;
  const session = createSessionHandler(core.sessions, pin);
  const jsonRoutes = new Map<
    string,
    {
      limit: number;
      run: (value: unknown, token: string, authorization: OperationAuthorization) => unknown;
    }
  >([
    [
      '/account/grant/v1/begin',
      { limit: 4096, run: (v, token) => authority.beginGrant(core, token, v) },
    ],
    ['/account/grant/v1/finish', { limit: 4096, run: (v, token) => core.grants.finish(token, v) }],
    [
      '/__account-setup/ceremony/exchange',
      {
        limit: CEREMONY_RELAY_LIMIT,
        run: (v, _token, authorization) => authority.relayCeremony(core, v, authorization),
      },
    ],
    [
      '/__account-setup/ceremony/transfer',
      {
        limit: CONTENT_DELIVERY_LIMIT,
        run: (v, _token, authorization) => authority.transferContent(core, v, authorization),
      },
    ],
    [
      '/__account-setup/content/checkpoint',
      {
        limit: CONTENT_CHECKPOINT_LIMIT,
        run: (v, _token, authorization) => authority.exchangeCheckpoint(core, v, authorization),
      },
    ],
    [
      '/__account-setup/enrollment/admit',
      {
        limit: 4096,
        run: (v, _token, authorization) => authority.admitPrepared(core, v, authorization),
      },
    ],
    ...['/account/authority/discover', '/__account-setup/authority/discover'].map(
      (path) =>
        [
          path,
          {
            limit: 4096,
            run: (v: unknown, _token: string, authorization: OperationAuthorization) =>
              authority.discoverAuthority(core, v, authorization),
          },
        ] as const,
    ),
  ]);
  const binaryRoutes = new Map([
    [
      '/account/delivery/submit',
      {
        limit: SUBMIT_BODY_LIMIT,
        run: (v: Uint8Array<ArrayBuffer>, _token: string, authorization: OperationAuthorization) =>
          authority.decideSubmission(core, decodeSubmit(v), authorization),
      },
    ],
    [
      '/account/delivery/read',
      {
        limit: READ_REQUEST_LIMIT,
        run: (v: Uint8Array<ArrayBuffer>, _token: string, authorization: OperationAuthorization) =>
          authority.readAccepted(core, v, authorization),
      },
    ],
    [
      '/account/delivery/read-v2',
      {
        limit: READ_REQUEST_LIMIT,
        run: (v: Uint8Array<ArrayBuffer>, _token: string, authorization: OperationAuthorization) =>
          authority.readInbound(core, v, authorization),
      },
    ],
  ]);
  let active = 0,
    budget = 120,
    last = performance.now();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.url?.startsWith('/account/session/v1/')) {
      try {
        return await session(request, response);
      } finally {
        notifications?.reconcile();
      }
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      if (status >= 400) response.setHeader('Connection', 'close');
      response.writeHead(status).end(JSON.stringify(body));
    };
    const authFailure = (refusal: GrantRefusal) =>
      send(
        refusal === 'capacity'
          ? 429
          : refusal === 'storage-unavailable'
            ? 503
            : ['grant-required', 'access-required', 'sign-in-required'].includes(refusal)
              ? 401
              : ['wrong-account', 'insufficient-scope', 'invalid-proof'].includes(refusal)
                ? 403
                : 409,
        { v: 1, kind: 'authorization-refused', refusal },
      );
    const path = request.url ?? '',
      json = jsonRoutes.get(path),
      binary = binaryRoutes.get(path);
    if (!json && !binary) return void send(404, { ok: false, refusal: 'not-found' });
    if (
      request.method !== 'POST' ||
      request.headers.host !== host ||
      request.headers.origin !== pin.origin ||
      request.headers['content-type'] !==
        (binary ? 'application/octet-stream' : 'application/json') ||
      request.headers['content-encoding']
    )
      return void send(403, { ok: false, refusal: 'malformed' });
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1];
    const isGrant = path.startsWith('/account/grant/v1/');
    if (!token) return void authFailure(isGrant ? 'access-required' : 'grant-required');
    const now = performance.now();
    budget = Math.min(120, budget + ((now - last) * 2) / 1000);
    last = now;
    if (active >= 16 || budget < 1) return void authFailure('capacity');
    active++;
    budget--;
    const timer = setTimeout(() => {
      response.destroy();
      request.destroy();
    }, 10000);
    timer.unref();
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > (binary ?? json)!.limit)
          return void send(413, { ok: false, refusal: 'malformed' });
        chunks.push(chunk);
      }
      let target: GrantScope | undefined;
      const authorize = core.grants.authorize(token);
      const authorization: OperationAuthorization = (db, value) => {
        const check = authorize(db, value);
        const { action: _action, ...scope } = value;
        target = scope;
        return check;
      };
      const bytes = Buffer.concat(chunks);
      if (binary) {
        const result = await binary.run(new Uint8Array(bytes), token, authorization);
        if (result.kind === 'decision') {
          if (target && path === '/account/delivery/submit') notifications?.committed(target);
          if (!response.destroyed && !response.writableEnded) {
            response.setHeader('Content-Type', 'application/octet-stream');
            response.writeHead(200).end(result.bytes);
          }
        } else send(409, { v: 1, kind: 'unknown', reason: result.reason });
      } else {
        let value: unknown;
        try {
          value = JSON.parse(bytes.toString('utf8'));
        } catch {
          return void send(400, { ok: false, refusal: 'malformed' });
        }
        const result = await json!.run(value, token, authorization);
        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
          if (isGrant && 'refusal' in result) authFailure(result.refusal as GrantRefusal);
          else send(409, result);
        } else {
          if (
            target &&
            (path === '/__account-setup/enrollment/admit' ||
              (value && typeof value === 'object' && 'action' in value && value.action !== 'read'))
          )
            notifications?.committed(target, path === '/__account-setup/content/checkpoint');
          send(200, result);
        }
      }
    } catch (cause) {
      if (cause instanceof AuthorizationRefused) authFailure(cause.refusal);
      else send(400, { ok: false, refusal: 'malformed' });
    } finally {
      clearTimeout(timer);
      active--;
      notifications?.reconcile();
    }
  };
}
