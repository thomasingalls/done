/** Remembered routes and pending setup hints; no workspace or network authority. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { hex } from '../../account-protocol/recovery';
import type { PrivateAccess } from './privateAccess';
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
import type { StartupDisposition } from '../crdt/startupState';
import { isAccountId, type RememberedAccount } from './accountIdentity';
import {
  SETUP_DB,
  openSetupDB,
  withSetupMetadataLock,
  assertSetupNotRemoved,
  setupEpochKey,
  isSetupEpoch,
  SetupRetired,
} from './setupMetadata';
export { SETUP_DB } from './setupMetadata';
export type SetupConfig = {
  pin: AuthorityPin;
  readonly membershipContinuation?: boolean;
  readonly onMembershipContinuationChange?: (listener: () => void) => () => void;
} & ({ networkSessions: true; token?: never } | { networkSessions?: false; token: PrivateAccess });
export const isSetupSlot = (value: unknown): value is string =>
  value === 'local' || (typeof value === 'string' && /^account-[a-f0-9]{32}$/.test(value));
export const progressKey = (slotId: string) => {
  if (!isSetupSlot(slotId)) throw Error('Unknown account route');
  return slotId === 'local' ? 'current' : slotId;
};
export type Result =
  | {
      ok: true;
      stage: 'ceremony';
      operation: 'register' | 'confirm-registration';
      ceremonyId: string;
      options: unknown;
    }
  | { ok: true; stage: 'credential-confirmed'; accountId: string; credentialId: string };
export interface FinishRequest {
  retryKey: string;
  ceremonyId: string;
  operation: 'register' | 'confirm-registration';
  response: unknown;
}
export interface Retained {
  v: 1;
  pin: AuthorityPin;
  slotId: string;
  retryKey: string;
  view: Result | null;
  proof: FinishRequest | null;
  /** Presentation hint only. Opening always rechecks the signed marker and both factors. */
  connected?: true;
  /** Remembered display label, never an account selector or proof. */
  name?: string;
  /** User-requested initial name, applied once after authenticated account opening. */
  requestedName?: string;
  /** New empty workspace, created through the factor-confirmed Local genesis owner. */
  fresh?: true;
}
export type SetupState = (
  | {
      kind:
        | 'intro'
        | 'unlock'
        | 'resume-setup'
        | 'passkey'
        | 'confirm-passkey'
        | 'confirm-recovery'
        | 'name'
        | 'confirm-device-code';
      error?: string;
    }
  | { kind: 'save-recovery' | 'save-device-code'; code: string }
  | { kind: 'working'; message: string; detail?: string }
  | { kind: 'approve-passkey'; message: string; description: string }
  | { kind: 'storage-blocked'; disposition?: StartupDisposition; error?: string }
  | {
      kind: 'ready';
      workspace: AdmittedWorkspace;
      sync?: import('../crdt/accountSyncDriver').SyncRuntime | undefined;
      actorId: string;
      devices: import('./deviceRoster').DeviceRoster;
    }
) & {
  returning?: boolean;
  accountName?: string | undefined;
  accountId?: string | undefined;
  fresh?: boolean;
  requestedName?: string | undefined;
};

export const displayName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return;
  const name = value.trim();
  return name.length > 0 && name.length <= 80 && !/\p{Cc}/u.test(name) ? name : undefined;
};

