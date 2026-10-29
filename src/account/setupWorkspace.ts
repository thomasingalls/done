/** Setup uses only lifecycle/status plus display-name operations; no canonical document is copied. */
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
import type { AccountWorkspaceOptions } from '../crdt/accountWorkspace';
import type { AccountAccess } from './accountHttp';
import type { DeviceRoster } from './deviceRoster';
import type { SyncRuntime } from '../crdt/accountSyncDriver';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
export type SetupWorkspacePort = Pick<
  AdmittedWorkspace,
  'status' | 'onStatus' | 'close' | 'whenDurable'
>;
export interface SetupWorkspaceExecution<W extends SetupWorkspacePort> {
  open(
    options: AccountWorkspaceOptions,
    access: AccountAccess,
  ): Promise<{ workspace: W; devices: DeviceRoster; sync: SyncRuntime | undefined }>;
  actorName(workspace: W, actorId: string): string | undefined | Promise<string | undefined>;
  rename(workspace: W, actorId: string, name: string): Promise<void>;
  /** Display hint only; shutdown must not wait for a remote UI read. */
  closingName(workspace: W, actorId: string): string | undefined;
}
const pageActorName = (workspace: AdmittedWorkspace, actorId: string) =>
  workspace.read().actors.find((actor) => actor.id === actorId)?.name;
/** The original Page implementation. Its real admitted workspace remains the returned UI surface. */
export const pageSetupWorkspace: SetupWorkspaceExecution<AdmittedWorkspace> = Object.freeze<
  SetupWorkspaceExecution<AdmittedWorkspace>
>({
  open: openOwnedSyncingAccountWorkspace,
  actorName: pageActorName,
  closingName: pageActorName,
  async rename(workspace, _actorId, name) {
    await workspace.command({ kind: 'actor', patch: { name } }).accepted;
    await workspace.whenDurable();
  },
});
