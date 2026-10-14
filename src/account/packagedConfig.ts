import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import type { SetupConfig } from './firstDeviceSetup';
import type { PrivateAccess } from './privateAccess';

const PIN_KEY = 'done.account-service.pin.v1';
const MODE_KEY = 'done.account-service.transport.v1';
const MEMBERSHIP_KEY = 'done.account-service.membership.v2';
const LOCAL_ONLY_KEY = 'done.application.local-only';
const LIMIT = 8192;
const samePin = (a: AuthorityPin, b: AuthorityPin) => String(pinBytes(a)) === String(pinBytes(b));

/** Presentation-only guard: never drop a known account into a newly created Local list. */
export async function hasSavedAccountEntry(): Promise<boolean> {
  if (localStorage.getItem(PIN_KEY) !== null) return true;
  const inspect = (name: string, store: string, accountOnly: boolean) =>
    new Promise<boolean>((resolve, reject) => {
      let absent = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        absent = true;
        request.transaction!.abort();
      };
      request.onerror = () => {
        if (absent) resolve(false);
        else reject(request.error);
      };
      request.onblocked = () => reject(Error('Saved workspace metadata is busy'));
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(store),
            read = tx.objectStore(store).getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(
              accountOnly
                ? read.result.some(
                    (row) =>
                      row?.unlockBinding || (typeof row?.id === 'string' && row.id !== 'local'),
                  )
                : read.result.length > 0,
            );
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        } catch (cause) {
          db.close();
          reject(cause);
        }
      };
    });
  return (
    (await inspect('done.first-device-setup.v1', 'attempt', false)) ||
    (await inspect('done.slots', 'slots', true))
  );
}

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
    const sessions = path === 'config' && result?.v === 2 && result.networkSessions === true;
    const membership = sessions && result.membershipContinuation === true;
    const keys = sessions
      ? [...(membership ? ['membershipContinuation'] : []), 'networkSessions', 'pin', 'v']
      : path === 'config'
        ? ['pin', 'v']
        : ['pin', 'token', 'v'];
    if (
      !result ||
      (!sessions && result.v !== 1) ||
      Object.keys(result).sort().join() !== keys.join()
    )
      throw Error('Invalid account service configuration');
    const pin = parseAuthorityPin(result.pin);
    if (pin.origin !== location.origin) throw Error('Account service differs from this page');
    if (
      path === 'access' &&
      (typeof result.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token))
    )
      throw Error('Invalid private access');
    return {
      pin,
      networkSessions: sessions,
      membershipContinuation: membership,
      token: result.token as string | undefined,
    };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** The saved public pin is a locator. Workspace owners still authenticate all saved authority. */
export async function loadPackagedConfig(): Promise<SetupConfig | null> {
  const retained = localStorage.getItem(PIN_KEY);
  // Older packaged builds retained only the pin. Their successor selects sessions without a
  // network wait; an old server then refuses network work instead of downgrading authentication.
  let networkSessions = localStorage.getItem(MODE_KEY) !== 'private';
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
    networkSessions = config.networkSessions;
    localStorage.setItem(MODE_KEY, networkSessions ? 'sessions' : 'private');
    localStorage.setItem(PIN_KEY, JSON.stringify(pin));
    localStorage.setItem(MEMBERSHIP_KEY, config.membershipContinuation ? '1' : '0');
    localStorage.removeItem(LOCAL_ONLY_KEY);
  }
  if (pin.origin !== location.origin) throw Error('Account service differs from this page');
  if (networkSessions) {
    let membershipContinuation = localStorage.getItem(MEMBERSHIP_KEY) === '1';
    // Public protocol selection is a hint, never account authority. Refresh without delaying
    // offline opening. Owners read the getter when discovering, so an already-open editor can
    // notice an upgraded host. Only a matching pinned service may update this hint.
    if (retained !== null)
      void readConfig('config', AbortSignal.timeout(10000))
        .then((current) => {
          if (!current || !current.networkSessions || !samePin(current.pin, pin)) return;
          membershipContinuation = current.membershipContinuation;
          localStorage.setItem(MEMBERSHIP_KEY, membershipContinuation ? '1' : '0');
        })
        .catch(() => {
          /* Keep offline opening independent of service availability. */
        });
    return {
      pin,
      networkSessions: true,
      get membershipContinuation() {
        return membershipContinuation;
      },
    };
  }
  let token: string | undefined;
  const access: PrivateAccess = async (refresh, signal) => {
    if (token && !refresh) return token;
    const configuration = await readConfig('config', signal);
    if (!configuration || !samePin(configuration.pin, pin))
      throw Error('Account service identity changed');
    if (configuration.networkSessions) {
      localStorage.setItem(MODE_KEY, 'sessions');
      throw Error('Account service upgraded. Lock and reopen to connect sync.');
    }
    const current = await readConfig('access', signal);
    if (!current || !samePin(current.pin, pin)) throw Error('Account service identity changed');
    token = current.token!;
    return token;
  };
  return { pin, token: access };
}
