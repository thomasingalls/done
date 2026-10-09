import { LOST_RECOVERY_REQUEST_LIMIT } from '../account-protocol/lostDeviceRecovery.ts';
/** Session-enabled development composition. Bootstrap proofs never bypass scoped content routes. */
import { NOTIFICATION_PATH, type AccountNotifications } from './notifications.ts';
import type { AccountCore } from './core.ts';
import type { PrivateAuthority } from './authority.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import { ADMISSION_LIMIT } from '../account-protocol/admission.ts';
import { ENROLLMENT_REQUEST_LIMIT } from '../account-protocol/enrollment.ts';
import { createScopedAccountHandler } from './scoped-http.ts';
import type { DevelopmentAccountHandler } from './development-http.ts';

export function createSessionAccountHandler(
  core: AccountCore,
  authority: PrivateAuthority,
  pin: AuthorityPin,
  notifications?: AccountNotifications,
): DevelopmentAccountHandler {
  const scoped = createScopedAccountHandler(core, authority, pin, notifications);
  // Every route here verifies its own fresh proof or retained attempt capability in the domain.
  // No protected workspace/enrollment operation may be added as a bootstrap alias.
  const routes = new Map<string, { limit: number; run: (v: unknown) => unknown }>([
    [
      'config',
      {
        limit: 64,
        run: () => ({
          v: 2,
          pin,
          networkSessions: true,
          ...(core.membershipContinuationEnabled ? { membershipContinuation: true } : {}),
        }),
      },
    ],
    ['authority/prove', { limit: 4096, run: (v) => authority.prove(v) }],
    ['begin', { limit: 131072, run: (v) => core.begin(v) }],
    ['resume', { limit: 4096, run: (v) => core.resume(v) }],
    ['finish', { limit: 131072, run: (v) => core.finish(v) }],
    ['cancel', { limit: 4096, run: (v) => core.cancel(v) }],
    ['preparation/inspect', { limit: ADMISSION_LIMIT, run: (v) => authority.pending(core, v) }],
    [
      'preparation/abandon',
      { limit: ADMISSION_LIMIT, run: (v) => authority.pending(core, v, true) },
    ],
    ['recovery/begin', { limit: 131072, run: (v) => core.beginRecovery(v) }],
    ['recovery/finish', { limit: 131072, run: (v) => core.finishRecovery(v) }],
    ['promotion/begin', { limit: ADMISSION_LIMIT, run: (v) => authority.beginPromotion(core, v) }],
    [
      'promotion/challenge',
      { limit: ADMISSION_LIMIT, run: (v) => authority.challengePromotion(core, v) },
    ],
    [
      'promotion/finish',
      { limit: ADMISSION_LIMIT, run: (v) => authority.finishPromotion(core, v) },
    ],
    [
      'promotion/binding',
      { limit: ADMISSION_LIMIT, run: (v) => authority.promotionBinding(core, v) },
    ],
    ['ceremony/bootstrap', { limit: 4096, run: (v) => authority.ceremonyBootstrap(core, v) }],
    [
      'enrollment/begin',
      { limit: ENROLLMENT_REQUEST_LIMIT, run: (v) => authority.enrollment(core, 'begin', v) },
    ],
    [
      'enrollment/finish',
      { limit: ENROLLMENT_REQUEST_LIMIT, run: (v) => authority.enrollment(core, 'finish', v) },
    ],
  ]);
  if (core.membershipContinuationEnabled)
    routes.set('membership/bootstrap', {
      limit: 4096,
      run: (v) => authority.membershipBootstrap(core, v),
    });
  if (core.membershipContinuationEnabled)
    for (const operation of ['begin', 'finish', 'resume', 'cancel'] as const)
      routes.set(`lost-recovery/${operation}`, {
        limit: LOST_RECOVERY_REQUEST_LIMIT,
        run: (v) => authority.lostDeviceRecovery(core, operation, v),
      });
  let active = 0,
    budget = 120,
    last = performance.now();
  return async (request, response, next) => {
    if (request.headers.host !== new URL(pin.origin).host) {
      response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    const path = request.url ?? '';
    if (notifications && path === NOTIFICATION_PATH) return notifications.handle(request, response);
    if (!path.startsWith('/__account-setup/') && !path.startsWith('/account/')) return next();
    const operation = routes.get(path.slice('/__account-setup/'.length));
    if (!path.startsWith('/__account-setup/') || !operation) return scoped(request, response);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, value: unknown) => {
      if (response.destroyed || response.writableEnded) return;
      if (status >= 400) response.setHeader('Connection', 'close');
      response.writeHead(status).end(JSON.stringify(value));
    };
    if (
      request.method !== 'POST' ||
      request.headers.origin !== pin.origin ||
      request.headers['content-type'] !== 'application/json' ||
      request.headers['content-encoding']
    )
      return void send(403, { ok: false, refusal: 'malformed' });
    const now = performance.now();
    budget = Math.min(120, budget + ((now - last) * 2) / 1000);
    last = now;
    if (active >= 16 || budget < 1) return void send(429, { ok: false, refusal: 'capacity' });
    active++;
    budget--;
    const timer = setTimeout(() => {
      response.destroy();
      request.destroy();
    }, 10000);
    timer.unref();
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > operation.limit) return void send(413, { ok: false, refusal: 'malformed' });
        chunks.push(chunk);
      }
      const result = await operation.run(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      send(
        result && typeof result === 'object' && 'ok' in result && result.ok === false ? 409 : 200,
        result,
      );
    } catch {
      send(400, { ok: false, refusal: 'malformed' });
    } finally {
      clearTimeout(timer);
      active--;
    }
  };
}
