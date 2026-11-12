import { useSyncExternalStore } from 'react';
import type {
  LocalRetentionDetail,
  LocalRetentionView,
  LocalRetentionStatus,
} from '../crdt/automaticLocalRetention';

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
      ['capacity', 'history-required', 'ineligible', 'durable-attempt'].includes(
        status.reason ?? '',
      ))
  );
}
const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
const kept = 'Your existing history is still in place.';
const recheck = 'It will check again after new writing or sync changes this device’s history.';
/** One sentence per known cause. Absent or unknown detail keeps the earlier general sentence. */
export function localHistoryCapacityMessage(detail: LocalRetentionDetail | undefined): string {
  const { needed, allowed } = detail ?? {};
  const sized = needed !== undefined && allowed !== undefined;
  const first = (() => {
    switch (detail?.cause) {
      case 'snapshot-size':
        return sized
          ? `The smaller history snapshot would need ${mib(needed)}, and this version saves snapshots of up to ${mib(allowed)}.`
          : 'The smaller history snapshot is larger than this version saves.';
      case 'snapshot-sources':
        return sized
          ? `More writing is waiting to be sent from this device than a smaller history snapshot can hold (${needed} batches; up to ${allowed}).`
          : 'More writing is waiting to be sent from this device than a smaller history snapshot can hold.';
      case 'snapshot-publishers':
        return sized
          ? `This workspace has more writing devices than a smaller history snapshot can record (${needed}; up to ${allowed}).`
          : 'This workspace has more writing devices than a smaller history snapshot can record.';
      case 'resume-progress':
        return sized
          ? `The progress this device saves to resume history maintenance is full (${mib(needed)}; up to ${mib(allowed)}).`
          : 'The progress this device saves to resume history maintenance is full.';
      case 'resume-index':
        return sized
          ? `The list of saved history maintenance progress is full (${mib(needed)}; up to ${mib(allowed)}).`
          : 'The list of saved history maintenance progress is full.';
      case 'resume-history':
        return allowed !== undefined
          ? `Saved history on this device is too large to mark a point where maintenance can resume (more than ${mib(allowed)}).`
          : 'Saved history on this device is too large to mark a point where maintenance can resume.';
      case 'installed-snapshot':
        return sized
          ? `A service history snapshot installed on this device needs ${mib(needed)} to check, and this version checks snapshots of up to ${mib(allowed)}.`
          : 'A service history snapshot installed on this device is larger than this version checks.';
      case 'interrupted':
        return undefined;
      default:
        return 'History maintenance reached a preparation or snapshot size limit.';
    }
  })();
  return first === undefined
    ? `History maintenance was interrupted by other work on this device and had no saved progress to resume from. ${kept} It will try again after new writing or sync changes this device’s history, or when you choose Check again.`
    : `${first} ${kept} ${recheck}`;
}
/** A saved account attempt (history snapshot, approval or rotation progress) blocks reduction
 * (phase 546). The owner does not say which channel, so the sentence names them as examples. */
export const localHistorySavedAttemptMessage = `An unfinished account step saved on this device, such as a service history snapshot, a device approval or a device removal, has to finish before history here can be reduced. ${kept} It will check again after new writing or sync changes this device’s history, or when you choose Check again.`;
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
              ? localHistoryCapacityMessage(status.detail)
              : status.reason === 'durable-attempt'
                ? localHistorySavedAttemptMessage
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
