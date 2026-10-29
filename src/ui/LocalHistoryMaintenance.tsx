import { useSyncExternalStore } from 'react';
import type { LocalRetentionView, LocalRetentionStatus } from '../crdt/automaticLocalRetention';

const absent = () => null;
const noSubscription = () => () => {};
export function useLocalHistoryStatus(runtime: LocalRetentionView | undefined) {
  return useSyncExternalStore(
    runtime?.onStatus ?? noSubscription,
    runtime ? () => runtime.status : absent,
  );
}
export function localHistoryNeedsAttention(status: LocalRetentionStatus | null) {
  return (
    status !== null &&
    status.phase !== 'closed' &&
    (status.phase === 'halted' ||
      ['capacity', 'history-required', 'ineligible'].includes(status.reason ?? ''))
  );
}
/** Local technical history, distinct from admitted snapshots and pruning on the service. */
export function LocalHistoryMaintenance({
  runtime,
  status,
}: {
  runtime: LocalRetentionView;
  status: LocalRetentionStatus;
}) {
  if (status.phase === 'closed') return null;
  const attention = localHistoryNeedsAttention(status);
  const progress = status.progress;
  const stages = {
    durability: 'Finishing saved writing before maintenance…',
    reading: 'Reading history saved on this device…',
    opening: 'Reading saved history…',
    verifying: 'Verifying saved history…',
    building: 'Building a smaller history snapshot…',
    coverage: 'Checking that the snapshot keeps all your writing…',
    current: 'Checking that your writing has not changed…',
    installing: 'Saving the smaller history…',
    readback: 'Checking the saved result…',
    complete: 'History on this device has been reduced.',
  };
  const message =
    status.phase === 'halted'
      ? 'Automatic maintenance stopped because a storage or verification check failed. Lock and reopen this workspace before trying again.'
      : status.phase === 'running'
        ? progress
          ? progress.stage === 'opening' && progress.total
            ? `Reading saved history: ${progress.completed} of ${progress.total} records…`
            : stages[progress.stage]
          : 'Checking and reducing technical history on this device…'
        : status.phase === 'waiting' && attention
          ? 'A history check is queued. It will wait until you stop editing and the retry delay has passed.'
          : status.reason === 'activity-or-journal'
            ? 'Maintenance paused to let editing or sync finish. It will retry when this device is quiet.'
            : status.reason === 'capacity'
              ? 'History could not be reduced because its replacement snapshot is too large. Your existing history is still in place.'
              : status.reason === 'history-required'
                ? 'Some history needed for a safe reduction is unavailable. Your existing history is kept. Let sync finish before checking again.'
                : status.reason === 'ineligible'
                  ? 'This device’s history is not ready for a safe reduction. Your existing history is kept. Let sync finish before checking again.'
                  : 'Automatic maintenance is on for this device. It reduces technical history while keeping your tasks and notes.';
  return (
    <section aria-label="History on this device">
      <h3 className="menu-subheading">History on this device</h3>
      <p
        className="menu-note"
        role={attention || status.phase === 'running' ? 'status' : undefined}
      >
        {message}
      </p>
      {status.phase === 'running' && progress && (
        <progress
          className="menu-history-progress"
          aria-label="Local history maintenance"
          {...(progress.stage === 'opening' && progress.total
            ? { value: progress.completed, max: progress.total }
            : {})}
        />
      )}
      {attention && status.phase !== 'halted' && (
        <button
          className="menu-button"
          disabled={status.phase === 'waiting' || status.phase === 'running'}
          onClick={() => runtime.retry()}
        >
          {status.phase === 'waiting' ? 'Check queued' : 'Check again'}
        </button>
      )}
    </section>
  );
}
