import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  LocalRetentionDetail,
  LocalRetentionView,
  LocalRetentionStatus,
} from '../crdt/automaticLocalRetention';
import {
  estimateReduction,
  readableDuration,
  type LocalReductionFacts,
  type ReductionEstimate,
} from '../crdt/reductionProgress';

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
const pausedMessage =
  'Maintenance paused to let editing or sync finish. It will retry when this device is quiet.';
/** Phase 565: "about 10 seconds", "about 4 minutes", "about 3 hours"; never zero. */
export function aboutTime(milliseconds: number): string {
  const d = readableDuration(milliseconds);
  const unit = d.unit.slice(0, -1);
  return `about ${d.value} ${d.value === 1 ? unit : d.unit}`;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stepNames = {
  1: 'checking saved history',
  2: 'building the smaller history',
  3: 'saving the smaller history',
} as const;
/** The whole reduction's qualifier: it assumes quiet, and says whether waits are counted. */
function quietly(e: ReductionEstimate) {
  return e.waits === 'included'
    ? ' if this device stays quiet, counting pauses that let sync run'
    : e.waits === 'excluded'
      ? ' if this device stays quiet, not counting pauses that let sync run'
      : ' if this device stays quiet';
}
/** Phase 565: the sentences for a running reduction, a paused one, or one that finished. */
function reductionMessages(
  status: LocalRetentionStatus,
  facts: LocalReductionFacts,
  now: number,
): { readonly lines: readonly string[]; readonly estimate?: ReductionEstimate } {
  if (status.phase !== 'running') {
    if (facts.finishedAt !== undefined)
      return {
        lines: [
          `History on this device was reduced at ${new Date(facts.finishedAt).toLocaleTimeString(
            [],
            { hour: 'numeric', minute: '2-digit' },
          )}.`,
        ],
      };
    const e = estimateReduction(facts, false, now);
    const why =
      status.reason === 'preparation-saved'
        ? facts.online
          ? 'Maintenance saved its progress and paused to let sync run. It will continue when this device is quiet.'
          : 'Maintenance saved its progress. It will continue when this device is quiet.'
        : pausedMessage;
    const savedNote =
      e.saved !== undefined && e.saved > 0
        ? `${e.saved}% of checking is saved.`
        : !facts.saved
          ? 'No checking is saved yet.'
          : 'Some checking is saved.';
    const left =
      e.workLeft === undefined
        ? 'Estimating the work left…'
        : `${capital(aboutTime(e.workLeft))} of quiet still needed${
            e.waits === 'included'
              ? ', counting pauses that let sync run'
              : e.waits === 'excluded'
                ? ', not counting pauses that let sync run'
                : ''
          }.`;
    return {
      lines: [
        why,
        `Step 1 of 3. ${savedNote} ${left}`,
        ...(e.redo
          ? [`Some checking has to be redone: it went from ${e.redo.from}% back to ${e.redo.to}%.`]
          : []),
        ...(e.grew ? ['More history arrived, so there is more to check.'] : []),
      ],
      estimate: e,
    };
  }
  const e = estimateReduction(facts, true, now);
  const head = `Reducing saved history: step ${e.step} of 3, ${stepNames[e.step]}`;
  const headline =
    e.step === 1
      ? e.checked === undefined
        ? `${head} (pass ${e.pass}).`
        : `${head}. ${e.checked}% checked (pass ${e.pass}).`
      : `${head}.`;
  const time =
    e.stepLeft === undefined
      ? 'Estimating the time left…'
      : e.step === 3 || (e.allLeft !== undefined && aboutTime(e.allLeft) === aboutTime(e.stepLeft))
        ? `${capital(aboutTime(e.stepLeft))} left${quietly(e)}.`
        : e.allLeft === undefined
          ? `${capital(aboutTime(e.stepLeft))} left in this step; estimating the rest…`
          : `${capital(aboutTime(e.stepLeft))} left in this step, ${aboutTime(e.allLeft)} in all${quietly(e)}.`;
  return {
    lines: [
      `${headline} ${e.overrun ? 'This step is taking longer than expected. ' : ''}${time}`,
      ...(e.redo
        ? [`Some checking has to be redone: it went from ${e.redo.from}% back to ${e.redo.to}%.`]
        : []),
      ...(e.grew ? ['More history arrived, so there is more to check.'] : []),
    ],
    estimate: e,
  };
}
/** Re-renders a running reduction's estimate each second; reads nothing from the Worker. */
function useDisplayClock(active: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}
/** Refusals and failures keep their own sentences; the reduction's facts never replace them. */
const refused = (status: LocalRetentionStatus) =>
  status.phase === 'halted' ||
  ['capacity', 'durable-attempt', 'history-required', 'ineligible'].includes(status.reason ?? '');
/** Local technical history, distinct from admitted snapshots and pruning on the service. */
export function LocalHistoryMaintenance({
  runtime,
  status,
}: {
  runtime: LocalRetentionView;
  status: LocalRetentionStatus;
}) {
  // While running, only the active pass's facts: an attempt that has not reported yet still
  // carries the last pass's, which ended.
  const facts =
    status.reduction &&
    (status.phase === 'running'
      ? status.reduction.endedAt === undefined
      : !refused(status) &&
        (status.reduction.finishedAt === undefined
          ? status.reason !== undefined
          : status.reason === undefined))
      ? status.reduction
      : undefined;
  useDisplayClock(status.phase === 'running' && facts !== undefined);
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
  const stageMessage = progress
    ? progress.stage === 'opening' && progress.total
      ? `Reading saved history: ${progress.completed} of ${progress.total} records…`
      : stages[progress.stage]
    : 'Checking and reducing technical history on this device…';
  const message =
    status.phase === 'halted'
      ? 'Automatic maintenance stopped because a storage or verification check failed. Lock and reopen this workspace before trying again.'
      : status.phase === 'running'
        ? stageMessage
        : status.phase === 'waiting' && attention
          ? 'A history check is queued. It will wait until you stop editing and the retry delay has passed.'
          : status.reason === 'activity-or-journal'
            ? pausedMessage
            : status.reason === 'capacity'
              ? localHistoryCapacityMessage(status.detail)
              : status.reason === 'durable-attempt'
                ? localHistorySavedAttemptMessage
                : status.reason === 'history-required'
                  ? 'Some history needed for a safe reduction is unavailable. Your existing history is kept. Let sync finish before checking again.'
                  : status.reason === 'ineligible'
                    ? 'This device’s history is not ready for a safe reduction. Your existing history is kept. Let sync finish before checking again.'
                    : 'Automatic maintenance is on for this device. It reduces technical history while keeping your tasks and notes.';
  // Phase 565: a reduction with facts says where it is, how long it has left and what is saved.
  // The 'complete' stage keeps its sentence until the attempt settles.
  const reduced =
    facts && !(status.phase === 'running' && progress?.stage === 'complete')
      ? reductionMessages(status, facts, Date.now())
      : undefined;
  const e = reduced?.estimate;
  const overall =
    e === undefined
      ? undefined
      : status.phase !== 'running'
        ? e.saved === undefined
          ? undefined
          : { label: 'Saved history checked', value: e.saved, max: 100 }
        : e.step === 1
          ? e.checked === undefined
            ? undefined
            : { label: 'Saved history checked', value: e.checked, max: 100 }
          : { label: 'Reduction steps', value: e.step - 1, max: 3 };
  return (
    <section aria-label="History on this device">
      <h3 className="menu-subheading">History on this device</h3>
      <p
        className="menu-note"
        role={attention || status.phase === 'running' || reduced ? 'status' : undefined}
      >
        {reduced ? reduced.lines[0] : message}
      </p>
      {reduced?.lines.slice(1).map((line) => (
        <p className="menu-note" key={line}>
          {line}
        </p>
      ))}
      {overall ? (
        <progress
          className="menu-history-progress"
          aria-label={overall.label}
          value={overall.value}
          max={overall.max}
        />
      ) : (
        status.phase === 'running' &&
        progress && (
          <progress
            className="menu-history-progress"
            aria-label="Local history maintenance"
            {...(progress.stage === 'opening' && progress.total
              ? { value: progress.completed, max: progress.total }
              : {})}
          />
        )
      )}
      {reduced && status.phase === 'running' && <p className="menu-note">{stageMessage}</p>}
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
