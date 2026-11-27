/** What the sync notice says about why a lane's last attempt got no result (phase 552). The code
 * chooses the sentence and nothing else. Only no usable answer says to check the connection; a
 * reason this version does not know says it is not a connection problem. Phase 551 sentences are
 * reused where the meaning is the same. */
import type { HistoryFailureCode } from '../account/historyFailureCodes';
import type { DeliveryRefusal, SyncRefusal } from '../account/syncRefusal';

const RETRY = 'This device will try again by itself.';
const NOT_CONNECTION = 'This is not a problem with your connection.';
const KEPT = 'Your writing on this device is kept.';
const RETRIED = `The account service did not accept the last attempt. ${NOT_CONNECTION} ${RETRY}`;
const VERSION = `The account service could not use a request from this version of the app. Updating the app may fix it. ${KEPT}`;
export const SYNC_REFUSAL_MESSAGES: Readonly<Record<DeliveryRefusal, string>> = {
  unreachable: `This device could not reach the account service. Check your connection. ${RETRY}`,
  timeout: `The account service did not answer in time. Check your connection. ${RETRY}`,
  'removal-pending': `This device is being removed from the account, so the account service no longer accepts its changes. ${NOT_CONNECTION} ${KEPT}`,
  'ledger-integrity': `The account service found a problem with its stored history and has paused changes until it is checked. ${NOT_CONNECTION} Nothing you do on this device will fix it. ${KEPT}`,
  'storage-unavailable': `The account service cannot save changes right now. ${NOT_CONNECTION} ${RETRY}`,
  'invalid-request': VERSION,
  'envelope-size': VERSION,
  'unsupported-epoch': RETRIED,
  'out-of-order': RETRIED,
  'parent-required': RETRIED,
  'unissued-parent': RETRIED,
  unavailable: RETRIED,
  'state-changed': RETRIED,
  refused: `The account service did not accept the last attempt, for a reason this version of the app does not know. ${NOT_CONNECTION} ${RETRY}`,
  unusable: `The account service’s answer could not be used. ${NOT_CONNECTION} ${RETRY}`,
  capacity: `The account service is busy. ${NOT_CONNECTION} ${RETRY}`,
  'access-refused':
    'The account service did not accept this device’s sign-in. Lock and reopen this workspace, then try again.',
  'authority-changed': 'Your account’s devices changed. This device will catch up by itself.',
  'login-disconnected': 'Sync is not connected. Reconnect sync under Account in the menu.',
};
/** A receive-path history failure keeps its phase 551 code and takes the sentence of the same
 * meaning; `null` says nothing (stopped, or the sign-in gate already shown). Others are retried. */
const HISTORY_MEANING: Partial<Record<HistoryFailureCode, DeliveryRefusal | null>> = {
  'history-unreachable': 'unreachable',
  'history-timeout': 'timeout',
  'history-stopped': null,
  'history-ledger-integrity': 'ledger-integrity',
  'history-storage-unavailable': 'storage-unavailable',
  'history-malformed': 'invalid-request',
  'history-capacity': 'capacity',
  'history-access-refused': 'access-refused',
  'history-authority-changed': 'authority-changed',
  'history-sync-disconnected': 'login-disconnected',
  'history-sign-in-required': null,
  'history-reply-unverified': 'unusable',
  'history-refused': 'refused',
};
export function syncRefusalMessage(refusal: SyncRefusal): string | undefined {
  if (Object.hasOwn(SYNC_REFUSAL_MESSAGES, refusal))
    return SYNC_REFUSAL_MESSAGES[refusal as DeliveryRefusal];
  const meaning = Object.hasOwn(HISTORY_MEANING, refusal)
    ? HISTORY_MEANING[refusal as HistoryFailureCode]
    : 'unavailable';
  return meaning ? SYNC_REFUSAL_MESSAGES[meaning] : undefined;
}
