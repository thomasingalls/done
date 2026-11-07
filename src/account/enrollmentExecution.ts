/** UI effect boundaries only. Original native enrollment owners still verify every transition. */
import type { AccountWorkspaceOptions } from '../crdt/accountWorkspace';
import type { AccountAccess } from './accountHttp';
import type { DeviceRoster } from './deviceRoster';
import type { SyncRuntime } from '../crdt/accountSyncDriver';
import type { SetupWorkspacePort } from './setupWorkspace';
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
import type { CeremonyBrowser } from '../crdt/ceremonyBrowser';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
import { assertSlotPasskey } from './assertSlotPasskey';
import { authenticationResponse } from './passkeyResponse';
export interface EnrollmentWorkspaceOpened<W extends SetupWorkspacePort> {
  workspace: W;
  devices: DeviceRoster;
  sync?: SyncRuntime | undefined;
  accountId: string;
}
export interface EnrollmentWorkspaceExecution<W extends SetupWorkspacePort> {
  open(
    options: AccountWorkspaceOptions,
    access: AccountAccess,
    joined: boolean,
  ): Promise<EnrollmentWorkspaceOpened<W>>;
}
export type EnrollmentBrowser = Pick<CeremonyBrowser, 'authenticate' | 'assertSlot'>;
export type EnrollmentBrowserFactory = (
  signal: AbortSignal,
  guard: () => void,
) => EnrollmentBrowser;
export const pageEnrollmentWorkspace: EnrollmentWorkspaceExecution<AdmittedWorkspace> =
  Object.freeze({ open: openOwnedSyncingAccountWorkspace });
function pageBrowser(cancelled: string): EnrollmentBrowserFactory {
  return (signal, guard) => ({
    async authenticate(options, _scope) {
      const credential = (await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
          options as PublicKeyCredentialRequestOptionsJSON,
        ),
        signal,
      })) as PublicKeyCredential | null;
      guard();
      if (!credential) throw Error(cancelled);
      return authenticationResponse(credential);
    },
    assertSlot: assertSlotPasskey(signal),
  });
}
export const createPageDeviceEnrollmentBrowser = pageBrowser('Passkey cancelled');
export const createPageMembershipEnrollmentBrowser = pageBrowser('Passkey request cancelled');
