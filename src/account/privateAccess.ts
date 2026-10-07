import type { AuthorityPin } from '../../account-protocol/authority';

/** Private adapter access only; never an account session or proof of membership. */
export type PrivateAccess = string | ((refresh: boolean, signal: AbortSignal) => Promise<string>);
export const isPrivateAccess = (value: unknown): value is PrivateAccess =>
  typeof value === 'function' || (typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value));

export class PrivateServiceUnavailable extends Error {
  constructor() {
    super(
      'This step needs a connection to the account service. Your saved progress has been kept.',
    );
  }
}

/** Retry only an HTTP denial, once, with the identical already-prepared body. */
export async function privateServiceFetch(
  pin: AuthorityPin,
  access: PrivateAccess,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = new URL(path, pin.origin);
  if (url.origin !== pin.origin || !isPrivateAccess(access)) throw Error('Invalid private access');
  const signal = AbortSignal.any([
    ...(init.signal ? [init.signal] : []),
    AbortSignal.timeout(10000),
  ]);
  try {
    for (const refresh of [false, true]) {
      signal.throwIfAborted();
      const token = typeof access === 'string' ? access : await access(refresh, signal);
      signal.throwIfAborted();
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
        throw Error('Invalid private access');
      const headers = new Headers(init.headers);
      headers.set('Authorization', 'Bearer ' + token);
      const response = await fetch(url, {
        ...init,
        headers,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal,
      });
      if (response.status !== 403 || typeof access === 'string' || refresh) return response;
      await response.body?.cancel();
    }
  } catch (cause) {
    if (cause instanceof TypeError || (signal.aborted && !init.signal?.aborted))
      throw new PrivateServiceUnavailable();
    throw cause;
  }
  throw Error('Private access unavailable');
}
