import { useEffect, useState, useSyncExternalStore } from 'react';
import { retrySessionSignOut, type LoginStatus } from '../account/networkLogin';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';
import type { AuthorityPin } from '../../account-protocol/authority';

const messages: Record<LoginStatus, string> = {
  closed: 'Workspace locked.',
  connect: 'Connect sync with your account’s passkey. Your writing is available offline.',
  reconnect: 'Reconnect sync with your account’s passkey. Your writing is available offline.',
  connecting: 'Connecting your account…',
  remembered: 'Account login remembered on this device.',
  disconnected: 'Network login is unavailable. Your writing remains available offline.',
  'storage-error':
    'Could not save network login changes. Your writing is still available; lock and reopen to retry.',
  'sign-out-pending':
    'Signed out here. Server sign-out is pending until a connection is available.',
  'signed-out': 'Signed out here.',
};
export function NetworkLoginNotice({
  login,
  close,
}: {
  login: NetworkLoginView;
  close: () => void;
}) {
  const status = useSyncExternalStore(login.subscribe, login.getSnapshot);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="menu-note" role="status">
        {messages[status]}
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
