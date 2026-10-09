/** HTTP framing for the retained private development service; no listener or process ownership. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AccountCore } from './core.ts';
import type { PrivateAuthority } from './authority.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import { CONTENT_CHECKPOINT_LIMIT } from '../account-protocol/contentCheckpoint.ts';
import { CEREMONY_RELAY_LIMIT } from '../account-protocol/ceremonyRelay.ts';
import { CONTENT_DELIVERY_LIMIT } from '../account-protocol/contentDelivery.ts';
import { ENROLLMENT_REQUEST_LIMIT } from '../account-protocol/enrollment.ts';
import { ADMISSION_LIMIT } from '../account-protocol/admission.ts';
import {
  decodeSubmit,
  SUBMIT_BODY_LIMIT,
  READ_REQUEST_LIMIT,
} from '../account-protocol/deliveryTransport.ts';

export type DevelopmentAccountHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;
export function createDevelopmentAccountHandler(
  core: AccountCore,
  authority: PrivateAuthority,
  pin: AuthorityPin,
  token: string,
): DevelopmentAccountHandler {
  const { origin } = pin;
  const routes = new Map<string, (input: unknown) => unknown>([
    ['ceremony/bootstrap', (input) => authority.ceremonyBootstrap(core, input)],
    ['ceremony/exchange', (input) => authority.relayCeremony(core, input)],
    ['content/checkpoint', (input) => authority.exchangeCheckpoint(core, input)],
    ['ceremony/transfer', (input) => authority.transferContent(core, input)],
    ['authority/discover', (input) => authority.discoverAuthority(core, input)],
    ['enrollment/begin', (input) => authority.enrollment(core, 'begin', input)],
    ['enrollment/finish', (input) => authority.enrollment(core, 'finish', input)],
    ['enrollment/admit', (input) => authority.admitPrepared(core, input)],
    ['begin', (input) => core.begin(input)],
    ['resume', (input) => core.resume(input)],
    ['finish', (input) => core.finish(input)],
    ['cancel', (input) => core.cancel(input)],
    ['authority/prove', (input) => authority.prove(input)],
    ['preparation/inspect', (input) => authority.pending(core, input)],
    ['preparation/abandon', (input) => authority.pending(core, input, true)],
    ['recovery/begin', (input) => core.beginRecovery(input)],
    ['recovery/finish', (input) => core.finishRecovery(input)],
    ['promotion/begin', (input) => authority.beginPromotion(core, input)],
    ['promotion/challenge', (input) => authority.challengePromotion(core, input)],
    ['promotion/finish', (input) => authority.finishPromotion(core, input)],
    ['promotion/binding', (input) => authority.promotionBinding(core, input)],
  ]);
  type DeliveryResult =
    | ReturnType<PrivateAuthority['decideSubmission']>
    | ReturnType<PrivateAuthority['readAccepted']>
    | ReturnType<PrivateAuthority['readInbound']>;
  const deliveryRoutes = new Map<string, (body: Uint8Array<ArrayBuffer>) => DeliveryResult>([
    ['/account/delivery/submit', (body) => authority.decideSubmission(core, decodeSubmit(body))],
    ['/account/delivery/read', (body) => authority.readAccepted(core, body)],
    ['/account/delivery/read-v2', (body) => authority.readInbound(core, body)],
  ]);
  return async (request, response, next) => {
    if (request.headers.host !== new URL(origin).host) {
      response.writeHead(403).end();
      return;
    }
    const prefix = '/__account-setup/';
    const delivery = deliveryRoutes.get(request.url ?? '');
    const discovery = request.url === '/account/authority/discover';
    if (!delivery && !discovery && !request.url?.startsWith(prefix)) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) =>
      response.writeHead(status).end(JSON.stringify(body));
    if (['/__account-setup/config', '/__account-setup/access'].includes(request.url ?? '')) {
      // Private adapter bootstrap, not an account session. Like the dev shell, this
      // is available only at this loopback/Tailscale origin; no cross-origin grant.
      if (
        request.method !== 'POST' ||
        request.headers.origin !== origin ||
        request.headers['content-type'] !== 'application/json'
      )
        return void send(403, { ok: false, refusal: 'malformed' });
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 64) return void send(413, { ok: false, refusal: 'malformed' });
      }
      return void send(200, { v: 1, pin, ...(request.url!.endsWith('/access') ? { token } : {}) });
    }
    const supplied = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (
      request.method !== 'POST' ||
      request.headers.origin !== origin ||
      request.headers['content-type'] !==
        (delivery ? 'application/octet-stream' : 'application/json') ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
    ) {
      send(403, { ok: false, refusal: 'malformed' });
      return;
    }
    const route = delivery
      ? request.url!
      : discovery
        ? 'authority/discover'
        : request.url!.slice(prefix.length);
    const operation = routes.get(route ?? '');
    if (!delivery && !operation) return void send(404, { ok: false, refusal: 'malformed' });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (
          size >
          (delivery
            ? route === '/account/delivery/submit'
              ? SUBMIT_BODY_LIMIT
              : READ_REQUEST_LIMIT
            : route === 'content/checkpoint'
              ? CONTENT_CHECKPOINT_LIMIT
              : route.startsWith('promotion/')
                ? ADMISSION_LIMIT
                : route === 'ceremony/transfer'
                  ? CONTENT_DELIVERY_LIMIT
                  : route === 'ceremony/exchange'
                    ? CEREMONY_RELAY_LIMIT
                    : route === 'ceremony/bootstrap' ||
                        route === 'authority/discover' ||
                        route === 'enrollment/admit'
                      ? 4096
                      : route.startsWith('enrollment/')
                        ? ENROLLMENT_REQUEST_LIMIT
                        : 131072)
        ) {
          send(413, { ok: false, refusal: 'malformed' });
          return;
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (delivery) {
        const result = await delivery(new Uint8Array(bytes));
        if (result.kind === 'decision') {
          response.setHeader('Content-Type', 'application/octet-stream');
          response.writeHead(200).end(result.bytes);
        } else send(409, { v: 1, kind: 'unknown', reason: result.reason });
        return;
      }
      const result = await operation!(JSON.parse(bytes.toString('utf8')));
      send(
        result && typeof result === 'object' && 'ok' in result && result.ok === false ? 409 : 200,
        result,
      );
    } catch {
      send(400, { ok: false, refusal: 'malformed' });
    }
  };
}
