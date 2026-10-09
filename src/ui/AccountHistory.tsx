import { useRef, useState } from 'react';
import type { DeviceRoster } from '../account/deviceRoster';
import type {
  HistoryMaintenanceCommand,
  HistoryMaintenanceStatus,
} from '../account/historyMaintenance';

/** Explicit admitted snapshots and covered service-history pruning. */
export function AccountHistory({ run }: { run: NonNullable<DeviceRoster['history']> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<HistoryMaintenanceStatus | null>(null);
  const [error, setError] = useState('');
  const flight = useRef(false);
  const act = async (command: HistoryMaintenanceCommand) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      setStatus(await run(command));
    } catch {
      setError(
        'History maintenance could not finish. Your writing and saved progress are kept. Check your connection, then check history or resume.',
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button className="menu-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        History maintenance
      </button>
      {open && (
        <section aria-label="History maintenance">
          <p className="menu-note">
            Save a verified encrypted snapshot of your account’s writing. If another approved device
            exists, use this action there too to verify it.
          </p>
          <p className="menu-note">
            After two snapshots are verified, you can remove older covered encrypted history from
            the service. The two latest snapshots and their remaining updates are kept.
          </p>
          {error && (
            <p className="menu-note" role="alert">
              {error}
            </p>
          )}
          {busy ? (
            <p className="menu-note" role="status">
              Checking and saving history…
            </p>
          ) : (
            status && (
              <p className="menu-note" role="status">
                {status.pruned
                  ? 'Covered service history removed. Two verified snapshots and their remaining updates are kept.'
                  : status.pending === 'none'
                    ? status.sequence
                      ? `Verified snapshot ${status.sequence} is saved.`
                      : 'No verified history snapshot yet.'
                    : status.pending === 'waiting'
                      ? 'Snapshot saved. Verify it from another approved device.'
                      : status.pending === 'verify'
                        ? 'A snapshot is ready for this device to verify.'
                        : status.pending === 'stale'
                          ? 'The account changed. Discard this unfinished snapshot before preparing another.'
                          : 'Saved snapshot progress is ready to resume.'}
              </p>
            )
          )}
          <button className="menu-button" disabled={busy} onClick={() => void act('inspect')}>
            Check history
          </button>
          {status?.pending === 'none' && (
            <button className="menu-button" disabled={busy} onClick={() => void act('create')}>
              Create history snapshot
            </button>
          )}
          {status?.pending === 'none' && status.sequence >= 2 && (
            <button className="menu-button" disabled={busy} onClick={() => void act('prune')}>
              Prune covered history
            </button>
          )}
          {status?.pending === 'verify' && (
            <button className="menu-button" disabled={busy} onClick={() => void act('verify')}>
              Verify history snapshot
            </button>
          )}
          {status?.pending === 'resume' && (
            <button className="menu-button" disabled={busy} onClick={() => void act('resume')}>
              Resume history snapshot
            </button>
          )}
          {status?.canDiscard && (
            <button className="menu-button" disabled={busy} onClick={() => void act('discard')}>
              Discard unfinished snapshot
            </button>
          )}
        </section>
      )}
    </>
  );
}
