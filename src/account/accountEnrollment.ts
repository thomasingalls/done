/** Route hints choose a coordinator; the native owner and signed chain still choose authority. */
import { parseMembershipInvitation } from '../../account-protocol/membershipLocator';
import { createDeviceEnrollment } from './deviceEnrollment';
import { createMembershipEnrollment } from './membershipEnrollment';
import { withMembershipVault } from './membershipVault';
import { hasJoinedAccount } from '../crdt/joinedAccount';
import type { SetupConfig } from './setupProgress';
import type { NetworkLogin } from './networkLogin';

export const isConnectionSlot = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?:local|account-[a-f0-9]{32}|enrollment-[a-f0-9]{32})$/.test(value);

export async function createAccountEnrollment(
  config: SetupConfig,
  slotId: string,
  code: string,
  role: 'existing' | 'new',
  workspaceId?: string,
  invitation?: unknown,
  login?: NetworkLogin,
  signal: AbortSignal = new AbortController().signal,
) {
  if (!isConnectionSlot(slotId)) throw Error('Unknown device connection');
  signal.throwIfAborted();
  let continuation = false;
  if ((invitation as { v?: unknown } | undefined)?.v === 2) {
    parseMembershipInvitation(invitation);
    continuation = true;
  } else if (role === 'existing' || !(await hasJoinedAccount(slotId, code, signal))) {
    const kind = role === 'existing' && slotId.startsWith('enrollment-') ? 'joined' : 'promotion';
    continuation = await withMembershipVault(kind, slotId, code, signal, async (owner) => {
      const progress = await owner.load();
      if ((progress as { kind?: unknown } | null)?.kind === 'membership-connection') return true;
      return (
        role === 'existing' &&
        config.membershipContinuation === true &&
        owner.source.kind !== 'pending' &&
        !!owner.source.proofs
      );
    });
  }
  signal.throwIfAborted();
  return continuation
    ? createMembershipEnrollment(config, slotId, code, role, workspaceId, invitation, login)
    : createDeviceEnrollment(config, slotId, code, role, workspaceId, invitation, login);
}
