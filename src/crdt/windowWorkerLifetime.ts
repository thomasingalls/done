/** Native member release detects a killed dedicated Worker without port replies or polling. */
import { requireWindowWorkerCohort, type WindowAccountCohort } from './accountWorkerCohort';
import { cohortNames, inactive } from './nativeCoordination';
import { pageRuntimePorts } from './runtimePorts';
export async function watchWindowWorkerLifetime(
  cohort: WindowAccountCohort,
  retire: (released: boolean) => void,
) {
  requireWindowWorkerCohort(cohort);
  if (typeof retire !== 'function') throw inactive();
  const locks = pageRuntimePorts.lifetime.requireLocks(),
    names = cohortNames(cohort.ticket.slotId, cohort.ticket.incarnation),
    cancel = new AbortController();
  const held = (await locks.query()).held ?? [];
  requireWindowWorkerCohort(cohort);
  const members = held.filter((v) => v.name === names.member),
    client = members[0]?.clientId;
  if (
    members.length !== 1 ||
    members[0]?.mode !== 'exclusive' ||
    !client ||
    client === cohort.ticket.windowClient ||
    !held.some((v) => v.name === names.slot && v.mode === 'shared' && v.clientId === client)
  )
    throw inactive();
  const close = () => cancel.abort();
  cohort.signal.addEventListener('abort', close, { once: true });
  let settled: Promise<void>;
  try {
    settled = locks
      .request(names.member, { mode: 'exclusive', signal: cancel.signal }, () => {
        if (cancel.signal.aborted || cohort.state !== 'active') return;
        // This actual native grant proves the former exclusive member has released. Do not await
        // cohort.close here: that cleanup acquires this same member as its independent final barrier.
        retire(true);
      })
      .then(
        () => {},
        () => {
          if (!cancel.signal.aborted && cohort.state === 'active') retire(false);
        },
      )
      .finally(() => cohort.signal.removeEventListener('abort', close));
  } catch (cause) {
    cohort.signal.removeEventListener('abort', close);
    close();
    throw cause;
  }
  cohort.beforeRelease(() => settled);
  return Object.freeze({ close });
}
