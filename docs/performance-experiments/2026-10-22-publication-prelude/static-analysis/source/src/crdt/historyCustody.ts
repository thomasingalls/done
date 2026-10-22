/** Native compare-and-replace for history attempts under the existing exclusive slot permit. */
import { withAccountProgressCustody } from './accountProgressCustody';
import { same } from '../../account-protocol/admission';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { verifyEarlyHistory, historyMembership } from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import {
  parseHistoryMaintenanceProgress,
  type HistoryMaintenanceProgress,
} from '../account/historyMaintenance';
import type { SessionTask } from './writeSession';

export function withHistoryCustody<T>(
  task: SessionTask,
  kind: 'promotion' | 'joined',
  slotId: string,
  code: string,
  work: (owner: {
    authority: ReturnType<typeof historyMembership>;
    credentialId: string;
    sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
    load(): Promise<HistoryMaintenanceProgress | null>;
    replace(
      before: HistoryMaintenanceProgress | null,
      next: HistoryMaintenanceProgress,
    ): Promise<void>;
  }) => Promise<T>,
) {
  return withAccountProgressCustody(task, kind, slotId, code, 'history', async (source) => {
    const history = source.proofs
      ? (await verifyMembershipChain(source.proofs, source.base)).history
      : await verifyEarlyHistory(
          source.base,
          'successor' in source.state.marker! ? source.state.marker.successor?.artifact : null,
        );
    const authority = historyMembership(history),
      p = membershipState(authority);
    if (!p.certificate.members.some((m) => same(m, source.vault.participant)))
      throw Error('History custody requires the installed certified device');
    const check = (input: unknown) => {
      const value = parseHistoryMaintenanceProgress(input);
      if (
        value.workspaceId !== p.workspaceId ||
        value.lineageId !== p.lineageId ||
        value.credentialId !== source.credential
      )
        throw Error('History custody belongs to another owner');
      return value;
    };
    const load = async () => {
      task.step(() => {});
      const value = await source.vault.load();
      task.step(() => {});
      return value === null ? null : check(value);
    };
    return work({
      authority,
      credentialId: source.credential,
      sign: source.vault.sign,
      load,
      replace: async (before, next) => {
        const expected = before === null ? null : check(before),
          captured = check(next);
        if (!same(await load(), expected)) throw Error('History custody changed');
        await source.vault.save(captured, () => task.step(() => {}));
        if (!same(await load(), captured)) throw Error('History custody did not persist');
      },
    });
  });
}
