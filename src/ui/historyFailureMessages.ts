/** What each failure of a history command says (phase 551). The code chooses the sentence and
 * nothing else. Only a service that gave no usable answer says to check the connection; every
 * other sentence names the action, or says plainly that there is none. */
import type { HistoryFailureCode } from '../account/historyFailure';

const KEPT = 'Your writing and saved progress are kept.';
const NOT_CONNECTION = 'This is not a problem with your connection.';
const CANNOT_FIX = 'Nothing you do on this device will fix it.';
/** Unknown codes get the general sentence at the end. */
export const HISTORY_FAILURE_MESSAGES: Readonly<Record<HistoryFailureCode, string>> = {
  'history-unreachable': `History maintenance could not reach the account service. ${KEPT} Check your connection, then check history or resume.`,
  'history-timeout': `The account service did not answer in time. ${KEPT} Check your connection, then check history or resume.`,
  'history-stopped': `History maintenance stopped on this device before it finished. ${KEPT} Check history to see where it stands.`,
  'history-checkpoint-busy': `Another device’s snapshot is waiting for verification, so this one was not sent. ${KEPT} Check history to verify that snapshot first.`,
  'history-checkpoint-cancelled': `This snapshot was discarded earlier, so the service will not take it. Check history, discard it here too, then create a new one. Your writing is unchanged.`,
  'history-sources-changed': `Your account’s devices changed while this snapshot was made or verified, so the service did not accept it. ${KEPT} Check history to see what to discard or make next.`,
  'history-checkpoint-required': `The snapshot you were verifying is no longer waiting. ${KEPT} Check history to see where things stand.`,
  'history-admission-conflict': `Another device verified this snapshot first. ${KEPT} Check history.`,
  'history-checkpoint-conflict': `A different snapshot is waiting now. ${KEPT} Check history before trying again.`,
  'history-retention-boundary-changed': `A newer snapshot was verified since you checked, so nothing was removed. Check history, then prune covered history again.`,
  'history-source-unavailable': `History from a recently added or recovered device is not on the service yet. ${KEPT} Try again after your devices have synced.`,
  'history-state-changed': `The account changed while history maintenance ran. ${KEPT} Check history, then try again.`,
  'history-checkpoint-too-large': `The service refused a snapshot too large for your devices to install. Check history to see which one. Your writing is unchanged.`,
  'history-ledger-integrity': `The account service found a problem with its stored history and has paused changes until it is checked. ${NOT_CONNECTION} ${CANNOT_FIX} Your writing on this device is kept.`,
  'history-unavailable': `The account service could not finish history maintenance. ${NOT_CONNECTION} ${KEPT} Try again later.`,
  'history-invalid-proof': `The account service did not accept this device’s part in history maintenance. ${NOT_CONNECTION} ${CANNOT_FIX} ${KEPT}`,
  'history-malformed': `The account service could not use this request from this version of the app. Updating the app may fix it. ${KEPT}`,
  'history-not-found': `This account service does not offer history maintenance. ${CANNOT_FIX} ${KEPT}`,
  'history-sign-in-required': `Sync needs an account passkey check before history maintenance can continue. Choose Reconnect sync under Account in this menu, then try again. ${KEPT}`,
  'history-sync-disconnected': `Sync is not connected, so history maintenance could not start. ${KEPT} Check Account in this menu, reconnect sync if it is offered, then try again.`,
  'history-authority-changed': `Your account’s devices changed while history maintenance ran. ${KEPT} Check history again in a moment.`,
  'history-capacity': `The account service is busy. ${NOT_CONNECTION} ${KEPT} Try again in a minute.`,
  'history-storage-unavailable': `The account service cannot save changes right now. ${NOT_CONNECTION} ${KEPT} Try again later.`,
  'history-access-refused': `The account service did not accept this device’s sign-in. ${KEPT} Lock and reopen this workspace, then try again.`,
  'history-refused': `The account service did not accept this request. ${NOT_CONNECTION} ${KEPT} Check history, then try again.`,
  'history-reply-unverified': `The account service’s answer could not be checked, so nothing from it was used. ${NOT_CONNECTION} ${KEPT} Check history to try again; if this keeps happening, ${CANNOT_FIX.toLowerCase()}`,
  'history-advanced': `Another snapshot was saved while this one was being read. ${KEPT} Check history, then try again.`,
  'history-finish-saved': `This device has a saved snapshot to finish or discard first. ${KEPT} Check history to see it.`,
  'history-prune-unchanged': `Covered history can be removed once two snapshots are verified and unchanged. Check history to see where things stand.`,
  'history-not-producer': `Only the device that made this snapshot can discard it. Verify it here, or discard it on that device.`,
  'history-receive-pending': `Sync is finishing on this device. ${KEPT} Try again in a moment.`,
  'history-local-progress': `This device could not save its history progress. Your writing is kept. Lock and reopen this workspace, then check history.`,
  'history-failed': `History maintenance could not finish. ${KEPT} Check history, then try again.`,
};
/** The sentence for a failed history command: its code chooses one, and nothing else. */
export function historyFailureMessage(cause: unknown): string {
  const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : undefined;
  return typeof code === 'string' && Object.hasOwn(HISTORY_FAILURE_MESSAGES, code)
    ? HISTORY_FAILURE_MESSAGES[code as HistoryFailureCode]
    : HISTORY_FAILURE_MESSAGES['history-failed'];
}
