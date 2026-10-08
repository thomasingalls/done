import type { SetupConfig } from './setupProgress';
import { privateServiceFetch, type PrivateAccess } from './privateAccess';

/** Type-compatible legacy seam; a session runtime can never acquire a private bearer. */
export const legacyAccess = (config: SetupConfig): PrivateAccess =>
  config.networkSessions
    ? async () => {
        throw Error('Private transport is disabled for this account service.');
      }
    : config.token;

const routes = new Set([
  'begin',
  'resume',
  'finish',
  'cancel',
  'authority/prove',
  'preparation/inspect',
  'preparation/abandon',
  'recovery/begin',
  'recovery/finish',
  'promotion/begin',
  'promotion/challenge',
  'promotion/finish',
  'promotion/binding',
  'ceremony/bootstrap',
  'membership/bootstrap',
  'enrollment/begin',
  'enrollment/finish',
]);
export function bootstrapFetch(config: SetupConfig, route: string, init: RequestInit) {
  if (!routes.has(route) || config.pin.origin !== location.origin)
    throw Error('Unsupported account bootstrap route');
  const path = '/__account-setup/' + route;
  if (!config.networkSessions) return privateServiceFetch(config.pin, config.token, path, init);
  return fetch(new URL(path, config.pin.origin), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(10000)]),
  });
}
