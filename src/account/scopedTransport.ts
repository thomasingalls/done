import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import { closed, accountIdentifier } from '../../account-protocol/preparation';
import {
  grantActions,
  grantMessage,
  parseGrantScope,
  GRANT_CHALLENGE_MS,
  GRANT_LIFETIME_MS,
  type GrantScope,
  type GrantChallenge,
} from '../../account-protocol/scopedGrant';
import type { NetworkLogin } from './networkLogin';

export class NetworkSignInRequired extends Error {
  constructor(
    message = 'Reconnect sync with your account passkey to continue. Your progress is saved.',
  ) {
    super(message);
  }
}
export class NetworkAuthorityChanged extends Error {
  constructor() {
    super('Account authorization refused: authority-changed');
  }
}
export class NetworkThrottled extends Error {
  constructor() {
    super('The account service is busy. Saved progress can be retried.');
  }
}
type Login = Pick<NetworkLogin, 'authorization' | 'rejectAccess' | 'getSnapshot' | 'networkSignal'>;
export interface GrantBinding {
  login: Login;
  scope: GrantScope;
  sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
}
export interface ScopedAccess {
  readonly kind: 'scoped-account';
  readonly pin: AuthorityPin;
  fetch(path: string, init: RequestInit): Promise<Response>;
}
const notificationPath = '/account/notifications/v1/subscribe';
const routes: Record<string, GrantScope['kind']> = {
  '/account/delivery/submit': 'workspace',
  '/account/delivery/read': 'workspace',
  '/account/delivery/read-v2': 'workspace',
  '/account/authority/discover': 'workspace',
  '/account/membership/v2/discover': 'workspace',
  '/account/membership/v2/checkpoint': 'workspace',
  '/account/membership/v2/admit': 'enrollment',
  '/account/membership/v2/ceremony': 'enrollment',
  '/account/membership/v2/transfer': 'enrollment',
  '/__account-setup/authority/discover': 'workspace',
  '/__account-setup/content/checkpoint': 'workspace',
  '/__account-setup/enrollment/admit': 'enrollment',
  '/__account-setup/ceremony/exchange': 'enrollment',
  '/__account-setup/ceremony/transfer': 'enrollment',
};
async function smallBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw Error('Invalid authorization response');
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0,
    text = '';
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return text + decoder.decode();
      size += value.length;
      if (size > 4096) throw Error('Authorization response too large');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function refusal(value: unknown): string | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== 'authorization-refused'
  )
    return;
  const v = closed(value, ['v', 'kind', 'refusal']);
  if (v['v'] !== 1 || typeof v['refusal'] !== 'string')
    throw Error('Invalid authorization refusal');
  return v['refusal'];
}

/** One cache per unlocked runtime. The binding is supplied by its actual key/slot owner.
 * Only explicit authorization failures permit a bounded retry of the captured request bytes. */
