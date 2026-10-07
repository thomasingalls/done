import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import type { SetupConfig } from './firstDeviceSetup';
import type { PrivateAccess } from './privateAccess';

const PIN_KEY = 'done.account-service.pin.v1';
const LOCAL_ONLY_KEY = 'done.application.local-only';
const LIMIT = 8192;
const samePin = (a: AuthorityPin, b: AuthorityPin) => String(pinBytes(a)) === String(pinBytes(b));

async function readConfig(path: 'config' | 'access', signal: AbortSignal) {
  const response = await fetch('/__account-setup/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  if (path === 'config' && response.status === 404) return null;
  if (!response.ok || response.headers.get('content-type') !== 'application/json' || !response.body)
    throw Error('Account service unavailable');
  const reader = response.body.getReader();
  let text = '',
    length = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > LIMIT) throw Error('Invalid account service configuration');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const result = JSON.parse(text);
    const keys = path === 'config' ? ['pin', 'v'] : ['pin', 'token', 'v'];
    if (!result || result.v !== 1 || Object.keys(result).sort().join() !== keys.join())
      throw Error('Invalid account service configuration');
    const pin = parseAuthorityPin(result.pin);
    if (pin.origin !== location.origin) throw Error('Account service differs from this page');
    if (
      path === 'access' &&
      (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token))
    )
      throw Error('Invalid private access');
    return { pin, token: result.token as string | undefined };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** The saved public pin is a locator. Workspace owners still authenticate all saved authority. */
export async function loadPackagedConfig(): Promise<SetupConfig | null> {
  const retained = localStorage.getItem(PIN_KEY);
  let pin: AuthorityPin;
  if (retained !== null) pin = parseAuthorityPin(JSON.parse(retained));
  else {
    let config;
    try {
      config = await readConfig('config', AbortSignal.timeout(10000));
    } catch (cause) {
      // Only an installation previously served without an account service may
      // take this fallback. A retained account pin always wins above.
      if (localStorage.getItem(LOCAL_ONLY_KEY) === '1') return null;
      throw cause;
    }
    if (!config) {
      localStorage.setItem(LOCAL_ONLY_KEY, '1');
      return null;
    }
    pin = config.pin;
    localStorage.setItem(PIN_KEY, JSON.stringify(pin));
    localStorage.removeItem(LOCAL_ONLY_KEY);
  }
  if (pin.origin !== location.origin) throw Error('Account service differs from this page');
  let token: string | undefined;
  const access: PrivateAccess = async (refresh, signal) => {
    if (token && !refresh) return token;
    const current = await readConfig('access', signal);
    if (!current || !samePin(current.pin, pin)) throw Error('Account service identity changed');
    token = current.token!;
    return token;
  };
  return { pin, token: access };
}
