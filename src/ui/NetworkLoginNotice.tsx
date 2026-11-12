import { useEffect, useState, useSyncExternalStore } from 'react';
import { retrySessionSignOut, type LoginProblem, type LoginStatus } from '../account/networkLogin';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';
import type { AuthorityPin } from '../../account-protocol/authority';

const messages: Record<LoginStatus, string> = {
  closed: 'Workspace locked.',
  connect: 'Connect sync with your account’s passkey. Your writing is available offline.',
  reconnect: 'Reconnect sync with your account’s passkey. Your writing is available offline.',
  connecting: 'Connecting your account…',
  remembered: 'Account login remembered on this device.',
  disconnected:
    'Sync is not connected. Reconnect sync to try again. Your writing remains available offline.',
  'storage-error':
    'Could not save network login changes. Your writing is still available; lock and reopen to retry.',
  'sign-out-pending':
    'Signed out here. Server sign-out is pending until a connection is available.',
  'signed-out': 'Signed out here.',
};
/** Why sync could not connect, when the status alone does not say (phase 551). Only a service
 * that gave no usable answer says to check the connection. */
export const LOGIN_PROBLEM_MESSAGES: Readonly<Record<LoginProblem, string>> = {
  unreachable:
    'Sync could not reach the account service. Check your connection, then reconnect sync.',
  busy: 'The account service is busy, so sync could not connect. This is not a problem with your connection. Try Reconnect sync again in a minute.',
  unavailable:
    'The account service cannot save sign-ins right now, so sync could not connect. This is not a problem with your connection. Try again later.',
  outdated:
    'The account service could not use the sign-in request from this version of the app. Updating the app may fix it.',
  refused:
    'The account service did not accept this sign-in. This is not a problem with your connection. Try again later.',
};
const OFFLINE = 'Your writing remains available offline.';
/** The status sentence, or the reason the last attempt failed where Connect or Reconnect is offered. */
export function loginMessage(status: LoginStatus, problem: LoginProblem | undefined) {
  return problem && ['connect', 'reconnect', 'disconnected'].includes(status)
    ? `${LOGIN_PROBLEM_MESSAGES[problem]} ${OFFLINE}`
    : messages[status];
}
const noProblemSubscription = () => () => {};
const noProblem = () => undefined;
export function NetworkLoginNotice({
  login,
  close,
}: {
  login: NetworkLoginView;
  close: () => void;
}) {
  const status = useSyncExternalStore(login.subscribe, login.getSnapshot);
  const problem = useSyncExternalStore(
    login.getProblem ? login.subscribe : noProblemSubscription,
    login.getProblem ?? noProblem,
  );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="menu-note" role="status">
        {loginMessage(status, problem)}
      </p>
      {['connect', 'reconnect', 'disconnected'].includes(status) && (
        <button className="menu-button" disabled={busy} onClick={() => void login.connect()}>
          {status === 'connect' ? 'Connect sync' : 'Reconnect sync'}
        </button>
      )}
      <button
        className="menu-button"
        disabled={busy || status === 'closed'}
        onClick={() => {
          setBusy(true);
          setError('');
          void login
            .signOut()
            .then(close)
            .catch(() => {
              setError('Sign-out was not saved. Please retry.');
              setBusy(false);
            });
        }}
      >
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
/** Retried without reopening the factor-protected slot. Only revocation capabilities are read. */
export function SessionSignOutNotice({ pin }: { pin: AuthorityPin }) {
  const [status, setStatus] = useState('');
  useEffect(() => {
    const stop = new AbortController();
    let running = false,
      sawPending = false;
    const retry = async () => {
      if (running) return;
      running = true;
      try {
        await retrySessionSignOut(pin, stop.signal, undefined, (pending) => {
          if (stop.signal.aborted) return;
          if (pending) sawPending = true;
          setStatus(
            pending
              ? 'Signed out here. Server sign-out is pending until a connection is available.'
              : sawPending
                ? 'Server sign-out completed.'
                : '',
          );
        });
      } catch {
        if (!stop.signal.aborted) setStatus('Server sign-out could not be checked.');
      } finally {
        running = false;
      }
    };
    void retry();
    window.addEventListener('online', retry);
    return () => {
      stop.abort();
      window.removeEventListener('online', retry);
    };
  }, [pin]);
  return status ? (
    <p className="setup-note" role="status">
      {status}
    </p>
  ) : null;
}
