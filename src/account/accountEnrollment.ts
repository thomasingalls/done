import {
  pageEnrollmentWorkspace,
  createPageDeviceEnrollmentBrowser,
  createPageMembershipEnrollmentBrowser,
  type EnrollmentWorkspaceExecution,
  type EnrollmentBrowserFactory,
} from './enrollmentExecution';
import type { SetupWorkspacePort } from './setupWorkspace';
import type { EnrollmentProgressListener } from '../lib/enrollmentProgress';
/** Route hints choose a coordinator; the native owner and signed chain still choose authority. */
import { parseMembershipInvitation } from '../../account-protocol/membershipLocator';
import { createDeviceEnrollmentCoordinator } from './deviceEnrollment';
import { createMembershipEnrollmentCoordinator } from './membershipEnrollment';
import { withMembershipVault } from './membershipVault';
import { hasJoinedAccount } from '../crdt/joinedAccount';
import type { SetupConfig } from './setupProgress';
import type { NetworkLogin } from './networkLogin';

export { isConnectionSlot } from './deviceConnectionRoutes';
import { isConnectionSlot } from './deviceConnectionRoutes';

export async function createAccountEnrollmentCoordinator<W extends SetupWorkspacePort>(
  execution: EnrollmentWorkspaceExecution<W>,
  deviceBrowser: EnrollmentBrowserFactory,
  membershipBrowser: EnrollmentBrowserFactory,
  config: SetupConfig,
  slotId: string,
  code: string,
  role: 'existing' | 'new',
  workspaceId?: string,
  invitation?: unknown,
  login?: NetworkLogin,
  signal: AbortSignal = new AbortController().signal,
  begin?: string,
  onProgress?: EnrollmentProgressListener,
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
    ? createMembershipEnrollmentCoordinator(
        execution,
        membershipBrowser,
        config,
        slotId,
        code,
        role,
        workspaceId,
        invitation,
        login,
        begin,
        onProgress,
      )
    : createDeviceEnrollmentCoordinator(
        execution,
        deviceBrowser,
        config,
        slotId,
        code,
        role,
        workspaceId,
        invitation,
        login,
      );
}

export async function createAccountEnrollment(
  config: SetupConfig,
  slotId: string,
  code: string,
  role: 'existing' | 'new',
  workspaceId?: string,
  invitation?: unknown,
  login?: NetworkLogin,
  signal: AbortSignal = new AbortController().signal,
  begin?: string,
  onProgress?: EnrollmentProgressListener,
) {
  return createAccountEnrollmentCoordinator(
    pageEnrollmentWorkspace,
    createPageDeviceEnrollmentBrowser,
    createPageMembershipEnrollmentBrowser,
    config,
    slotId,
    code,
    role,
    workspaceId,
    invitation,
    login,
    signal,
    begin,
    onProgress,
  );
}
