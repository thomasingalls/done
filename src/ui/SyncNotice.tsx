import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SyncLane, SyncLaneStatus, SyncRuntime } from '../crdt/accountSyncDriver';
import type { NetworkLoginView } from '../crdt/accountSessionBridge';

const noLoginSubscription = () => () => {};
const noLoginSnapshot = () => undefined;

const lanes: SyncLane[] = ['send', 'receive'];
export function syncNeedsAttention(lane: SyncLaneStatus, online: boolean, now: number) {
  return (
    online &&
    lane.phase !== 'closed' &&
    lane.phase !== 'offline' &&
    lane.reason !== 'local-storage' &&
    lane.issueSince !== null &&
    now - lane.issueSince >= 30000
  );
}
const time = (at: number | null) =>
  at === null ? 'None since opening' : new Date(at).toLocaleTimeString();
const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
/** Named receive halt (phase 544); undefined keeps the general sentence. */
export function receiveHaltMessage(lane: SyncLaneStatus): string | undefined {
  const d = lane.reason === 'inbound-size' ? lane.detail : undefined;
  if (d?.cause !== 'history-snapshot') return undefined;
  const needed = mib(d.needed) === mib(d.allowed) ? `just over ${mib(d.allowed)}` : mib(d.needed);
  return `Changes from your other devices are not arriving here, because a history snapshot saved on the service needs ${needed} to install and this version installs snapshots of up to ${mib(d.allowed)}. Your writing on this device is kept.`;
}

/** This port can schedule retries, never change accepted positions or clear evidence. */
export function SyncNotice({
  sync,
  login,
  details = false,
}: {
  sync: SyncRuntime;
  login?: NetworkLoginView;
  details?: boolean;
}) {
  const status = useSyncExternalStore(sync.onStatus, () => sync.status);
  const loginStatus = useSyncExternalStore(
    login?.subscribe ?? noLoginSubscription,
    login?.getSnapshot ?? noLoginSnapshot,
  );
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setNow(Date.now());
    };
    // A status change can arrive after its deadline but after another lane's timer fired.
    // Refresh now as well; otherwise the later lane can remain hidden indefinitely.
    update();
    addEventListener('online', update);
    addEventListener('offline', update);
    const deadlines = lanes
      .map((name) => status[name].issueSince)
      .filter((at): at is number => at !== null && at + 30000 > Date.now());
    const timer = deadlines.length
      ? setTimeout(update, Math.min(...deadlines) + 30000 - Date.now())
      : undefined;
    return () => {
      clearTimeout(timer);
      removeEventListener('online', update);
      removeEventListener('offline', update);
    };
  }, [status]);
  const affected = lanes.filter((name) => syncNeedsAttention(status[name], online, now));
  const signInRequired = lanes.some((name) => status[name].reason === 'sign-in-required');
  if (!details && !affected.length) return null;
  return (
    <aside
      className={details ? 'sync-details' : 'sync-notice'}
      aria-label="Sync status"
      role={details ? undefined : 'status'}
    >
      {(details ? lanes : affected).map((name) => {
        const lane = status[name];
        const failed = lane.issueSince !== null && lane.reason !== 'local-storage';
        return (
          <div key={name}>
            <p>
              {details
                ? `${name === 'send' ? 'Sending' : 'Receiving'}: ${lane.phase}`
                : name === 'send'
                  ? 'Changes on this device are not reaching your other devices.'
                  : (receiveHaltMessage(lane) ??
                    'Changes from your other devices are not arriving here.')}
            </p>
            {details && receiveHaltMessage(lane) && (
              <p className="menu-note">{receiveHaltMessage(lane)}</p>
            )}
            <p className="menu-note">
              {name === 'send' ? 'Last accepted upload' : 'Last successful receive check'}:{' '}
              {time(lane.lastSuccessAt)}
            </p>
            {details && (
              <p className="menu-note">
                {name === 'send'
                  ? `Accepted position: ${status.send.acceptedThrough}`
                  : `Received positions: ${status.receive.receivedThrough}`}
              </p>
            )}
            {lane.reason && (
              <p className="menu-note">
                Reason:{' '}
                <code>
                  {name}:{lane.reason}
                </code>
              </p>
            )}
            {online && failed && lane.phase !== 'closed' && lane.reason !== 'sign-in-required' && (
              <button className="menu-button" onClick={() => sync.retry(name)}>
                Retry {name === 'send' ? 'sending' : 'receiving'}
              </button>
            )}
          </div>
        );
      })}
      {signInRequired && (
        <p className="menu-note">
          Sync needs an account passkey check. Your writing remains available offline.
        </p>
      )}
      {signInRequired && online && login && !details && (
        <button
          className="menu-button"
          disabled={connecting || loginStatus === 'connecting'}
          onClick={() => {
            setConnecting(true);
            setConnectionError(false);
            void login
              .connect()
              .catch(() => setConnectionError(true))
              .finally(() => setConnecting(false));
          }}
        >
          {connecting || loginStatus === 'connecting'
            ? 'Connecting sync…'
            : loginStatus === 'connect'
              ? 'Connect sync'
              : 'Reconnect sync'}
        </button>
      )}
      {connectionError && <p role="alert">Could not reconnect sync. Please try again.</p>}
    </aside>
  );
}
