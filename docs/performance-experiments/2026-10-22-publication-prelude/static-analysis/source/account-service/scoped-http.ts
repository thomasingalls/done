import { HISTORY_EXCHANGE_LIMIT } from '../account-protocol/historyExchange.ts';
import { ROTATION_LIMIT } from '../account-protocol/rotation.ts';
import { MEMBERSHIP_PROOF_LIMIT } from '../account-protocol/membership.ts';
import { MEMBERSHIP_CHECKPOINT_REQUEST_LIMIT } from '../account-protocol/membershipCheckpoint.ts';
import { REPLACEMENT_TRANSFER_LIMIT } from '../account-protocol/replacementTransfer.ts';
/** Session/grant-protected routes. Bootstrap capabilities are composed separately;
 * there is no shared bearer fallback or /access endpoint here. */
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
import { ScopedRequestBudget } from './requestBudget.ts';
import { createBatchReadAdmission } from './batchReadAdmission.ts';
import {
  decodeInboundBatch,
  INBOUND_BATCH_REQUEST_LIMIT,
} from '../account-protocol/inboundBatch.ts';
import { readInboundBatch } from './inboundBatch.ts';

export function createScopedAccountHandler(
  core: AccountCore,
  authority: PrivateAuthority,
  inputPin: AuthorityPin,
  notifications?: AccountNotifications,
  budget = new ScopedRequestBudget(),
) {
  const pin = parseAuthorityPin(inputPin),
    host = new URL(pin.origin).host;
  const session = createSessionHandler(core.sessions, pin);
  const batchReads = createBatchReadAdmission();
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
  if (core.membershipContinuationEnabled) {
    jsonRoutes.set('/account/history/v1/checkpoint', {
      limit: HISTORY_EXCHANGE_LIMIT,
      run: (v, _token, auth) => authority.exchangeHistoryCheckpoint(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v3/checkpoint', {
      limit: REPLACEMENT_TRANSFER_LIMIT,
      run: (v, _token, auth) => authority.exchangeReplacementCheckpoint(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/removal/discover', {
      limit: 4096,
      run: (v, _token, auth) => authority.discoverRemoval(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/removal/prepare', {
      limit: 4096,
      run: (v, _token, auth) => authority.prepareRemoval(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/removal/commit', {
      limit: ROTATION_LIMIT,
      run: (v, _token, auth) => authority.commitRotation(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/checkpoint', {
      limit: MEMBERSHIP_CHECKPOINT_REQUEST_LIMIT,
      run: (v, _token, auth) => authority.readMembershipCheckpoint(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/admit', {
      limit: 4096,
      run: (v, _token, auth) => authority.admitMembership(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/cancel', {
      limit: 4096,
      run: (v, _token, auth) => authority.cancelMembership(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/ceremony', {
      limit: CEREMONY_RELAY_LIMIT,
      run: (v, _token, auth) => authority.relayMembershipCeremony(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/transfer', {
      limit: MEMBERSHIP_PROOF_LIMIT,
      run: (v, _token, auth) => authority.transferMembership(core, v, auth),
    });
    jsonRoutes.set('/account/membership/v2/discover', {
      limit: 4096,
      run: (v, _token, auth) => authority.discoverMembership(core, v, auth),
    });
  }
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
    [
      '/account/delivery/read-v2-batch',
      {
        limit: INBOUND_BATCH_REQUEST_LIMIT,
        run: (
          v: Uint8Array<ArrayBuffer>,
          _token: string,
          authorization: OperationAuthorization,
          started: () => void = () => {},
        ) =>
          readInboundBatch(v, (request, reuse) => {
            started();
            return authority.readInbound(core, request, authorization, reuse);
          }),
      },
    ],
  ]);
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
    // Budget identity comes from server-held access/grant state, never request fields.
    // This does not authorize the operation: its existing domain boundary still does that.
    const sessionKey = isGrant
      ? core.sessions.requestBudgetKey(token)
      : core.grants.requestBudgetKey(token);
    if (!sessionKey)
      return void authFailure(
        budget.invalid() ? (isGrant ? 'access-required' : 'grant-required') : 'capacity',
      );
    // One bounded HTTP body/response, at most one sequential inner read at a time.
    const reservation = budget.acquire(sessionKey);
    if (!reservation) return void authFailure('capacity');
    const batch = path === '/account/delivery/read-v2-batch';
    let started = 0;
    let releaseBatch: (() => void) | undefined;
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
      let changed = true;
      const authorize = core.grants.authorize(token);
      const authorization: OperationAuthorization = (db, value) => {
        const check = authorize(db, value);
        const { action: _action, ...scope } = value;
        target = scope;
        // Status catch-up can replay an already committed message. Observe its exact row
        // inside the domain transaction so a harmless retry cannot cause a hint/read loop.
        const table = {
          '/__account-setup/ceremony/exchange': 'content_ceremonies',
          '/__account-setup/ceremony/transfer': 'content_transfers',
          '/__account-setup/content/checkpoint': 'content_checkpoints',
          '/account/membership/v2/admit': 'membership_admissions',
          '/account/membership/v2/cancel': 'membership_cancellations',
          '/account/membership/v2/removal/prepare': 'removal_preparations',
          '/account/membership/v2/removal/commit': 'membership_rotations',
          '/account/membership/v2/ceremony': 'membership_ceremonies',
          '/account/membership/v2/transfer': 'membership_transfers',
          '/account/membership/v3/checkpoint': 'replacement_checkpoints',
          '/account/history/v1/checkpoint': 'history_checkpoint_catalog',
        }[path];
        if (!table) return check;
        const continuation =
          (table.startsWith('membership_') && table !== 'membership_rotations') ||
          table === 'replacement_checkpoints';
        if (continuation && scope.kind !== 'enrollment')
          throw new AuthorizationRefused('insufficient-scope');
        const row = () =>
          continuation && scope.kind === 'enrollment'
            ? db
                .prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND preparation_id=?`)
                .get(scope.workspaceId, scope.attemptId)
            : table === 'membership_rotations'
              ? db
                  .prepare(
                    'SELECT * FROM membership_rotations WHERE workspace_id=? ORDER BY epoch DESC LIMIT 1',
                  )
                  .get(scope.workspaceId)
              : db.prepare(`SELECT * FROM ${table} WHERE workspace_id=?`).get(scope.workspaceId);
        const before = row();
        return () => {
          check();
          const after = row();
          changed =
            before === undefined
              ? after !== undefined
              : after === undefined ||
                Object.keys(before).some((key) => before[key] !== after[key]);
        };
      };
      const bytes = Buffer.concat(chunks);
      if (binary) {
        if (batch) {
          // Framing supplies a work count, never authority. Reserve the entire actual
          // count before any native read; failed top-up retains only admission cost.
          const requests = decodeInboundBatch(new Uint8Array(bytes));
          try {
            releaseBatch = batchReads.acquire(sessionKey, bytes);
            if (!releaseBatch) throw new AuthorizationRefused('capacity');
            if (!reservation.reserveWork(requests.length))
              throw new AuthorizationRefused('capacity');
          } finally {
            for (const request of requests) request.fill(0);
          }
        } else started = 1;
        const result = await binary.run(
          new Uint8Array(bytes),
          token,
          authorization,
          () => started++,
        );
        if (result.kind === 'decision') {
          if (target && path === '/account/delivery/submit')
            notifications?.committed(target, false, true);
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
            changed &&
            (path === '/__account-setup/enrollment/admit' ||
              path === '/account/membership/v2/admit' ||
              path === '/account/membership/v2/cancel' ||
              path === '/account/membership/v2/removal/prepare' ||
              path === '/account/membership/v2/removal/commit' ||
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
      try {
        reservation.settleWork(started);
      } finally {
        try {
          releaseBatch?.();
        } finally {
          reservation();
        }
      }
      notifications?.reconcile();
    }
  };
}