/** Each coordinator keeps its epoch across async responses and explicit Start fresh elsewhere. */
export function createSetupProgress(slotId = 'local') {
  const key = progressKey(slotId);
  let epoch: string | null | undefined;
  return (value?: Retained | null): Promise<Retained | null> =>
    withSetupMetadataLock(slotId, async () => {
      if (value && value.slotId !== slotId) throw Error('Setup route mismatch');
      if (value !== undefined) await assertSetupNotRemoved(slotId);
      const db = await openSetupDB();
      try {
        return await new Promise<Retained | null>((resolve, reject) => {
          const tx = db.transaction('attempt', value === undefined ? 'readonly' : 'readwrite', {
            durability: 'strict',
          });
          const store = tx.objectStore('attempt');
          const fence = store.get(setupEpochKey(slotId));
          let failure: unknown,
            result: Retained | null = null;
          fence.onsuccess = () => {
            try {
              if (
                fence.result !== undefined &&
                (!isSetupEpoch(fence.result) || fence.result.slotId !== slotId)
              )
                throw Error('Setup removal epoch is unreadable');
              const current = fence.result?.epoch ?? null;
              if (epoch === undefined) epoch = current;
              else if (epoch !== current)
                throw new SetupRetired('This setup owner was retired by device removal');
              const request =
                value === undefined
                  ? store.get(key)
                  : value === null
                    ? store.delete(key)
                    : store.put(value, key);
              request.onsuccess = () => {
                result = value === undefined ? (request.result ?? null) : value;
              };
            } catch (cause) {
              failure = cause;
              tx.abort();
            }
          };
          tx.oncomplete = () => resolve(result);
          tx.onabort = () =>
            reject(failure ?? tx.error ?? Error('Setup progress could not be saved'));
          tx.onerror = () => {};
        });
      } finally {
        db.close();
      }
    });
}
/** One-shot metadata access; async ceremonies use a retained createSetupProgress owner. */
export const setupProgress = (value?: Retained | null, slotId = 'local') =>
  createSetupProgress(slotId)(value);
export const hasFirstDeviceSetup = async (slotId = 'local') =>
  (await setupProgress(undefined, slotId)) !== null;
/** Display only. It cannot open a slot or authorize registration, sign-in or writing. */
export const rememberedAccounts = async (pin: AuthorityPin): Promise<RememberedAccount[]> => {
  const db = await openSetupDB();
  let rows: { key: IDBValidKey; saved: Retained }[];
  try {
    rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('attempt');
      const store = tx.objectStore('attempt'),
        keys = store.getAllKeys(),
        values = store.getAll();
      tx.oncomplete = () =>
        resolve(values.result.map((saved, i) => ({ key: keys.result[i]!, saved })));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  const expectedPin = hex(pinBytes(parseAuthorityPin(pin)));
  return rows.flatMap(({ key, saved }) => {
    try {
      if (
        !saved ||
        saved.v !== 1 ||
        !isSetupSlot(saved.slotId) ||
        key !== progressKey(saved.slotId) ||
        hex(pinBytes(parseAuthorityPin(saved.pin))) !== expectedPin
      )
        return [];
      const id =
        saved.view?.stage === 'credential-confirmed' && isAccountId(saved.view.accountId)
          ? saved.view.accountId
          : undefined;
      const name = displayName(saved.name) ?? displayName(saved.requestedName);
      return [
        {
          slotId: saved.slotId,
          connected: saved.connected === true,
          fresh: saved.fresh === true,
          ...(id ? { id } : {}),
          ...(name ? { name } : {}),
        },
      ];
    } catch {
      return [];
    }
  });
};
export const randomCapability = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

/** Reserve one resumable new-account attempt, without touching any encrypted workspace. */
export async function beginNewAccount(input: SetupConfig): Promise<string> {
  const pin = parseAuthorityPin(input.pin);
  if (pin.origin !== location.origin) throw Error('Account service differs from this page');
  return navigator.locks.request(
    SETUP_DB,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw Error('An account is open in another tab. Close it before starting another account.');
      const pending = (await rememberedAccounts(pin)).find(
        (account) => account.fresh && !account.connected,
      );
      if (pending) return pending.slotId;
      const slotId = 'account-' + hex(crypto.getRandomValues(new Uint8Array(16)));
      if (await setupProgress(undefined, slotId)) throw Error('Account route is already in use');
      await setupProgress(
        { v: 1, pin, slotId, retryKey: randomCapability(), view: null, proof: null, fresh: true },
        slotId,
      );
      return slotId;
    },
  );
}
