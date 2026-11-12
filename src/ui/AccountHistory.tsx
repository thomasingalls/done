import { useRef, useState } from 'react';
import type { DeviceRoster } from '../account/deviceRoster';
import type {
  HistoryMaintenanceCommand,
  HistoryMaintenanceStatus,
  HistoryPositions,
  HistoryReplayRefused,
  HistorySnapshotTooLarge,
} from '../account/historyMaintenance';

const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
const count = (n: number) => n.toLocaleString('en-US');
const UNCHANGED = 'Your writing is unchanged.';
/** Plain sentence for a snapshot devices running this version cannot install (phase 544). */
export function historyTooLargeMessage(t: HistorySnapshotTooLarge, canDiscard: boolean) {
  const needed = mib(t.needed) === mib(t.allowed) ? `just over ${mib(t.allowed)}` : mib(t.needed);
  const sizes = `${needed}; this version installs snapshots of up to ${mib(t.allowed)}`;
  const unchanged = UNCHANGED;
  switch (t.snapshot) {
    case 'new':
      return `This workspace is too large for a history snapshot. Installing one on your other devices would take ${needed}, and this version installs snapshots of up to ${mib(t.allowed)}. Nothing was saved or sent. ${unchanged}`;
    case 'saved':
      return `The saved snapshot is too large for your other devices to install (${sizes}), so it was not sent. Discard it. ${unchanged}`;
    case 'pending':
      return `The snapshot waiting for verification is too large for devices to install (${sizes}), so it was not verified. ${canDiscard ? 'Discard it.' : 'It can be discarded from the device that made it.'} ${unchanged}`;
    case 'latest':
      return `The latest verified snapshot is too large for devices to install (${sizes}). Covered service history cannot be removed while it is the latest snapshot. ${unchanged}`;
  }
}

/** What discarding does and does not affect, shown wherever Discard is offered (phase 547). */
export const HISTORY_DISCARD_EFFECT =
  'Discarding removes only this unfinished snapshot. Your writing, verified snapshots and other devices’ snapshots are not affected.';
export const HISTORY_RACED_MESSAGE = `Another device made a snapshot while this one was being prepared, so this one was not saved or sent. ${UNCHANGED}`;

/** Positions accepted since the latest verified snapshot, against the replay bound (phase 547). */
export function historyPositionsMessage(p: HistoryPositions, verified: boolean) {
  const accepted = `The service has accepted ${count(p.since)} positions (uploads from your devices) ${verified ? 'since the last verified snapshot' : 'since this account began'}`;
  if (p.since > p.allowed)
    return `${accepted}, more than the ${count(p.allowed)} a snapshot can cover. No snapshot can be made, so older service history cannot be removed. ${UNCHANGED}`;
  // Past three quarters of the bound.
  if (p.since * 4 > p.allowed * 3)
    return `${accepted}. A snapshot can cover at most ${count(p.allowed)}, so make one soon: past that, no snapshot can be made and older service history can never be removed.`;
  return `${accepted}.`;
}

/** A snapshot this device would have to replay past the bound to make or verify (phase 547). */
export function historyReplayMessage(r: HistoryReplayRefused, canDiscard: boolean) {
  const limit = `a snapshot can replay at most ${count(r.allowed)}`;
  return r.snapshot === 'new'
    ? `Making a snapshot on this device would replay ${count(r.needed)} positions, and ${limit}. Nothing was saved or sent. ${UNCHANGED}`
    : `Verifying this snapshot on this device would replay ${count(r.needed)} positions, and ${limit}, so it was not verified. ${canDiscard ? 'Discard it.' : 'It can be discarded from the device that made it.'} ${UNCHANGED}`;
}

/** This device's own saved snapshot that no device has admitted (phase 547). One waiting for
 * verification keeps the earlier sentences: resuming it admits it on a single-device account. */
const savedMessages = {
  sendable:
    'This device has a saved snapshot that is not on the service. Resume to send it, or discard it.',
  blocked:
    'This device has a saved snapshot it cannot send, because another device’s snapshot is waiting for verification. Discard it here, then verify the other snapshot.',
  superseded:
    'This device has a saved snapshot that can no longer be sent, because the service has verified another snapshot since it was made. Discard it.',
  stale:
    'This device has a saved snapshot that can no longer be sent, because the account changed after it was made. Discard it.',
} as const;
const CANCELLING = `A snapshot discarded on this device still has to be cancelled on the service. Finish discarding. ${UNCHANGED}`;
const CANCEL_LATER =
  'A snapshot discarded on this device will be cancelled on the service once the other device’s snapshot is verified or discarded.';

function pendingMessage(status: HistoryMaintenanceStatus) {
  return status.pruned
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
            : 'Saved snapshot progress is ready to resume.';
}

/** Everything the view says about one status, in reading order. */
export function historyStatusMessage(status: HistoryMaintenanceStatus) {
  const parts: string[] = [];
  if (status.raced) parts.push(HISTORY_RACED_MESSAGE);
  const saved = status.saved;
  if (status.tooLarge) parts.push(historyTooLargeMessage(status.tooLarge, status.canDiscard));
  else if (status.replay) parts.push(historyReplayMessage(status.replay, status.canDiscard));
  else if (saved && saved !== 'cancelling' && saved !== 'waiting') parts.push(savedMessages[saved]);
  else if (saved === 'cancelling' && status.canDiscard) parts.push(CANCELLING);
  else {
    parts.push(pendingMessage(status));
    if (saved === 'cancelling') parts.push(CANCEL_LATER);
  }
  if (status.canDiscard && saved !== 'cancelling') parts.push(HISTORY_DISCARD_EFFECT);
  if (status.positions && !status.replay)
    parts.push(historyPositionsMessage(status.positions, status.sequence > 0));
  return parts.join(' ');
}

/** A saved snapshot of this device's own that resuming cannot send. */
const noResume = new Set(['blocked', 'superseded', 'stale', 'cancelling']);

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
  const pastBound = !!status?.positions && status.positions.since > status.positions.allowed;
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
                {historyStatusMessage(status)}
              </p>
            )
          )}
          <button className="menu-button" disabled={busy} onClick={() => void act('inspect')}>
            Check history
          </button>
          {status?.pending === 'none' &&
            !status.tooLarge &&
            status.replay?.snapshot !== 'new' &&
            !pastBound && (
              <button className="menu-button" disabled={busy} onClick={() => void act('create')}>
                Create history snapshot
              </button>
            )}
          {status?.pending === 'none' && status.sequence >= 2 && !status.tooLarge && (
            <button className="menu-button" disabled={busy} onClick={() => void act('prune')}>
              Prune covered history
            </button>
          )}
          {status?.pending === 'verify' &&
            !status.tooLarge &&
            status.replay?.snapshot !== 'pending' && (
              <button className="menu-button" disabled={busy} onClick={() => void act('verify')}>
                Verify history snapshot
              </button>
            )}
          {status?.pending === 'resume' &&
            status.tooLarge?.snapshot !== 'saved' &&
            !noResume.has(status.saved ?? '') && (
              <button className="menu-button" disabled={busy} onClick={() => void act('resume')}>
                Resume history snapshot
              </button>
            )}
          {status?.canDiscard && (
            <button className="menu-button" disabled={busy} onClick={() => void act('discard')}>
              {status.saved === 'cancelling' ? 'Finish discarding' : 'Discard unfinished snapshot'}
            </button>
          )}
        </section>
      )}
    </>
  );
}