export class ScopedTransport {
  readonly #pin: AuthorityPin;
  readonly #stop = new AbortController();
  readonly #fetch: typeof fetch;
  #cache = new Map<string, { token: string; expires: number }>();
  #flights = new Map<string, Promise<{ token: string; expires: number }>>();
  #parents = new Set<AbortSignal>();
  #retire = () => this.close();
  constructor(pin: AuthorityPin, signal: AbortSignal, transport: typeof fetch = fetch) {
    this.#pin = parseAuthorityPin(pin);
    if (this.#pin.origin !== location.origin) throw Error('Account service origin changed');
    this.#fetch = transport.bind(globalThis);
    if (signal.aborted) this.close();
    else signal.addEventListener('abort', () => this.close(), { once: true });
  }
  close() {
    this.#stop.abort();
    this.#cache.clear();
    this.#flights.clear();
    for (const signal of this.#parents) signal.removeEventListener('abort', this.#retire);
    this.#parents.clear();
  }
  bind(
    input: GrantBinding,
  ): ScopedAccess & { openNotifications(signal: AbortSignal): Promise<Response> } {
    const binding = { ...input, scope: parseGrantScope(input.scope) };
    if (input.login.networkSignal.aborted) this.close();
    else if (!this.#parents.has(input.login.networkSignal)) {
      this.#parents.add(input.login.networkSignal);
      input.login.networkSignal.addEventListener('abort', this.#retire, { once: true });
    }
    return Object.freeze({
      kind: 'scoped-account' as const,
      pin: { ...this.#pin },
      fetch: (path: string, init: RequestInit) => this.#request(binding, path, init),
      openNotifications: (signal: AbortSignal) =>
        this.#request(
          binding,
          notificationPath,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(binding.scope),
            signal,
          },
          true,
        ),
    });
  }
  async #post(
    path: string,
    body: string | Uint8Array<ArrayBuffer>,
    token: string,
    type: string,
    signal: AbortSignal,
  ) {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await this.#fetch(new URL(path, this.#pin.origin), {
        method: 'POST',
        headers: { 'Content-Type': type, Authorization: 'Bearer ' + token },
        body,
        signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
      if (signal.aborted) {
        await response.body?.cancel();
        signal.throwIfAborted();
      }
      if (response.status !== 429 || attempt >= 2) return response;
      const text = await smallBody(response, signal);
      if (refusal(JSON.parse(text)) !== 'capacity')
        return new Response(text, { status: response.status, headers: response.headers });
      // This explicit refusal has not executed the request. Retry its exact bytes, including
      // a grant finish proof, rather than creating another challenge or discarding a valid grant.
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          reject(signal.reason);
        };
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', abort);
            resolve();
          },
          1000 * (attempt + 1),
        );
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  async #acquire(
    binding: GrantBinding,
    auth: NonNullable<Awaited<ReturnType<Login['authorization']>>>,
    signal: AbortSignal,
  ) {
    const begin = await this.#post(
      '/account/grant/v1/begin',
      JSON.stringify(binding.scope),
      auth.token,
      'application/json',
      signal,
    );
    const value = JSON.parse(await smallBody(begin, signal));
    const denied = refusal(value);
    if (denied) throw new GrantDenied(denied);
    const v = closed(value, ['ok', 'stage', 'challenge']);
    if (!begin.ok || v['ok'] !== true || v['stage'] !== 'challenge')
      throw Error('Invalid grant challenge');
    const c = closed(v['challenge'], [
      'v',
      'pin',
      'accountId',
      'sessionId',
      'scope',
      'head',
      'actions',
      'challengeId',
      'expiresAt',
    ]) as unknown as GrantChallenge;
    if (
      JSON.stringify(parseAuthorityPin(c.pin)) !== JSON.stringify(this.#pin) ||
      c.accountId !== auth.accountId ||
      c.sessionId !== auth.sessionId ||
      JSON.stringify(parseGrantScope(c.scope)) !== JSON.stringify(binding.scope) ||
      c.expiresAt <= Date.now() ||
      c.expiresAt > Date.now() + GRANT_CHALLENGE_MS + 60000 ||
      JSON.stringify(c.actions) !== JSON.stringify(grantActions(binding.scope))
    )
      throw Error('Grant identity changed');
    const message = grantMessage(c);
    signal.throwIfAborted();
    const signature = await binding.sign(message);
    signal.throwIfAborted();
    const end = await this.#post(
      '/account/grant/v1/finish',
      JSON.stringify({ challengeId: c.challengeId, signature }),
      auth.token,
      'application/json',
      signal,
    );
    const result = JSON.parse(await smallBody(end, signal)),
      rejected = refusal(result);
    if (rejected) throw new GrantDenied(rejected);
    const r = closed(result, ['ok', 'stage', 'grantToken', 'expiresAt', 'scope']);
    if (
      !end.ok ||
      r['ok'] !== true ||
      r['stage'] !== 'granted' ||
      JSON.stringify(parseGrantScope(r['scope'])) !== JSON.stringify(binding.scope) ||
      !Number.isSafeInteger(r['expiresAt']) ||
      (r['expiresAt'] as number) <= Date.now() ||
      (r['expiresAt'] as number) > Date.now() + GRANT_LIFETIME_MS + 60000
    )
      throw Error('Invalid grant');
    return { token: accountIdentifier(r['grantToken']), expires: r['expiresAt'] as number };
  }
  async #request(
    binding: GrantBinding,
    path: string,
    init: RequestInit,
    streaming = false,
  ): Promise<Response> {
    if (
      (streaming ? path !== notificationPath : routes[path] !== binding.scope.kind) ||
      init.method !== 'POST'
    )
      throw Error('Wrong grant route');
    // Snapshot before any await: a retry must not observe caller mutation or rebuild a semantic write.
    const body =
      typeof init.body === 'string'
        ? init.body
        : init.body instanceof Uint8Array
          ? new Uint8Array(init.body)
          : null;
    const type = new Headers(init.headers).get('Content-Type');
    if (body === null || !['application/json', 'application/octet-stream'].includes(type ?? ''))
      throw Error('Unsupported grant request');
    // Streaming has a handshake deadline, not a total lifetime deadline. The caller and
    // login still own cancellation after headers arrive.
    const deadline = new AbortController();
    const handshake = streaming ? setTimeout(() => deadline.abort(), 10000) : undefined;
    const signal = AbortSignal.any([
      this.#stop.signal,
      binding.login.networkSignal,
      ...(init.signal ? [init.signal] : []),
      streaming ? deadline.signal : AbortSignal.timeout(10000),
    ]);
    let renewed = false,
      retried = false;
    try {
      for (;;) {
        signal.throwIfAborted();
        const auth = await binding.login.authorization();
        signal.throwIfAborted();
        if (!auth) {
          if (
            ['connect', 'reconnect', 'signed-out', 'sign-out-pending'].includes(
              binding.login.getSnapshot(),
            )
          )
            throw new NetworkSignInRequired();
          throw Error('Account connection unavailable');
        }
        const key = JSON.stringify([auth.accountId, auth.sessionId, binding.scope]);
        try {
          let grant = this.#cache.get(key);
          if (!grant || grant.expires <= Date.now() + 1000) {
            let pending = this.#flights.get(key);
            if (!pending) {
              pending = this.#acquire(binding, auth, signal);
              this.#flights.set(key, pending);
              void pending
                .finally(() => {
                  if (this.#flights.get(key) === pending) this.#flights.delete(key);
                })
                .catch(() => {});
            }
            grant = await pending;
            signal.throwIfAborted();
            // This owner uses at most enrollment and workspace scopes. Bound stale-session entries.
            if (this.#cache.size >= 4) this.#cache.delete(this.#cache.keys().next().value!);
            this.#cache.set(key, grant);
          }
          const response = await this.#post(path, body, grant.token, type!, signal);
          if (streaming && response.ok) {
            if (
              response.headers.get('Content-Type')?.split(';')[0] !== 'text/event-stream' ||
              !response.body
            ) {
              await response.body?.cancel();
              throw Error('Invalid notification stream');
            }
            return response;
          }
          if (response.ok || ![401, 403, 409, 429, 503].includes(response.status)) return response;
          const text = await smallBody(response, signal),
            reason = refusal(JSON.parse(text));
          if (!reason)
            return new Response(text, { status: response.status, headers: response.headers });
          // A late denial must not evict a different grant acquired by another request.
          if (reason !== 'capacity' && this.#cache.get(key)?.token === grant.token)
            this.#cache.delete(key);
          if (reason === 'grant-required' && !retried) {
            retried = true;
            continue;
          }
          throw new GrantDenied(reason);
        } catch (cause) {
          if (cause instanceof GrantDenied && cause.reason === 'access-required' && !renewed) {
            renewed = true;
            binding.login.rejectAccess(auth.token);
            continue;
          }
          if (cause instanceof GrantDenied && cause.reason === 'sign-in-required') {
            binding.login.rejectAccess(auth.token, true);
            throw new NetworkSignInRequired();
          }
          if (cause instanceof GrantDenied && cause.reason === 'authority-changed')
            throw new NetworkAuthorityChanged();
          if (cause instanceof GrantDenied && cause.reason === 'capacity')
            throw new NetworkThrottled();
          throw cause;
        }
      }
    } finally {
      clearTimeout(handshake);
      if (body instanceof Uint8Array) body.fill(0);
    }
  }
}
class GrantDenied extends Error {
  constructor(readonly reason: string) {
    super('Account authorization refused: ' + reason);
  }
}
