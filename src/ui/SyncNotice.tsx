import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SyncLane, SyncLaneStatus, SyncRuntime } from '../crdt/accountSyncDriver';

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

/** This port can schedule retries, never change accepted positions or clear evidence. */
export function SyncNotice({ sync, details = false }: { sync: SyncRuntime; details?: boolean }) {
  const status = useSyncExternalStore(sync.onStatus, () => sync.status);
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setNow(Date.now());
    };
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
                  : 'Changes from your other devices are not arriving here.'}
            </p>
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
            {online && failed && lane.phase !== 'closed' && (
              <button className="menu-button" onClick={() => sync.retry(name)}>
                Retry {name === 'send' ? 'sending' : 'receiving'}
              </button>
            )}
          </div>
        );
      })}
    </aside>
  );
}
