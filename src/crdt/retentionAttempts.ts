import { withAccountProgressCustody } from './accountProgressCustody';
import { parseHistoryMaintenanceProgress } from '../account/historyMaintenance';
import { approvalProgress } from '../account/approvalProgress';
import { completedRetainedConnection } from '../account/membershipConnection';
import { archiveNativeRotation } from '../account/deviceRemovalVault';
import { same } from '../../account-protocol/admission';
import type { CustodyRecord } from './custodyRecord';
import type { SessionTask } from './writeSession';

/** Inspect authenticated retained attempts without changing them or borrowing a second permit. */
export async function retentionAttemptsSettled(
  task: SessionTask,
  kind: 'promotion' | 'joined',
  slotId: string,
  code: string,
  record: CustodyRecord,
) {
  for (const channel of ['history', 'approval', 'rotation'] as const) {
    if (!record[channel]) continue;
    const settled = await withAccountProgressCustody(
      task,
      kind,
      slotId,
      code,
      channel,
      async (owner) => {
        const raw = await owner.vault.load();
        if (raw === null) return true;
        if (channel === 'history') {
          const p = parseHistoryMaintenanceProgress(raw);
          return p.attempt === null && p.discard === null;
        }
        if (channel === 'rotation') {
          // A completed selected rotation is still needed for its old/new openers. Do not erase it.
          if (!record.active_rotation) return false;
          try {
            archiveNativeRotation(raw, record.active_rotation);
            return true;
          } catch {
            return false;
          }
        }
        const current = await approvalProgress(
          {
            load: async () => raw,
            save: async () => {
              throw Error('Read only');
            },
          },
          'membership',
        ).load();
        if (
          current !== null &&
          !(await completedRetainedConnection(current, {
            source: owner.source,
            participant: owner.vault.participant,
          }))
        )
          return false;
        const legacy =
          (raw as { kind?: string }).kind === 'membership-progress'
            ? (raw as { previous: unknown }).previous
            : raw;
        if (legacy === null) return true;
        const certification = (legacy as { content?: { certification?: unknown } }).content
          ?.certification;
        return (
          !!certification &&
          !!owner.proofs?.certification &&
          same(certification, owner.proofs.certification)
        );
      },
    );
    if (!settled) return false;
  }
  task.step(() => {});
  return true;
}
