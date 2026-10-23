/** Setup lifecycle fencing only; these records never authorize opening or account mutations. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import { progressKey } from './setupProgress';
import {
  assertSetupNotRemoved,
  openSetupDB,
  SetupRetired,
  withSetupMetadataLock,
} from './setupMetadata';

export const RECOVERY_PREPARATION_DB = 'done.account-recovery-preparation.v1';
export const retainedRecoveryKey = (accountId: string, retryKey: string): IDBValidKey => [
  'retained-setup-recovery-v1',
  accountId,
  retryKey,
];

/** Never hold this metadata exclusion while acquiring a workspace permit. */
export function withSelectedSetupRecovery<T>(
  slotId: string,
  pin: AuthorityPin,
  accountId: string,
  retryKey: string,
  work: () => Promise<T>,
): Promise<T> {
  return withSetupMetadataLock(slotId, async () => {
    await assertSetupNotRemoved(slotId);
    const db = await openSetupDB();
    let saved: unknown;
    try {
      saved = await new Promise((resolve, reject) => {
        const tx = db.transaction('attempt', 'readonly');
        const request = tx.objectStore('attempt').get(progressKey(slotId));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    const value = saved as
      | {
          v?: unknown;
          slotId?: unknown;
          retryKey?: unknown;
          pin?: unknown;
          view?: { stage?: unknown; accountId?: unknown };
        }
      | undefined;
    let pinMatches = false;
    try {
      pinMatches = String(pinBytes(parseAuthorityPin(value?.pin))) === String(pinBytes(pin));
    } catch {
      /* Unreadable hints cannot extend a retired setup's lifetime. */
    }
    if (
      !value ||
      value.v !== 1 ||
      value.slotId !== slotId ||
      value.retryKey !== retryKey ||
      value.view?.stage !== 'credential-confirmed' ||
      value.view.accountId !== accountId ||
      !pinMatches
    )
      throw new SetupRetired(
        'This setup attempt was removed or replaced. Resume the selected workspace.',
      );
    return work();
  });
}
